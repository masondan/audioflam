<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { bulletinStore, getStorySource } from '$lib/stores/bulletin';
  import type { BulletinStory } from '$lib/stores/bulletin';
  import { ALL_VOICES, preloadedTTSAudio } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import { concatenateAudioSegments } from '$lib/audioProcessing';
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
          provider: 'azure',
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

  /** Generate TTS for a single story via /api/tts with speed/silence adjustments */
  async function generateStoryTTS(
    story: BulletinStory,
    speed: number = 1.0,
    silence: 'default' | 'trim' | 'tight' = 'default'
  ): Promise<string> {
    const text = getStorySource(story);
    if (!text.trim()) throw new Error(`Story ${story.id} has no text`);

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: selectedVoiceName,
        provider: 'azure',
        speed,
        silence,
      }),
    });

    if (!response.ok) throw new Error(`TTS failed for story ${story.id}`);
    const { audioContent } = await response.json();
    return audioContent as string;
  }

  function stopBulletinAudio() {
    if (bulletinAudioElement) {
      bulletinAudioElement.pause();
      bulletinAudioElement = null;
    }
    isPlaying = false;
  }

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
              provider: 'azure',
            }),
          });
          if (!response.ok) throw new Error('Intro TTS failed');
          const data = await response.json();
          introAudio = data.audioContent as string;
          bulletinStore.update(s => ({ ...s, introTtsAudio: introAudio }));
        }
        segments.push(introAudio);
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

        // Story TTS — generate if missing
        let storyAudio = updatedStories[i].ttsAudio;
        if (!storyAudio) {
          console.log('[Bulletin] Generating TTS for story', i + 1);
          storyAudio = await generateStoryTTS(
            updatedStories[i],
            state.mainVoiceSpeed,
            state.mainVoiceSilence
          );
          updatedStories[i] = { ...updatedStories[i], ttsAudio: storyAudio };
          // Persist generated audio back to store
          bulletinStore.updateStory(updatedStories[i]);
        }
        segments.push(storyAudio);
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
              provider: 'azure',
            }),
          });
          if (!response.ok) throw new Error('Outro TTS failed');
          const data = await response.json();
          outroAudio = data.audioContent as string;
          bulletinStore.update(s => ({ ...s, outroTtsAudio: outroAudio }));
        }
        segments.push(outroAudio);
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

  // ─── New bulletin actions ──────────────────────────────────────────────────────

  function handleContinueWithTemplate() {
    bulletinStore.clearStoriesOnly();
    stopBulletinAudio();
  }

  function handleStartFresh() {
    bulletinStore.reset();
    stopBulletinAudio();
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  onDestroy(() => {
    stopBulletinAudio();
  });
</script>

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
        class:active={false}
        onclick={() => {
          localStorage.setItem('activeTab', 'subtitle-video');
          goto('/');
        }}
        aria-label="Subtitle video"
        aria-pressed={false}
      >
        <img src="/icons/icon-subtitles.svg" alt="" class="nav-tab-icon nav-tab-icon-subtitles" />
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
          <p class="empty-text">No stories yet</p>
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
    <section class="section">
      <BulletinIntroOutroCard />
    </section>

    <!-- Sounds card -->
    <section class="section">
      <BulletinSoundsCard />
    </section>

    <!-- Controls cluster — matches TTS tab style exactly -->
    <section class="section controls-section">

      {#if generateError}
        <p class="generate-error">{generateError}</p>
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
      <BulletinAdjustVoiceCard />

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

    <!-- New bulletin actions -->
    <section class="section bottom-actions">
      <button
        type="button"
        class="new-bulletin-btn secondary"
        onclick={handleContinueWithTemplate}
      >
        Continue with template
      </button>

      <button
        type="button"
        class="new-bulletin-btn primary"
        onclick={handleStartFresh}
      >
        Start fresh
      </button>
    </section>

  </main>
</div>

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

  .nav-tab-icon-subtitles {
    width: 18px;
    height: 18px;
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

  /* New bulletin action buttons */
  .bottom-actions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .new-bulletin-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .new-bulletin-btn.secondary {
    background: var(--bg-main);
    color: var(--text-primary);
    border-color: var(--color-border);
  }

  .new-bulletin-btn.secondary:hover {
    background: #e0e0e0;
    border-color: #999999;
  }

  .new-bulletin-btn.primary {
    background: var(--color-primary);
    color: var(--bg-white);
    border-color: var(--color-primary);
  }

  .new-bulletin-btn.primary:hover {
    background: #4a1d9e;
    border-color: #4a1d9e;
  }
</style>
