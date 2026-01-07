<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_VOICES, selectedVoice, textInput } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';
  import SpeedSlider from '$lib/components/SpeedSlider.svelte';
  import SpeedBlockModal from '$lib/components/SpeedBlockModal.svelte';

  // App state
  let hasTextInput = $state(false);
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editorRef: HTMLDivElement;
  
  let duration = $state(0);
  let isPlaying = $state(false);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let lastGeneratedText = $state('');
  
  let generationAbortController = $state<AbortController | null>(null);
  
  let twoSpeakerMode = $state(false);
  let speaker1 = $state<VoiceOption | null>(null);
  let speaker2 = $state<VoiceOption | null>(null);
  let speaker1Open = $state(false);
  let speaker2Open = $state(false);
  let speakerPreviewPlaying = $state<string | null>(null);
  let speakerPreviewAudio: HTMLAudioElement | null = null;
  
  let audioPlaylist = $state<PlaylistSegment[]>([]);
  let currentTrackIndex = $state(0);
  
  let singleSpeakerSpeed = $state(1.0);
  let speaker1Speed = $state(1.0);
  let speaker2Speed = $state(1.0);
  
  let showDownloadModal = $state(false);
  let downloadFilename = $state('');
  
  let showSpeedBlockModal = $state(false);

  function generateDefaultFilename(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `audioflam-${day}${month}${year}-${hours}${minutes}`;
  }

  function openDownloadModal() {
    downloadFilename = generateDefaultFilename();
    showDownloadModal = true;
  }

  function closeDownloadModal() {
    showDownloadModal = false;
  }

  async function confirmDownload() {
    if (!audioUrl) return;
    
    try {
      const filename = downloadFilename.trim() || generateDefaultFilename();
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${filename}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (error) {
      console.error('Download failed:', error);
    }
    
    showDownloadModal = false;
  }

  function getFlagForVoice(voice: VoiceOption): string {
    if (voice.provider === 'azure') {
      if (voice.name.startsWith('en-NG')) return '🇳🇬';
      if (voice.name.startsWith('en-GB')) return '🇬🇧';
    }
    if (voice.provider === 'yarngpt') return '🇳🇬';
    return '';
  }

  function getPreviewFilename(voice: VoiceOption): string {
    const baseName = voice.displayName.split(' ')[0].split('(')[0].toLowerCase();
    return `/voices/${baseName}.mp3`;
  }

  function previewSpeakerVoice(event: MouseEvent, voice: VoiceOption) {
    event.stopPropagation();
    
    if (speakerPreviewPlaying === voice.name) {
      stopSpeakerPreview();
      return;
    }

    stopSpeakerPreview();
    speakerPreviewPlaying = voice.name;

    const previewUrl = getPreviewFilename(voice);
    speakerPreviewAudio = new Audio(previewUrl);
    
    speakerPreviewAudio.onended = () => {
      speakerPreviewPlaying = null;
    };
    
    speakerPreviewAudio.onerror = () => {
      speakerPreviewPlaying = null;
    };
    
    speakerPreviewAudio.play();
  }

  function stopSpeakerPreview() {
    if (speakerPreviewAudio) {
      speakerPreviewAudio.pause();
      speakerPreviewAudio = null;
    }
    speakerPreviewPlaying = null;
  }

  function handleSingleSpeakerSpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    singleSpeakerSpeed = speed;
    if (audioElement) {
      audioElement.playbackRate = speed;
    }
  }

  function handleSpeaker1SpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    speaker1Speed = speed;
  }

  function handleSpeaker2SpeedChange(speed: number) {
    if (audioUrl === null) {
      showSpeedBlockModal = true;
      return;
    }
    speaker2Speed = speed;
  }

  function closeSpeeedBlockModal() {
    showSpeedBlockModal = false;
  }

  $effect(() => {
    hasTextInput = $textInput.trim().length > 0;
  });

  function handleVoiceChange(voice: VoiceOption) {
    selectedVoice.set(voice);
    invalidateAudio();
  }

  function invalidateAudio() {
    if (audioUrl || audioPlaylist.length > 0) {
      audioUrl = null;
      audioElement = null;
      isPlaying = false;
      lastGeneratedText = '';
      audioPlaylist = [];
      currentTrackIndex = 0;
      singleSpeakerSpeed = 1.0;
      speaker1Speed = 1.0;
      speaker2Speed = 1.0;
    }
  }

  function handleSpeaker1Change(voice: VoiceOption) {
    const providerChanged = speaker1 && speaker1.provider !== voice.provider;
    speaker1 = voice;
    speaker1Open = false;
    if (providerChanged && speaker2 && speaker2.provider !== voice.provider) {
      speaker2 = null;
    }
    invalidateAudio();
  }

  function toggleSpeaker1Dropdown() {
    speaker1Open = !speaker1Open;
    if (speaker1Open) {
      speaker2Open = false;
      setTimeout(() => {
        const dropdown = document.querySelector('[data-speaker="1"]');
        if (dropdown) {
          dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 0);
    }
  }

  function toggleSpeaker2Dropdown() {
    speaker2Open = !speaker2Open;
    if (speaker2Open) {
      speaker1Open = false;
      setTimeout(() => {
        const dropdown = document.querySelector('[data-speaker="2"]');
        if (dropdown) {
          dropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 0);
    }
  }

  function handleSpeaker2Change(voice: VoiceOption) {
    speaker2 = voice;
    speaker2Open = false;
    invalidateAudio();
  }

  function handleEditorInput() {
    if (editorRef) {
      const newText = editorRef.innerText;
      textInput.set(newText);
      
      if (audioUrl && newText.trim() !== lastGeneratedText) {
        audioUrl = null;
        audioElement = null;
        isPlaying = false;
        lastGeneratedText = '';
      }
    }
  }

  function handleEditorFocus() {
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
    }
  }

  function handleVoiceDropdownOpen() {
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
    }
  }

  function skipBackward() {
    if (audioElement) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 5);
    }
  }

  function skipForward() {
    if (audioElement) {
      audioElement.currentTime = Math.min(duration, audioElement.currentTime + 5);
    }
  }

  interface DialogueSegment {
    speaker: string;
    text: string;
    voice: VoiceOption;
  }

  function parseDialogue(text: string): DialogueSegment[] {
    const segments: DialogueSegment[] = [];
    const lines = text.split('\n');
    const speakerMap = new Map<string, VoiceOption>();
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex > 0 && colonIndex < 30) {
        const potentialSpeaker = trimmedLine.substring(0, colonIndex).trim();
        const dialogueText = trimmedLine.substring(colonIndex + 1).trim();
        
        if (potentialSpeaker && dialogueText) {
          const speakerKey = potentialSpeaker.toLowerCase();
          
          if (!speakerMap.has(speakerKey)) {
            if (speakerMap.size === 0 && speaker1) {
              speakerMap.set(speakerKey, speaker1);
            } else if (speakerMap.size === 1 && speaker2) {
              speakerMap.set(speakerKey, speaker2);
            }
          }
          
          const voice = speakerMap.get(speakerKey);
          if (voice) {
            segments.push({ speaker: potentialSpeaker, text: dialogueText, voice });
          }
          continue;
        }
      }
      
      if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + trimmedLine;
      } else if (speaker1) {
        segments.push({ speaker: 'Speaker 1', text: trimmedLine, voice: speaker1 });
      }
    }
    
    return segments;
  }

  interface PlaylistSegment {
    url: string;
    speaker: 'speaker1' | 'speaker2';
  }

  interface TwoSpeakerResult {
    segments: PlaylistSegment[];
    mergedUrl: string;
    totalDuration: number;
  }

  function getAudioDuration(url: string): Promise<number> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.addEventListener('error', () => {
        resolve(0);
      });
    });
  }

  async function generateTwoSpeakerAudio(signal: AbortSignal): Promise<TwoSpeakerResult | null> {
    const dialogueSegments = parseDialogue($textInput.trim());
    
    if (dialogueSegments.length === 0) {
      errorMsg = 'No dialogue segments found. Use format: Speaker: text';
      return null;
    }

    const segments: PlaylistSegment[] = [];
    const audioChunks: Uint8Array[] = [];
    const base64Audios: { base64Audio: string; speaker: 'speaker1' | 'speaker2' }[] = [];
    
    // Generate audio for all segments
    for (const segment of dialogueSegments) {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segment.text,
          voiceName: segment.voice.name,
          provider: segment.voice.provider
        }),
        signal
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed for ${segment.speaker}: ${err.error || 'Unknown error'}`);
      }
      
      const data = await res.json();
      const isSpeaker1 = segment.voice === speaker1;
      
      base64Audios.push({
        base64Audio: data.audioContent,
        speaker: isSpeaker1 ? 'speaker1' : 'speaker2'
      });
    }
    
    // Normalize all audios to match peak levels
    const normalizeRes = await fetch('/api/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audios: base64Audios.map(a => ({
          base64Audio: a.base64Audio,
          label: a.speaker
        }))
      }),
      signal
    });

    if (!normalizeRes.ok) {
      const err = await normalizeRes.json();
      console.warn('Audio normalization failed, proceeding without normalization:', err);
    }

    let normalizedAudios = base64Audios;
    if (normalizeRes.ok) {
      const normalizeData = await normalizeRes.json();
      normalizedAudios = normalizeData.normalizedAudios.map((audio: any, idx: number) => ({
        base64Audio: audio.base64Audio,
        speaker: base64Audios[idx].speaker
      }));
    }

    // Convert normalized audios to chunks and create segments
    for (let i = 0; i < normalizedAudios.length; i++) {
      const audioData = normalizedAudios[i];
      const byteCharacters = atob(audioData.base64Audio);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let j = 0; j < byteCharacters.length; j++) {
        byteArray[j] = byteCharacters.charCodeAt(j);
      }
      audioChunks.push(byteArray);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      
      segments.push({
        url,
        speaker: audioData.speaker
      });
    }
    
    const urls = segments.map(s => s.url);
    const durations = await Promise.all(urls.map(url => getAudioDuration(url)));
    const totalDuration = durations.reduce((acc, d) => acc + d, 0);
    
    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const mergedBlob = new Blob([merged], { type: 'audio/mp3' });
    const mergedUrl = URL.createObjectURL(mergedBlob);
    
    return { segments, mergedUrl, totalDuration };
  }

  function playNextTrack() {
    if (currentTrackIndex < audioPlaylist.length) {
      const segment = audioPlaylist[currentTrackIndex];
      audioElement = new Audio(segment.url);
      
      // Apply speed based on speaker
      const speed = segment.speaker === 'speaker1' ? speaker1Speed : speaker2Speed;
      audioElement.playbackRate = speed;
      
      audioElement.addEventListener('ended', () => {
        currentTrackIndex++;
        if (currentTrackIndex < audioPlaylist.length) {
          playNextTrack();
        } else {
          isPlaying = false;
          currentTrackIndex = 0;
        }
      });
      audioElement.play();
    }
  }

  async function generateAndPlay() {
    if (!$textInput.trim()) return;
    
    // Handle pause during generation
    if (loading && generationAbortController) {
      generationAbortController.abort();
      generationAbortController = null;
      loading = false;
      return;
    }
    
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
      return;
    }
    
    if (twoSpeakerMode && audioPlaylist.length > 0 && !isPlaying) {
      currentTrackIndex = 0;
      isPlaying = true;
      playNextTrack();
      return;
    }
    
    if (audioUrl && audioElement && !isPlaying) {
      audioElement.play();
      isPlaying = true;
      return;
    }
    
    loading = true;
    errorMsg = null;
    audioUrl = null;
    audioPlaylist = [];
    generationAbortController = new AbortController();
    
    // Reset speed sliders to 1.0 when generating new audio
    singleSpeakerSpeed = 1.0;
    speaker1Speed = 1.0;
    speaker2Speed = 1.0;
    
    try {
      if (twoSpeakerMode) {
        if (!speaker1 || !speaker2) {
          errorMsg = 'Please select both Speaker 1 and Speaker 2 voices';
          loading = false;
          return;
        }
        
        const result = await generateTwoSpeakerAudio(generationAbortController.signal);
        if (!result) {
          loading = false;
          return;
        }
        
        audioPlaylist = result.segments;
        audioUrl = result.mergedUrl;
        duration = result.totalDuration;
        currentTrackIndex = 0;
        lastGeneratedText = $textInput.trim();
        isPlaying = true;
        playNextTrack();
      } else {
        const voice = $selectedVoice;
        
        if (!voice) {
          errorMsg = 'First select a voice and try again';
          loading = false;
          return;
        }
        
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: $textInput.trim(),
            voiceName: voice.name,
            provider: voice.provider
          }),
          signal: generationAbortController.signal
        });
        
        if (!res.ok) {
          const err = await res.json();
          const details = err.details ? `: ${err.details}` : '';
          throw new Error(`${err.error || 'Failed to generate'}${details}`);
        }
        
        const data = await res.json();
        const byteCharacters = atob(data.audioContent);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: 'audio/mp3' });
        
        audioUrl = URL.createObjectURL(blob);
         
        audioElement = new Audio(audioUrl);
        audioElement.playbackRate = singleSpeakerSpeed;
        
        const handleLoadedMetadata = () => {
          duration = audioElement?.duration || 0;
        };
        const handleEnded = () => {
          isPlaying = false;
        };
        
        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('error', () => {
          errorMsg = 'Failed to load audio';
          isPlaying = false;
        });
         
        lastGeneratedText = $textInput.trim();
        audioElement.play();
        isPlaying = true;
      }
      
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error && err.name === 'AbortError') {
        errorMsg = null;
      } else {
        errorMsg = err instanceof Error ? err.message : 'Unknown error';
      }
    } finally {
      loading = false;
      generationAbortController = null;
    }
  }

  function clearText() {
    textInput.set('');
    if (editorRef) {
      editorRef.innerText = '';
    }
    hasTextInput = false;
    audioUrl = null;
    audioElement = null;
    isPlaying = false;
    duration = 0;
    lastGeneratedText = '';
    singleSpeakerSpeed = 1.0;
    speaker1Speed = 1.0;
    speaker2Speed = 1.0;
  }
</script>

<div class="app-container">
  <header class="app-header">
    <img src="/icons/logotype-purple.png" alt="AudioFlam" class="logotype" />
  </header>

  <main class="main-content">
    <div class="dropdowns-section">
      <VoiceDropdown
        label="Voice"
        voices={ALL_VOICES}
        value={$selectedVoice}
        onchange={handleVoiceChange}
        onopen={handleVoiceDropdownOpen}
      />

    </div>

    <div class="text-section">
      <div class="text-header">
        <span class="text-label" id="text-label">Text</span>
        <span class="char-count" class:warning={$textInput.length > 3200}>
          {$textInput.length}/4000
        </span>
      </div>
      <div class="text-editor-wrapper">
        <div 
          class="text-editor"
          contenteditable="true"
          bind:this={editorRef}
          oninput={handleEditorInput}
          onfocus={handleEditorFocus}
          role="textbox"
          aria-multiline="true"
          aria-labelledby="text-label"
        ></div>
        {#if twoSpeakerMode && !hasTextInput}
          <span class="text-placeholder">Use : to identify speakers (eg Regina:)</span>
        {/if}
      </div>
      <button 
        type="button" 
        class="clear-btn" 
        class:inactive={!hasTextInput}
        onclick={clearText}
        disabled={!hasTextInput}
      >Clear text</button>
    </div>

    <div class="controls-section">
      {#if errorMsg}
        <p class="error-msg">{errorMsg}</p>
      {/if}

      <div class="player-row">
        <button 
          type="button" 
          class="skip-btn" 
          onclick={skipBackward}
          disabled={!audioElement}
          aria-label="Skip back 5 seconds"
        >
          <img src="/icons/icon-back-five.svg" alt="Back 5s" />
        </button>

        <button 
          type="button" 
          class="play-btn" 
          class:active={hasTextInput && !loading && !isPlaying}
          class:loading={loading}
          class:playing={isPlaying}
          onclick={generateAndPlay}
          disabled={!hasTextInput || $textInput.length > 4000}
        >
          {#if isPlaying || loading}
            <img src="/icons/icon-pause-fill.svg" alt="Pause" class="play-icon" />
          {:else}
            <img src="/icons/icon-play-fill.svg" alt="Play" class="play-icon" />
          {/if}
        </button>

        <button 
          type="button" 
          class="skip-btn" 
          onclick={skipForward}
          disabled={!audioElement}
          aria-label="Skip forward 5 seconds"
        >
          <img src="/icons/icon-forward-five.svg" alt="Forward 5s" />
        </button>
      </div>

      {#if loading && $selectedVoice?.provider === 'yarngpt'}
        <p class="loading-hint">Generating. This could take a minute<span class="loading-dots"></span></p>
      {/if}

      {#if !twoSpeakerMode}
        <div class="speed-control-box">
          <div class="speed-control-row">
            <span class="speed-label-text">Speed</span>
            <SpeedSlider
              speed={singleSpeakerSpeed}
              isActive={audioUrl !== null}
              onSpeedChange={handleSingleSpeakerSpeedChange}
              size="large"
            />
          </div>
        </div>
      {/if}

      <div class="two-speaker-section">
        <div class="two-speaker-toggle-row">
          <span class="two-speaker-label">Two speakers</span>
          <button
            type="button"
            class="toggle-switch"
            class:active={twoSpeakerMode}
            onclick={() => twoSpeakerMode = !twoSpeakerMode}
            aria-pressed={twoSpeakerMode}
            aria-label="Toggle two speaker mode"
          >
            <span class="toggle-thumb"></span>
          </button>
        </div>

        {#if twoSpeakerMode}
          <div class="two-speaker-divider"></div>
          <div class="speaker-dropdowns-row">
            <div class="speaker-dropdown" data-speaker="1">
              <button
                type="button"
                class="speaker-dropdown-btn"
                onclick={toggleSpeaker1Dropdown}
              >
                <span>{speaker1 ? `1: ${getFlagForVoice(speaker1)} ${speaker1.displayName}` : 'Speaker 1'}</span>
                <img
                  src={speaker1Open ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
                  alt=""
                  class="chevron-icon"
                />
              </button>
              {#if speaker1Open}
                <div class="speaker-dropdown-menu">
                  {#each ALL_VOICES as voice}
                    <div class="speaker-option-row">
                      <button
                        type="button"
                        class="speaker-option"
                        class:selected={speaker1?.name === voice.name}
                        onclick={() => handleSpeaker1Change(voice)}
                      >
                        <span class="voice-name"><span class="flag">{getFlagForVoice(voice)}</span>{voice.displayName}</span>
                        {#if voice.provider === 'azure'}
                          <span class="speed-badge">⚡</span>
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="speaker-preview-btn"
                        class:playing={speakerPreviewPlaying === voice.name}
                        onclick={(e) => previewSpeakerVoice(e, voice)}
                        aria-label={`Preview ${voice.displayName}`}
                      >
                        <img 
                          src={speakerPreviewPlaying === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'} 
                          alt=""
                          class="speaker-preview-icon"
                        />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="speaker-dropdown" data-speaker="2">
               <button
                 type="button"
                 class="speaker-dropdown-btn"
                 onclick={toggleSpeaker2Dropdown}
               >
                <span>{speaker2 ? `2: ${getFlagForVoice(speaker2)} ${speaker2.displayName}` : 'Speaker 2'}</span>
                <img
                  src={speaker2Open ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
                  alt=""
                  class="chevron-icon"
                />
              </button>
              {#if speaker2Open}
                <div class="speaker-dropdown-menu">
                  {#each ALL_VOICES.filter(v => !speaker1 || v.provider === speaker1.provider) as voice}
                    <div class="speaker-option-row">
                      <button
                        type="button"
                        class="speaker-option"
                        class:selected={speaker2?.name === voice.name}
                        onclick={() => handleSpeaker2Change(voice)}
                      >
                        <span class="voice-name"><span class="flag">{getFlagForVoice(voice)}</span>{voice.displayName}</span>
                        {#if voice.provider === 'azure'}
                          <span class="speed-badge">⚡</span>
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="speaker-preview-btn"
                        class:playing={speakerPreviewPlaying === voice.name}
                        onclick={(e) => previewSpeakerVoice(e, voice)}
                        aria-label={`Preview ${voice.displayName}`}
                      >
                        <img 
                          src={speakerPreviewPlaying === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'} 
                          alt=""
                          class="speaker-preview-icon"
                        />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          {#if twoSpeakerMode}
            <div class="speaker-speeds-section">
              <span class="speaker-speeds-label">Speed</span>
              <div class="speaker-speeds-row">
                <SpeedSlider
                  speed={speaker1Speed}
                  isActive={audioUrl !== null}
                  onSpeedChange={handleSpeaker1SpeedChange}
                  size="small"
                />
                <SpeedSlider
                  speed={speaker2Speed}
                  isActive={audioUrl !== null}
                  onSpeedChange={handleSpeaker2SpeedChange}
                  size="small"
                />
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <button
        type="button"
        class="download-btn"
        class:enabled={!!audioUrl}
        disabled={!audioUrl}
        onclick={openDownloadModal}
      >
        Download
      </button>
    </div>
  </main>
</div>

<SpeedBlockModal isOpen={showSpeedBlockModal} onDismiss={closeSpeeedBlockModal} />

{#if showDownloadModal}
  <div class="modal-overlay" role="presentation" onclick={closeDownloadModal} onkeydown={(e) => e.key === 'Escape' && closeDownloadModal()}>
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <h2 id="modal-title" class="modal-title">Download Audio</h2>
      
      <label class="modal-label" for="filename-input">Filename</label>
      <div class="filename-input-row">
        <input
          id="filename-input"
          type="text"
          class="filename-input"
          bind:value={downloadFilename}
          placeholder="audioflam-050126-1234"
        />
        <span class="filename-extension">.mp3</span>
      </div>

      <div class="modal-actions">
        <button type="button" class="modal-btn cancel" onclick={closeDownloadModal}>Cancel</button>
        <button type="button" class="modal-btn confirm" onclick={confirmDownload}>Download</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .app-container {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background-color: var(--color-white);
  }

  .app-header {
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border-dark);
    display: flex;
    justify-content: center;
  }

  .logotype {
    height: 28px;
    width: auto;
  }

  .main-content {
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .dropdowns-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }



  .text-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .text-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .text-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .char-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .char-count.warning {
    color: #dc2626;
    font-weight: 500;
  }

  .text-editor-wrapper {
    position: relative;
  }

  .text-placeholder {
    position: absolute;
    top: var(--spacing-md);
    left: var(--spacing-md);
    color: #999999;
    font-size: var(--font-size-sm);
    pointer-events: none;
  }

  .text-editor {
    min-height: 150px;
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    line-height: 1.6;
    outline: none;
    transition: border-color var(--transition-fast);
    resize: vertical;
    overflow: auto;
  }

  .text-editor:focus {
    border-color: var(--color-primary);
  }

  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .error-msg {
    color: var(--color-primary);
    text-align: center;
    font-size: var(--font-size-sm);
  }

  .clear-btn {
    align-self: flex-end;
    padding: 0;
    font-size: var(--font-size-sm);
    color: #777777;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .clear-btn:hover:not(:disabled) {
    color: var(--color-primary);
  }

  .clear-btn.inactive {
    color: #999999;
    cursor: default;
  }

  .loading-hint {
    text-align: center;
    font-size: var(--font-size-sm);
    color: #999999;
  }

  .loading-dots::after {
    content: '';
    display: inline-block;
    width: 12px;
    animation: dots 1.5s steps(4, end) infinite;
  }

  @keyframes dots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
  }

  .player-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-lg);
  }

  .skip-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-fast);
  }

  .skip-btn img {
    width: 32px;
    height: 32px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .skip-btn:hover:not(:disabled) img {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .skip-btn:disabled {
    cursor: default;
  }

  .skip-btn:disabled img {
    opacity: 0.4;
  }

  .play-btn {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    border: 3px solid #777777 !important;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
    flex-shrink: 0;
    position: relative;
    overflow: visible;
    -webkit-appearance: none;
    appearance: none;
  }

  .play-btn .play-icon {
    width: 40px;
    height: 40px;
    filter: brightness(0) saturate(100%) invert(60%);
    transition: filter var(--transition-fast);
    position: relative;
    z-index: 2;
    display: block;
    -webkit-filter: brightness(0) saturate(100%) invert(60%);
  }

  .play-btn.active {
    border-color: var(--color-primary) !important;
    background: var(--color-white);
  }

  .play-btn.active .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
    -webkit-filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.loading {
    border-color: transparent !important;
    background: transparent;
  }

  .play-btn.loading::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, var(--color-primary), var(--color-lavender-veil), var(--color-primary));
    animation: spinner-rotate 1s linear infinite;
    z-index: 0;
  }

  .play-btn.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--color-white);
    z-index: 1;
  }

  .play-btn.loading .play-icon,
  .play-btn.playing .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.playing {
    border-color: var(--color-primary) !important;
  }

  @keyframes spinner-rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .play-btn:disabled {
    cursor: not-allowed;
  }



  .download-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    background: #999999;
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: not-allowed;
    transition: background var(--transition-fast);
  }

  .download-btn.enabled {
    background: var(--color-primary);
    cursor: pointer;
  }

  .download-btn.enabled:hover {
    background: #4a1d9e;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .modal-content {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 100%;
    max-width: 320px;
    box-shadow: var(--shadow-lg);
  }

  .modal-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--spacing-md) 0;
    text-align: center;
  }

  .modal-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .filename-input-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-bottom: var(--spacing-lg);
  }

  .filename-input {
    flex: 1;
    border: none;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-base);
    outline: none;
  }

  .filename-input:focus {
    box-shadow: none;
  }

  .filename-extension {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-app-bg);
    color: var(--color-text-secondary);
    font-size: var(--font-size-base);
    border-left: 1px solid var(--color-border);
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .modal-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .modal-btn.cancel {
    background: var(--color-white);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .modal-btn.cancel:hover {
    background: var(--color-app-bg);
  }

  .modal-btn.confirm {
    background: var(--color-primary);
    border: none;
    color: var(--color-white);
  }

  .modal-btn.confirm:hover {
    background: #4a1d9e;
  }

  .two-speaker-section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    background: var(--color-white);
  }

  .two-speaker-toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .two-speaker-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .toggle-switch {
    width: 44px;
    height: 24px;
    background: #999999;
    border: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    position: relative;
    transition: background var(--transition-fast);
    padding: 0;
  }

  .toggle-switch.active {
    background: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: var(--color-white);
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .two-speaker-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--spacing-md) 0;
  }

  .speaker-dropdowns-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .speaker-dropdown {
    flex: 1;
    position: relative;
    scroll-margin-bottom: 320px;
  }

  .speaker-dropdown-btn {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-white);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .speaker-dropdown-btn:hover {
    border-color: var(--color-primary);
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    opacity: 0.5;
  }

  .speaker-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--color-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 100;
    max-height: 300px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .speaker-option-row {
    display: flex;
    align-items: center;
    width: 100%;
    border-bottom: 1px solid var(--color-border);
  }

  .speaker-option-row:last-child {
    border-bottom: none;
  }

  .speaker-option {
    flex: 1;
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    transition: background var(--transition-fast);
  }

  .speaker-option:hover {
    background: var(--color-lavender-veil);
  }

  .speaker-option.selected {
    color: var(--color-primary);
    font-weight: 500;
  }

  .speaker-option .voice-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .speaker-option .flag {
    display: inline-block;
    width: 20px;
    text-align: center;
  }

  .speaker-option .speed-badge {
    font-size: 12px;
    margin-left: 4px;
  }

  .speaker-preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .speaker-preview-icon {
    width: 20px;
    height: 20px;
    filter: invert(0.54) sepia(0.5) hue-rotate(248deg);
  }

  .speaker-preview-btn.playing .speaker-preview-icon {
    filter: invert(0.32) sepia(0.6) hue-rotate(248deg) saturate(1.5);
  }

  .speed-control-box {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    background: var(--color-white);
    margin-top: var(--spacing-md);
  }

  .speed-control-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .speed-label-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    min-width: 45px;
    white-space: nowrap;
  }

  .speed-control-row :global(> :last-child) {
    flex: 1;
  }

  .speaker-speeds-section {
    margin-top: var(--spacing-md);
  }

  .speaker-speeds-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    margin-bottom: var(--spacing-sm);
  }

  .speaker-speeds-row {
    display: flex;
    gap: var(--spacing-md);
  }

  .speaker-speeds-row :global(> div) {
    flex: 1;
  }
</style>
