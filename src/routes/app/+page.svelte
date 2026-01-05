<script lang="ts">
  import { ALL_VOICES, selectedVoice, textInput } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';

  let hasTextInput = $state(false);
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editorRef: HTMLDivElement;
  
  let duration = $state(0);
  let isPlaying = $state(false);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let lastGeneratedText = $state('');

  $effect(() => {
    hasTextInput = $textInput.trim().length > 0;
  });

  function handleVoiceChange(voice: VoiceOption) {
    selectedVoice.set(voice);
    if (audioUrl) {
      audioUrl = null;
      audioElement = null;
      isPlaying = false;
      lastGeneratedText = '';
    }
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
      audioElement.addEventListener('ended', () => {
        isPlaying = false;
      });
      
      lastGeneratedText = $textInput.trim();
      audioElement.play();
      isPlaying = true;
      
    } catch (err: unknown) {
      console.error(err);
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loading = false;
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
        <span class="char-count" class:warning={$textInput.length > 3200}>
          {$textInput.length}/4000
        </span>
      </div>
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

      {#if audioUrl}
        <a href={audioUrl} download="audioflam-story.mp3" class="download-link">Download Audio</a>
      {/if}
    </div>
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
    border: 3px solid #999999 !important;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color var(--transition-fast);
    flex-shrink: 0;
    position: relative;
    overflow: visible;
  }

  .play-btn .play-icon {
    width: 40px;
    height: 40px;
    filter: brightness(0) saturate(100%) invert(60%);
    transition: filter var(--transition-fast);
    position: relative;
    z-index: 2;
  }

  .play-btn.active {
    border-color: var(--color-primary) !important;
  }

  .play-btn.active .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
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
