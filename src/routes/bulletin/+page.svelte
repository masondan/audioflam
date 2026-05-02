<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { bulletinStore, getStorySource } from '$lib/stores/bulletin';
  import type { BulletinStory } from '$lib/stores/bulletin';
  import { ALL_VOICES, preloadedTTSAudio } from '$lib/stores';
  import type { VoiceOption, TTSProvider } from '$lib/stores';
  import { concatenateAudioSegments, removeSilence } from '$lib/audioProcessing';
  import type { SilenceLevel } from '$lib/audioProcessing';
  import { timeStretch, audioBufferToWav } from '$lib/utils/timestretch';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';
  import PlayButton from '$lib/components/PlayButton.svelte';
  import BulletinStoryCard from '$lib/components/bulletin/BulletinStoryCard.svelte';
  import BulletinIntroOutroCard from '$lib/components/bulletin/BulletinIntroOutroCard.svelte';
  import BulletinSoundsCard from '$lib/components/bulletin/BulletinSoundsCard.svelte';
  import BulletinAdjustVoiceCard from '$lib/components/bulletin/BulletinAdjustVoiceCard.svelte';
  import BulletinStoryDrawer from '$lib/components/bulletin/BulletinStoryDrawer.svelte';

  // Trigger localStorage initialisation on mount
  onMount(() => {
    const unsub = bulletinStore.subscribe(() => {});
    unsub();
  });

  // ─── Helper: Get voice provider ────────────────────────────────────────────

  function getVoiceProvider(voiceName: string | null): TTSProvider {
    return ALL_VOICES.find(v => v.name === voiceName)?.provider ?? 'azure';
  }

  // ─── Derived state from store ──────────────────────────────────────────────

  let stories = $derived($bulletinStore.stories);
  let selectedVoiceName = $derived($bulletinStore.selectedVoice);
  let bulletinAudio = $derived($bulletinStore.bulletinAudio);

  // Resolve voice name → VoiceOption object for VoiceDropdown
  const selectedVoiceObj = $derived(
    ALL_VOICES.find(v => v.name === selectedVoiceName) ?? null
  );

  // ─── Bulletin playback state ───────────────────────────────────────────────

  let isGenerating = $state(false);
  let isPlaying = $state(false);
  let generateError = $state('');
  let bulletinAudioElement = $state<HTMLAudioElement | null>(null);
  let currentTime = $state(0);
  let duration = $state(0);
  let isDraggingProgress = $state(false);

  // Derived PlayButton state — matches TTS tab pattern
  const playButtonState = $derived(
    isGenerating ? 'loading'
    : isPlaying   ? 'playing'
    : (bulletinAudio || stories.length > 0) ? 'active'
    : 'inactive'
  );

  // ─── Drawer state ──────────────────────────────────────────────────────────

  let drawerOpen = $state(false);
  let drawerStory = $state<BulletinStory | null>(null);  // null = new story mode

  // ─── Clear modals ──────────────────────────────────────────────────────────

  let clearStoriesModalOpen = $state(false);
  let clearAllModalOpen = $state(false);

  function handleAddStory() {
    drawerStory = null;
    drawerOpen = true;
  }

  function handleEditStory(story: BulletinStory) {
    drawerStory = story;
    drawerOpen = true;
  }

  function handleDrawerClose() {
    drawerOpen = false;
    drawerStory = null;
    // Editing a story invalidates any assembled bulletin audio
    bulletinStore.clearBulletinAudio();
    stopBulletinAudio();
  }

  // ─── Voice change ──────────────────────────────────────────────────────────

  function handleVoiceChange(voice: VoiceOption) {
    bulletinStore.update(s => ({ ...s, selectedVoice: voice.name }));
    // Changing voice invalidates assembled audio
    bulletinStore.clearBulletinAudio();
    stopBulletinAudio();
  }

  // ─── Story reorder ─────────────────────────────────────────────────────────

  function handleMoveUp(index: number) {
    if (index === 0) return;
    bulletinStore.reorderStories(index, index - 1);
    bulletinStore.clearBulletinAudio();
    stopBulletinAudio();
  }

  function handleMoveDown(index: number) {
    if (index === stories.length - 1) return;
    bulletinStore.reorderStories(index, index + 1);
    bulletinStore.clearBulletinAudio();
    stopBulletinAudio();
  }

  // ─── Story preview (single story TTS) ───────────────────────────────────────

  let previewAudioElement = $state<HTMLAudioElement | null>(null);

  async function handlePreviewStory(story: BulletinStory): Promise<HTMLAudioElement | null> {
    const text = getStorySource(story);
    if (!text.trim()) return null;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceName: selectedVoiceName,
          provider: getVoiceProvider(selectedVoiceName),
        }),
      });

      if (!response.ok) throw new Error('TTS failed');
      const { audioContent } = await response.json();

      // Stop any existing preview audio
      if (previewAudioElement) {
        previewAudioElement.pause();
      }

      // Create and play new preview audio
      const blob = base64ToBlob(audioContent, 'audio/mp3');
      const url = URL.createObjectURL(blob);
      previewAudioElement = new Audio(url);
      previewAudioElement.play();
      
      return previewAudioElement;
    } catch (e) {
      console.error('[Bulletin] Preview TTS error:', e);
      return null;
    }
  }

  function handlePreviewStop() {
    if (previewAudioElement) {
      previewAudioElement.pause();
      previewAudioElement = null;
    }
  }

  // ─── Audio helpers ─────────────────────────────────────────────────────────

  function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteChars = atob(base64);
    const byteNumbers = Array.from(byteChars, c => c.charCodeAt(0));
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function decodeAudioBase64(base64Audio: string): Promise<AudioBuffer> {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioContext = new AudioContext();
    try {
      return await audioContext.decodeAudioData(bytes.buffer);
    } finally {
      await audioContext.close();
    }
  }

  /**
   * Apply speed and silence adjustments to a base64 audio segment.
   * Mirrors the same logic in BulletinIntroOutroCard.processAudioSegment().
   */
  async function processAudioSegment(
    base64Audio: string,
    speed: number,
    silenceLevel: SilenceLevel
  ): Promise<string> {
    let processed = base64Audio;

    if (speed !== 1.0) {
      try {
        const buffer = await decodeAudioBase64(processed);
        const stretched = await timeStretch(buffer, speed);
        const blob = audioBufferToWav(stretched);
        processed = await blobToBase64(blob);
      } catch (e) {
        console.error('[Bulletin] Speed adjustment failed:', e);
      }
    }

    if (silenceLevel !== 'default') {
      try {
        const result = await removeSilence(processed, silenceLevel);
        processed = await blobToBase64(result.blob);
      } catch (e) {
        console.error('[Bulletin] Silence removal failed:', e);
      }
    }

    return processed;
  }

  /** Fetch an MP3 from /sounds/ and return its base64 string */
  async function loadSoundAsBase64(filename: string): Promise<string> {
    const response = await fetch(`/sounds/${filename}`);
    if (!response.ok) throw new Error(`Failed to load sound: ${filename}`);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Generate raw TTS for a single story via /api/tts (speed/silence applied separately at assembly time) */
  async function generateStoryTTS(story: BulletinStory): Promise<string> {
    const text = getStorySource(story);
    if (!text.trim()) throw new Error(`Story ${story.id} has no text`);

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: selectedVoiceName,
        provider: getVoiceProvider(selectedVoiceName),
      }),
    });

    if (!response.ok) throw new Error(`TTS failed for story ${story.id}`);
    const { audioContent } = await response.json();
    return audioContent as string;
  }

  function stopBulletinAudio() {
    if (bulletinAudioElement) {
      bulletinAudioElement.pause();
      bulletinAudioElement.currentTime = 0;
      bulletinAudioElement = null;
    }
    isPlaying = false;
  }

  // Reset playback position whenever the assembled audio is invalidated
  $effect(() => {
    if (!bulletinAudio && bulletinAudioElement) {
      bulletinAudioElement.pause();
      bulletinAudioElement.currentTime = 0;
      bulletinAudioElement = null;
      isPlaying = false;
    }
  });

  // ─── Generate bulletin ─────────────────────────────────────────────────────

  /**
   * Assembly order (per plan):
   * [intro sound] → [intro TTS] → [transition] → [story1] → [transition] →
   * [story2] → ... → [storyN] → [transition] → [outro TTS] → [outro sound]
   */
  async function generateBulletin() {
    if (stories.length === 0) return;
    if (!selectedVoiceName) return;

    isGenerating = true;
    generateError = '';
    stopBulletinAudio();

    try {
      const state = $bulletinStore;
      const segments: string[] = [];

      // ── 1. Intro sound ────────────────────────────────────────────────────
      if (state.soundsEnabled && state.selectedIntroOutroSound) {
        console.log('[Bulletin] Loading intro sound:', state.selectedIntroOutroSound);
        const soundBase64 = await loadSoundAsBase64(state.selectedIntroOutroSound);
        segments.push(soundBase64);
      }

      // ── 2. Intro TTS ──────────────────────────────────────────────────────
      if (state.introOutroEnabled && state.introScript.trim()) {
        let introAudio = state.introTtsAudio;
        if (!introAudio) {
          console.log('[Bulletin] Generating intro TTS');
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: state.introScript,
              voiceName: state.introOutroVoice || selectedVoiceName,
              provider: getVoiceProvider(state.introOutroVoice || selectedVoiceName),
            }),
          });
          if (!response.ok) throw new Error('Intro TTS failed');
          const data = await response.json();
          introAudio = data.audioContent as string;
          // Cache raw TTS (before speed/silence) so we can reuse it
          bulletinStore.update(s => ({ ...s, introTtsAudio: introAudio }));
        }
        // Apply speed/silence adjustments at assembly time
        const processedIntro = await processAudioSegment(introAudio, state.introOutroSpeed, state.introOutroSilence);
        segments.push(processedIntro);
      }

      // ── 3–N. Stories with transition sounds between them ──────────────────
      const updatedStories: BulletinStory[] = [...state.stories];

      for (let i = 0; i < updatedStories.length; i++) {
        // Transition sound before each story (including before story 1 if intro exists)
        if (state.soundsEnabled && state.selectedTransitionSound) {
          console.log('[Bulletin] Loading transition sound for story', i + 1);
          const transBase64 = await loadSoundAsBase64(state.selectedTransitionSound);
          segments.push(transBase64);
        }

        // Story TTS — generate raw audio if missing, then apply speed/silence
        let storyAudio = updatedStories[i].ttsAudio;
        if (!storyAudio) {
          console.log('[Bulletin] Generating TTS for story', i + 1);
          storyAudio = await generateStoryTTS(updatedStories[i]);
          updatedStories[i] = { ...updatedStories[i], ttsAudio: storyAudio };
          // Persist raw TTS back to store (speed/silence applied at assembly time)
          bulletinStore.updateStory(updatedStories[i]);
        }
        // Apply speed/silence adjustments at assembly time
        const processedStory = await processAudioSegment(storyAudio, state.mainVoiceSpeed, state.mainVoiceSilence);
        segments.push(processedStory);
      }

      // ── Transition after last story ───────────────────────────────────────
      if (state.soundsEnabled && state.selectedTransitionSound) {
        const transBase64 = await loadSoundAsBase64(state.selectedTransitionSound);
        segments.push(transBase64);
      }

      // ── Outro TTS ─────────────────────────────────────────────────────────
      if (state.introOutroEnabled && state.outroScript.trim()) {
        let outroAudio = state.outroTtsAudio;
        if (!outroAudio) {
          console.log('[Bulletin] Generating outro TTS');
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: state.outroScript,
              voiceName: state.introOutroVoice || selectedVoiceName,
              provider: getVoiceProvider(state.introOutroVoice || selectedVoiceName),
            }),
          });
          if (!response.ok) throw new Error('Outro TTS failed');
          const data = await response.json();
          outroAudio = data.audioContent as string;
          // Cache raw TTS (before speed/silence) so we can reuse it
          bulletinStore.update(s => ({ ...s, outroTtsAudio: outroAudio }));
        }
        // Apply speed/silence adjustments at assembly time
        const processedOutro = await processAudioSegment(outroAudio, state.introOutroSpeed, state.introOutroSilence);
        segments.push(processedOutro);
      }

      // ── Outro sound ───────────────────────────────────────────────────────
      if (state.soundsEnabled && state.selectedIntroOutroSound) {
        const soundBase64 = await loadSoundAsBase64(state.selectedIntroOutroSound);
        segments.push(soundBase64);
      }

      if (segments.length === 0) {
        throw new Error('No audio segments to assemble');
      }

      // ── Concatenate all segments ──────────────────────────────────────────
      console.log('[Bulletin] Concatenating', segments.length, 'segments');
      const concatenatedBlob = await concatenateAudioSegments(segments);

      // ── Normalise via /api/normalize ──────────────────────────────────────
      // Convert blob to base64 for the normalize endpoint
      const blobArrayBuffer = await concatenatedBlob.arrayBuffer();
      const blobBytes = new Uint8Array(blobArrayBuffer);
      let blobBinary = '';
      for (let i = 0; i < blobBytes.byteLength; i++) {
        blobBinary += String.fromCharCode(blobBytes[i]);
      }
      const concatenatedBase64 = btoa(blobBinary);

      console.log('[Bulletin] Normalising final audio');
      const normalizeResponse = await fetch('/api/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audios: [{ base64Audio: concatenatedBase64, label: 'bulletin' }],
        }),
      });

      let finalBase64: string;
      if (normalizeResponse.ok) {
        const normalizeData = await normalizeResponse.json();
        finalBase64 = normalizeData.normalizedAudios?.[0]?.base64Audio ?? concatenatedBase64;
      } else {
        // Normalisation failed — use un-normalised audio (non-fatal)
        console.warn('[Bulletin] Normalisation failed, using raw concatenated audio');
        finalBase64 = concatenatedBase64;
      }

      // ── Store result ──────────────────────────────────────────────────────
      bulletinStore.update(s => ({ ...s, bulletinAudio: finalBase64 }));

      // ── Auto-play ─────────────────────────────────────────────────────────
      const finalBlob = base64ToBlob(finalBase64, 'audio/wav');
      const url = URL.createObjectURL(finalBlob);
      bulletinAudioElement = new Audio(url);
      bulletinAudioElement.onended = () => { isPlaying = false; };
      bulletinAudioElement.onerror = () => { isPlaying = false; };
      bulletinAudioElement.ontimeupdate = () => {
        if (!isDraggingProgress) {
          currentTime = bulletinAudioElement?.currentTime ?? 0;
        }
      };
      bulletinAudioElement.onloadedmetadata = () => {
        duration = bulletinAudioElement?.duration ?? 0;
      };
      bulletinAudioElement.play();
      isPlaying = true;

      console.log('[Bulletin] Assembly complete');
    } catch (e) {
      generateError = 'Could not generate bulletin. Please try again.';
      console.error('[Bulletin] Assembly error:', e);
    } finally {
      isGenerating = false;
    }
  }

  // ─── Play button handler ───────────────────────────────────────────────────

  async function handlePlayButton() {
    if (isGenerating) return;

    // No audio yet — generate
    if (!bulletinAudio) {
      await generateBulletin();
      return;
    }

    // Audio exists — reconstruct element if needed, then toggle play/pause
    if (!bulletinAudioElement) {
      const blob = base64ToBlob(bulletinAudio, 'audio/wav');
      const url = URL.createObjectURL(blob);
      bulletinAudioElement = new Audio(url);
      bulletinAudioElement.onended = () => { isPlaying = false; };
      bulletinAudioElement.onerror = () => { isPlaying = false; };
      bulletinAudioElement.ontimeupdate = () => {
        if (!isDraggingProgress) {
          currentTime = bulletinAudioElement?.currentTime ?? 0;
        }
      };
      bulletinAudioElement.onloadedmetadata = () => {
        duration = bulletinAudioElement?.duration ?? 0;
      };
    }

    if (isPlaying) {
      bulletinAudioElement.pause();
      isPlaying = false;
    } else {
      bulletinAudioElement.play();
      isPlaying = true;
    }
  }

  // ─── Skip controls ─────────────────────────────────────────────────────────

  function skipBackward() {
    if (!bulletinAudioElement) return;
    bulletinAudioElement.currentTime = Math.max(0, bulletinAudioElement.currentTime - 5);
  }

  function skipForward() {
    if (!bulletinAudioElement) return;
    bulletinAudioElement.currentTime = Math.min(
      bulletinAudioElement.duration,
      bulletinAudioElement.currentTime + 5
    );
  }

  // ─── Time formatting ───────────────────────────────────────────────────────

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // ─── Progress slider handlers ──────────────────────────────────────────────

  function handleProgressInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    currentTime = value;
    if (bulletinAudioElement) {
      bulletinAudioElement.currentTime = value;
    }
  }

  function handleProgressMouseDown() {
    isDraggingProgress = true;
  }

  function handleProgressMouseUp() {
    isDraggingProgress = false;
  }

  // ─── Download ──────────────────────────────────────────────────────────────

  function handleDownload() {
    if (!bulletinAudio) return;
    const blob = base64ToBlob(bulletinAudio, 'audio/wav');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulletin.mp3';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Add to Audiogram ──────────────────────────────────────────────────────

  async function handleAddToAudiogram() {
    if (!bulletinAudio) return;

    try {
      // Decode the WAV blob into an AudioBuffer
      const blob = base64ToBlob(bulletinAudio, 'audio/wav');
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();

      // Write to the preloadedTTSAudio store (same pattern as TTS tab)
      preloadedTTSAudio.set({
        buffer: audioBuffer,
        voiceName: selectedVoiceName || 'bulletin',
      });

      // Navigate to main app — AudiogramPage picks up the store on mount
      await goto('/');
    } catch (e) {
      console.error('[Bulletin] Add to audiogram error:', e);
    }
  }

  // ─── Clear stories / Clear all handlers ────────────────────────────────────

  function handleClearStoriesClick() {
    clearStoriesModalOpen = true;
  }

  function handleClearAllClick() {
    clearAllModalOpen = true;
  }

  function handleClearStoriesConfirm() {
    bulletinStore.clearStoriesOnly();
    stopBulletinAudio();
    clearStoriesModalOpen = false;
  }

  function handleClearAllConfirm() {
    bulletinStore.reset();
    stopBulletinAudio();
    clearAllModalOpen = false;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  onDestroy(() => {
    stopBulletinAudio();
  });
</script>

<svelte:window on:mouseup={handleProgressMouseUp} on:touchend={handleProgressMouseUp} />

<div class="app-container">

  <!-- Header -->
  <header class="app-header">
    <div class="header-left">
      <flam-nav current="audioflam"></flam-nav>
      <img src="/icons/logotype-purple.png" alt="AudioFlam" class="logotype" />
    </div>
    <nav class="nav-tabs">
      <button
        type="button"
        class="nav-tab-btn"
        class:active={false}
        onclick={() => {
          localStorage.setItem('activeTab', 'tts');
          goto('/');
        }}
        aria-label="Text to Speech"
        aria-pressed={false}
      >
        <img src="/icons/icon-tts.svg" alt="" class="nav-tab-icon" />
      </button>
      <button
        type="button"
        class="nav-tab-btn"
        class:active={false}
        onclick={() => {
          localStorage.setItem('activeTab', 'audiogram');
          goto('/');
        }}
        aria-label="Audiogram"
        aria-pressed={false}
      >
        <img src="/icons/icon-audiogram.svg" alt="" class="nav-tab-icon" />
      </button>
      <button
        type="button"
        class="nav-tab-btn"
        class:active={false}
        onclick={() => {
          localStorage.setItem('activeTab', 'transcribe');
          goto('/');
        }}
        aria-label="Transcribe"
        aria-pressed={false}
      >
        <img src="/icons/icon-transcribe.svg" alt="" class="nav-tab-icon" />
      </button>
      <button
        type="button"
        class="nav-tab-btn"
        class:active={$page.url.pathname === '/bulletin'}
        onclick={() => goto('/bulletin')}
        aria-label="Bulletin"
        aria-pressed={$page.url.pathname === '/bulletin'}
      >
        <img src="/icons/icon-bulletin.svg" alt="" class="nav-tab-icon nav-tab-icon-bulletin" />
      </button>
    </nav>
  </header>

  <main class="bulletin-main">

    <!-- Helper Section -->
    <div class="helper-section">
      <h2 class="helper-headline">Bulletin</h2>
      <p class="helper-text">
        Create a 'top stories' audio bulletin with spoken intro, outro and sound effects
      </p>
    </div>

    <!-- Voice selector -->
    <section class="section">
      <VoiceDropdown
        label="Voice"
        voices={ALL_VOICES}
        value={selectedVoiceObj}
        onchange={handleVoiceChange}
      />
    </section>

    <!-- Add Story button -->
    <section class="section">
      <button
        type="button"
        class="add-story-btn"
        class:disabled={!selectedVoiceName}
        disabled={!selectedVoiceName}
        onclick={handleAddStory}
      >
        <span class="add-icon">+</span>
        Add Story
      </button>
    </section>

    <!-- Story list -->
    <section class="section story-list-section">
      {#if stories.length === 0}
        <div class="empty-state">
          <p class="empty-text">Build your bulletin</p>
          <p class="empty-hint">Select a voice and tap Add Story to begin.</p>
        </div>
      {:else}
        <div class="story-list">
          {#each stories as story, i (story.id)}
            <BulletinStoryCard
              {story}
              index={i}
              total={stories.length}
              onEdit={handleEditStory}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onPreviewClick={handlePreviewStory}
              onPreviewStop={handlePreviewStop}
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- Intro & Outro card -->
    <section class="section" class:disabled={stories.length === 0}>
      <BulletinIntroOutroCard onSettingsChange={stopBulletinAudio} />
    </section>

    <!-- Sounds card -->
    <section class="section" class:disabled={stories.length === 0}>
      <BulletinSoundsCard onSettingsChange={stopBulletinAudio} />
    </section>

    <!-- Controls cluster — matches TTS tab style exactly -->
    <section class="section controls-section">

      {#if generateError}
        <p class="generate-error">{generateError}</p>
      {/if}

      <!-- Progress slider and timestamp -->
      {#if bulletinAudio && duration > 0}
        <div class="progress-section">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="progress-slider-container"
            onmousedown={handleProgressMouseDown}
            ontouchstart={handleProgressMouseDown}
          >
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              oninput={handleProgressInput}
              class="progress-slider"
              aria-label="Bulletin progress"
            />
          </div>
          <div class="progress-timestamp">
            <span class="time-current">{formatTime(currentTime)}</span>
            <span class="time-separator">/</span>
            <span class="time-total">{formatTime(duration)}</span>
          </div>
        </div>
      {/if}

      <!-- Player row: back · play/pause · forward -->
      <div class="player-row">
        <button
          type="button"
          class="skip-btn"
          onclick={skipBackward}
          disabled={!bulletinAudioElement}
          aria-label="Skip back 5 seconds"
        >
          <img src="/icons/icon-back-five.svg" alt="Back 5s" />
        </button>

        <PlayButton
          state={playButtonState}
          disabled={stories.length === 0 || !selectedVoiceName}
          onclick={handlePlayButton}
          ariaLabel={isPlaying ? 'Pause' : (bulletinAudio ? 'Play' : 'Generate bulletin')}
        />

        <button
          type="button"
          class="skip-btn"
          onclick={skipForward}
          disabled={!bulletinAudioElement}
          aria-label="Skip forward 5 seconds"
        >
          <img src="/icons/icon-forward-five.svg" alt="Forward 5s" />
        </button>
      </div>

      <!-- Adjust main voice card -->
      <div class:disabled={stories.length === 0}>
        <BulletinAdjustVoiceCard onSettingsChange={stopBulletinAudio} />
      </div>

      <!-- Download button — full width, purple when enabled -->
      <button
        type="button"
        class="download-btn"
        class:enabled={!!bulletinAudio}
        disabled={!bulletinAudio}
        onclick={handleDownload}
      >
        Download audio
      </button>

      <!-- Add to audiogram — modest text link -->
      <button
        type="button"
        class="audiogram-btn"
        class:enabled={!!bulletinAudio}
        disabled={!bulletinAudio}
        onclick={handleAddToAudiogram}
      >
        Add to audiogram
      </button>

    </section>

    <!-- Clear stories / Clear all buttons -->
    <section class="section clear-buttons">
      <button
        type="button"
        class="clear-btn"
        class:disabled={stories.length === 0}
        disabled={stories.length === 0}
        onclick={handleClearStoriesClick}
      >
        Clear stories
      </button>
      <button
        type="button"
        class="clear-btn"
        class:disabled={stories.length === 0}
        disabled={stories.length === 0}
        onclick={handleClearAllClick}
      >
        Clear all
      </button>
    </section>

  </main>
</div>

<!-- ─── Clear Stories Modal ──────────────────────────────────────────────── -->
{#if clearStoriesModalOpen}
  <div class="modal-overlay">
    <div class="modal-content">
      <h3 class="modal-title">Clear stories?</h3>
      <p class="modal-message">All stories are deleted. Intro, outro and sounds stay</p>
      <div class="modal-buttons">
        <button
          type="button"
          class="modal-btn cancel"
          onclick={() => { clearStoriesModalOpen = false; }}
        >
          Cancel
        </button>
        <button
          type="button"
          class="modal-btn go"
          onclick={handleClearStoriesConfirm}
        >
          Go
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Clear All Modal ──────────────────────────────────────────────────── -->
{#if clearAllModalOpen}
  <div class="modal-overlay">
    <div class="modal-content">
      <h3 class="modal-title">Clear all?</h3>
      <p class="modal-message">All stories plus intro, outro and sounds are deleted</p>
      <div class="modal-buttons">
        <button
          type="button"
          class="modal-btn cancel"
          onclick={() => { clearAllModalOpen = false; }}
        >
          Cancel
        </button>
        <button
          type="button"
          class="modal-btn go"
          onclick={handleClearAllConfirm}
        >
          Go
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Story Drawer ────────────────────────────────────────────────────────── -->
{#if drawerOpen}
  <BulletinStoryDrawer
    story={drawerStory}
    onClose={handleDrawerClose}
  />
{/if}

<style>
  /* --- Helper section --- */
  .helper-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    padding: 0 var(--spacing-md);
    margin-bottom: var(--spacing-lg);
  }

  .helper-headline {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: #555555;
    margin: 0;
    text-align: center;
  }

  .helper-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    line-height: var(--line-height-normal);
    margin: 0;
  }

  .app-container {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background-color: var(--bg-white);
  }

  .app-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .logotype {
    height: 26px;
    width: auto;
  }

  .nav-tabs {
    display: flex;
    gap: var(--spacing-sm);
  }

  .nav-tab-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-round);
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f0f0f0;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .nav-tab-btn:hover {
    background-color: #e4e4e4;
  }

  .nav-tab-btn.active {
    background: var(--color-primary);
  }

  .nav-tab-icon {
    width: 22px;
    height: 22px;
    filter: brightness(0) saturate(100%) invert(25%) sepia(0%) saturate(0%) brightness(100%) contrast(90%);
  }

  .nav-tab-btn.active .nav-tab-icon {
    filter: brightness(0) invert(1);
  }

  .nav-tab-icon-bulletin {
    width: 22px;
    height: 22px;
  }

  .bulletin-main {
    padding: var(--spacing-lg) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .section {
    margin-bottom: var(--spacing-md);
  }

  .section.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Add Story button */
  .add-story-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: 14px var(--spacing-md);
    background: var(--color-highlight);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
    cursor: pointer;
    transition: border-color var(--transition-normal), background-color var(--transition-normal), color var(--transition-normal);
  }

  .add-story-btn:hover:not(.disabled) {
    border-color: var(--color-primary);
    background-color: var(--color-primary);
    color: var(--bg-white);
  }

  .add-story-btn.disabled {
    color: var(--text-secondary);
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  .add-icon {
    font-size: 1.25rem;
    line-height: 1;
    font-weight: var(--font-weight-regular);
  }

  /* Story list */
  .story-list-section {
    min-height: 60px;
  }

  .story-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* Empty state */
  .empty-state {
    padding: var(--spacing-xl) var(--spacing-md);
    text-align: center;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-main);
  }

  .empty-text {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Controls cluster */
  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-top: var(--spacing-sm);
  }

  /* Error message */
  .generate-error {
    font-size: var(--font-size-sm);
    color: #c62828;
    text-align: center;
    margin: 0;
    padding: var(--spacing-xs) var(--spacing-md);
    background: #ffebee;
    border-radius: var(--radius-sm);
  }

  /* Player row — back · PlayButton · forward */
  .player-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xl);
  }

  .skip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-normal);
  }

  .skip-btn img {
    width: 32px;
    height: 32px;
    filter: brightness(0) saturate(100%) invert(47%);
    transition: filter var(--transition-normal);
  }

  .skip-btn:hover:not(:disabled) img {
    filter: brightness(0) saturate(100%) invert(33%);
  }

  .skip-btn:disabled {
    cursor: default;
  }

  .skip-btn:disabled img {
    opacity: 0.4;
  }

  /* Download button — full width, purple when enabled */
  .download-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    background: var(--bg-main);
    color: #777777;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: not-allowed;
    transition: all var(--transition-normal);
  }

  .download-btn.enabled {
    background: var(--color-primary);
    color: var(--bg-white);
    cursor: pointer;
  }

  .download-btn.enabled:hover {
    background: #4a1d9e;
  }

  /* Add to audiogram — modest text link */
  .audiogram-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-xs) 0;
    margin-top: calc(-1 * var(--spacing-sm));
    border: none;
    background: transparent;
    color: #777777;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: not-allowed;
    transition: color var(--transition-normal);
  }

  .audiogram-btn.enabled {
    color: var(--color-primary);
    cursor: pointer;
  }

  .audiogram-btn.enabled:hover {
    text-decoration: underline;
  }

  /* Clear buttons — two columns, 50% each */
  .clear-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  .clear-btn {
    display: block;
    padding: var(--spacing-md);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    color: var(--color-primary);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .clear-btn:hover:not(:disabled) {
    background: var(--color-primary);
    color: var(--bg-white);
  }

  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: var(--color-border);
    color: var(--text-secondary);
  }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  /* Modal content */
  .modal-content {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: var(--spacing-lg);
    max-width: 320px;
    width: 90%;
    text-align: center;
  }

  .modal-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .modal-message {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    margin: 0 0 var(--spacing-lg) 0;
  }

  /* Modal buttons */
  .modal-buttons {
    display: flex;
    gap: var(--spacing-md);
    justify-content: flex-start;
  }

  .modal-btn {
    flex: 1;
    padding: var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .modal-btn.cancel {
    background: var(--bg-main);
    color: var(--text-primary);
    border: 1px solid var(--color-border);
  }

  .modal-btn.cancel:hover {
    background: #e0e0e0;
    border-color: #999999;
  }

  .modal-btn.go {
    background: var(--color-primary);
    color: var(--bg-white);
    border: none;
  }

  .modal-btn.go:hover {
    background: #4a1d9e;
  }

  /* Progress slider and timestamp */
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .progress-slider-container {
    position: relative;
    --slider-height: 6px;
    --thumb-size: 18px;
  }

  .progress-slider {
    width: 100%;
    height: var(--slider-height);
    border-radius: var(--radius-round);
    background: #dcdcdc;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    transition: background var(--transition-normal);
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
  }

  /* Webkit browsers (Chrome, Safari) */
  .progress-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: var(--radius-round);
    background: var(--color-primary);
    cursor: pointer;
    transition: background var(--transition-normal);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
    -webkit-tap-highlight-color: transparent;
    border: none;
  }

  .progress-slider::-webkit-slider-thumb:hover {
    background: var(--color-primary);
  }

  .progress-slider::-webkit-slider-thumb:active {
    background: var(--color-primary);
  }

  /* Firefox */
  .progress-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: var(--radius-round);
    background: var(--color-primary);
    cursor: pointer;
    border: none;
    transition: background var(--transition-normal);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
  }

  .progress-slider::-moz-range-thumb:hover {
    background: var(--color-primary);
  }

  .progress-slider::-moz-range-thumb:active {
    background: var(--color-primary);
  }

  /* Track styling */
  .progress-slider::-webkit-slider-runnable-track {
    background: #dcdcdc;
    height: var(--slider-height);
    border-radius: var(--radius-round);
  }

  .progress-slider::-moz-range-track {
    background: transparent;
    border: none;
  }

  /* Timestamp display */
  .progress-timestamp {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .time-current {
    color: var(--text-primary);
  }

  .time-separator {
    color: var(--text-secondary);
  }

  .time-total {
    color: var(--text-secondary);
  }
</style>
