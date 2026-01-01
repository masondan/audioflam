<script lang="ts">
  import { NIGERIAN_VOICES, selectedLanguage, selectedVoice, textInput } from '$lib/stores';
  import type { LanguageCode, VoiceOption } from '$lib/stores';
  import Dropdown from '$lib/components/Dropdown.svelte';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';

  const LANGUAGES = [
    { value: 'en-NG', label: 'English (Nigerian)' },
    { value: 'en-GB', label: 'English (British)' }
  ];

  let hasTextInput = $state(false);
  let loading = $state(false);
  let audioUrl = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);
  let editorRef: HTMLDivElement;
  
  let speed = $state(1);
  let pitch = $state(1);
  let currentTime = $state(0);
  let duration = $state(0);
  let isPlaying = $state(false);
  let audioElement: HTMLAudioElement | null = null;

  $effect(() => {
    hasTextInput = $textInput.trim().length > 0;
  });

  function handleLanguageChange(value: string) {
    const lang = value as LanguageCode;
    selectedLanguage.set(lang);
    selectedVoice.set(NIGERIAN_VOICES[lang][0]);
  }

  function handleVoiceChange(voice: VoiceOption) {
    selectedVoice.set(voice);
  }

  function handleEditorInput() {
    if (editorRef) {
      textInput.set(editorRef.innerText);
    }
  }

  function handleEditorFocus() {
    hasTextInput = true;
  }

  function insertPause() {
    const selection = window.getSelection();
    if (!selection || !editorRef.contains(selection.anchorNode)) return;
    
    const range = selection.getRangeAt(0);
    const pauseSpan = document.createElement('span');
    pauseSpan.className = 'pause-marker';
    pauseSpan.textContent = ' … ';
    pauseSpan.contentEditable = 'false';
    pauseSpan.dataset.ssml = 'break';
    
    range.deleteContents();
    range.insertNode(pauseSpan);
    range.setStartAfter(pauseSpan);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    
    handleEditorInput();
  }

  function applyEmphasis() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editorRef.contains(range.commonAncestorContainer)) return;
    
    const emphasisSpan = document.createElement('span');
    emphasisSpan.className = 'emphasis-marker';
    emphasisSpan.dataset.ssml = 'emphasis';
    
    try {
      range.surroundContents(emphasisSpan);
    } catch {
      const fragment = range.extractContents();
      emphasisSpan.appendChild(fragment);
      range.insertNode(emphasisSpan);
    }
    
    selection.removeAllRanges();
    handleEditorInput();
  }

  function resetFormatting() {
    if (editorRef) {
      const plainText = editorRef.innerText;
      editorRef.innerHTML = '';
      editorRef.textContent = plainText;
      handleEditorInput();
    }
  }

  function getSSMLContent(): string {
    if (!editorRef) return $textInput;
    
    let ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">';
    
    const speedMap: Record<number, string> = { 0: 'slow', 1: 'medium', 2: 'fast' };
    const pitchMap: Record<number, string> = { 0: 'low', 1: 'medium', 2: 'high' };
    
    ssml += `<prosody rate="${speedMap[speed]}" pitch="${pitchMap[pitch]}">`;
    
    function processNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        
        if (el.dataset.ssml === 'break') {
          return '<break time="500ms"/>';
        }
        
        if (el.dataset.ssml === 'emphasis') {
          let content = '';
          el.childNodes.forEach(child => {
            content += processNode(child);
          });
          return `<emphasis level="strong">${content}</emphasis>`;
        }
        
        let content = '';
        el.childNodes.forEach(child => {
          content += processNode(child);
        });
        return content;
      }
      
      return '';
    }
    
    editorRef.childNodes.forEach(node => {
      ssml += processNode(node);
    });
    
    ssml += '</prosody></speak>';
    return ssml;
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
      const ssmlContent = getSSMLContent();
      
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssml: ssmlContent,
          voiceName: $selectedVoice?.name
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate');
      }
      
      const data = await res.json();
      const byteCharacters = atob(data.audioContent);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
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
      <Dropdown 
        label="Language"
        options={LANGUAGES}
        value={$selectedLanguage}
        onchange={handleLanguageChange}
      />
      
      <VoiceDropdown
        label="Voice"
        voices={NIGERIAN_VOICES[$selectedLanguage]}
        value={$selectedVoice}
        onchange={handleVoiceChange}
      />
    </div>

    <div class="text-section">
      <span class="text-label" id="text-label">Text</span>
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
    </div>

    {#if !hasTextInput}
      <div class="intro-section">
        <div class="intro-step">
          <img src="/icons/icon-one.svg" alt="1" class="step-icon" />
          <p>Select language and voice</p>
        </div>
        <div class="intro-step">
          <img src="/icons/icon-two.svg" alt="2" class="step-icon" />
          <p>Add text, generate and play. Adjust speed and pitch. Highlight text to add emphasis. Tap in a space to add a pause.</p>
        </div>
        <div class="intro-step">
          <img src="/icons/icon-three.svg" alt="3" class="step-icon" />
          <p>Download MP3.</p>
        </div>
      </div>
    {:else}
      <div class="controls-section">
        <div class="ssml-buttons">
          <button type="button" class="ssml-btn" onclick={insertPause}>Pause</button>
          <button type="button" class="ssml-btn" onclick={applyEmphasis}>Emphasis</button>
          <button type="button" class="ssml-btn" onclick={resetFormatting}>Reset</button>
        </div>

        <div class="sliders-row">
          <div class="slider-group">
            <label for="speed-slider">Speed</label>
            <input 
              id="speed-slider"
              type="range" 
              min="0" 
              max="2" 
              step="1" 
              bind:value={speed}
              class="slider"
            />
          </div>
          <div class="slider-group">
            <label for="pitch-slider">Pitch</label>
            <input 
              id="pitch-slider"
              type="range" 
              min="0" 
              max="2" 
              step="1" 
              bind:value={pitch}
              class="slider"
            />
          </div>
        </div>

        {#if errorMsg}
          <p class="error-msg">{errorMsg}</p>
        {/if}

        <div class="player-row">
          <button 
            type="button" 
            class="play-btn" 
            onclick={generateAndPlay}
            disabled={loading || !$textInput.trim()}
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

        {#if audioUrl}
          <a href={audioUrl} download="audioflam-story.mp3" class="download-link">Download</a>
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
    gap: var(--spacing-md);
  }

  .text-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .text-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
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

  .text-editor :global(.pause-marker) {
    color: var(--color-pause);
    font-weight: 700;
    user-select: none;
  }

  .text-editor :global(.emphasis-marker) {
    color: var(--color-emphasis);
    font-weight: 600;
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

  .ssml-buttons {
    display: flex;
    gap: var(--spacing-sm);
  }

  .ssml-btn {
    flex: 1;
    padding: 10px var(--spacing-md);
    background: var(--color-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .ssml-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .ssml-btn:active {
    background: var(--color-lavender-veil);
  }

  .sliders-row {
    display: flex;
    gap: var(--spacing-lg);
  }

  .slider-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .slider-group label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .slider {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--color-border);
    border-radius: var(--radius-full);
    outline: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--color-text-primary);
    border-radius: 50%;
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--color-text-primary);
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .error-msg {
    color: #dc2626;
    text-align: center;
    font-size: var(--font-size-sm);
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
