<script lang="ts">
  import { ALL_VOICES, selectedVoice, textInput } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';

  let hasTextInput = $state(false);
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editorRef: HTMLDivElement;
  
  let currentTime = $state(0);
  let duration = $state(0);
  let isPlaying = $state(false);
  let audioElement: HTMLAudioElement | null = null;

  $effect(() => {
    hasTextInput = $textInput.trim().length > 0;
  });

  function handleVoiceChange(voice: VoiceOption) {
    selectedVoice.set(voice);
    // Reset audio when voice changes
    if (audioUrl) {
      audioUrl = null;
      audioElement = null;
      isPlaying = false;
    }
  }

  function handleEditorInput() {
    if (editorRef) {
      textInput.set(editorRef.innerText);
    }
  }

  function handleEditorFocus() {
    hasTextInput = true;
  }

  async function generateAndPlay() {
    if (!$textInput.trim()) return;
    
    if (isPlaying && audioElement) {
      audioElement.pause();
      isPlaying = false;
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
    
    try {
      const voice = $selectedVoice;
      
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: $textInput.trim(),
          voiceName: voice.name,
          provider: voice.provider
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        const details = err.details ? `: ${err.details}` : '';
        throw new Error(`${err.error || 'Failed to generate'}${details}`);
      }
      
      const data = await res.json();
      const byteCharacters = atob(data.audioContent);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const mimeType = data.format === 'wav' ? 'audio/wav' : 'audio/mp3';
      const blob = new Blob([byteArray], { type: mimeType });
      audioUrl = URL.createObjectURL(blob);
      
      audioElement = new Audio(audioUrl);
      audioElement.addEventListener('loadedmetadata', () => {
        duration = audioElement?.duration || 0;
      });
      audioElement.addEventListener('timeupdate', () => {
        currentTime = audioElement?.currentTime || 0;
      });
      audioElement.addEventListener('ended', () => {
        isPlaying = false;
        currentTime = 0;
      });
      
      audioElement.play();
      isPlaying = true;
      
    } catch (err: unknown) {
      console.error(err);
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  function handleProgressClick(event: MouseEvent) {
    if (!audioElement || !duration) return;
    const target = event.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    audioElement.currentTime = percent * duration;
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      />

    </div>

    <div class="text-section">
      <div class="text-header">
        <span class="text-label" id="text-label">Text</span>
        <span class="char-count" class:warning={$textInput.length > 1800}>
          {$textInput.length}/2000
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
        <div class="expand-marker">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 6L10 10H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    </div>

    {#if !hasTextInput}
      <div class="intro-section">
        <div class="intro-step">
          <img src="/icons/icon-one.svg" alt="1" class="step-icon" />
          <p>Choose a Nigerian voice (Native or Fast clone)</p>
        </div>
        <div class="intro-step">
          <img src="/icons/icon-two.svg" alt="2" class="step-icon" />
          <p>Paste or type your script (max 2000 characters)</p>
        </div>
        <div class="intro-step">
          <img src="/icons/icon-three.svg" alt="3" class="step-icon" />
          <p>Generate, play, and download your audio</p>
        </div>
      </div>
    {:else}
      <div class="controls-section">
        {#if errorMsg}
          <p class="error-msg">{errorMsg}</p>
        {/if}

        <div class="player-row">
          <button 
            type="button" 
            class="play-btn" 
            onclick={generateAndPlay}
            disabled={loading || !$textInput.trim() || $textInput.length > 2000}
          >
            {#if loading}
              <div class="spinner"></div>
            {:else if isPlaying}
              <img src="/icons/icon-pause-fill.svg" alt="Pause" />
            {:else}
              <img src="/icons/icon-play.svg" alt="Play" />
            {/if}
          </button>
          
          <div 
            class="progress-container" 
            onclick={handleProgressClick}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProgressClick(e as unknown as MouseEvent); }}
            role="slider"
            tabindex="0"
            aria-label="Audio progress"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
          >
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                style="width: {duration ? (currentTime / duration) * 100 : 0}%"
              ></div>
            </div>
            {#if duration > 0}
              <span class="time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>
            {/if}
          </div>
        </div>

        {#if loading}
          <p class="loading-hint">
            {#if $selectedVoice?.provider === 'azure'}
              Generating (~3 seconds)...
            {:else}
              Generating (~30 seconds)...
            {/if}
          </p>
        {/if}

        {#if audioUrl}
          <a href={audioUrl} download="audioflam-story.mp3" class="download-link">Download Audio</a>
        {/if}
      </div>
    {/if}
  </main>
</div>

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

  .text-editor-wrapper {
    position: relative;
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

  .text-editor {
    min-height: 150px;
    padding: var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    line-height: 1.6;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .text-editor:focus {
    border-color: var(--color-primary);
  }

  .expand-marker {
    position: absolute;
    bottom: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-border-dark);
    pointer-events: none;
    opacity: 0.5;
  }

  .intro-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;
  }

  .intro-step {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .step-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  .intro-step p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .error-msg {
    color: #dc2626;
    text-align: center;
    font-size: var(--font-size-sm);
  }

  .loading-hint {
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .play-btn {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    border: 2px solid var(--color-border);
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .play-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .play-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .play-btn img {
    width: 24px;
    height: 24px;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }

  .progress-bar {
    height: 6px;
    background: var(--color-border);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: var(--radius-full);
    transition: width 0.1s linear;
  }

  .time-display {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .download-link {
    display: block;
    text-align: center;
    color: var(--color-text-primary);
    font-weight: 600;
    text-decoration: none;
    font-size: var(--font-size-base);
  }

  .download-link:hover {
    color: var(--color-primary);
  }
</style>
