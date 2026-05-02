<script lang="ts">
  import { bulletinStore, bulletinPanelStore } from '$lib/stores/bulletin';
  import { ALL_VOICES } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import SpeedSlider from '$lib/components/SpeedSlider.svelte';
  import SilenceSlider from '$lib/components/SilenceSlider.svelte';
  import { concatenateAudioSegments, removeSilence, type SilenceLevel } from '$lib/audioProcessing';
  import { timeStretch, audioBufferToWav } from '$lib/utils/timestretch';

  // Props
  let { onSettingsChange }: { onSettingsChange?: () => void } = $props();

  // Local UI state
  let openPanel = $derived($bulletinPanelStore);
  let isOpen = $derived(openPanel === 'intro-outro');
  let adjustAudioOpen = $state(false);

  // Derived from store
  let introOutroEnabled = $derived($bulletinStore.introOutroEnabled);
  let introScript = $derived($bulletinStore.introScript);
  let outroScript = $derived($bulletinStore.outroScript);
  let introOutroVoice = $derived($bulletinStore.introOutroVoice);
  let introOutroSpeed = $derived($bulletinStore.introOutroSpeed);
  let introOutroSilence = $derived($bulletinStore.introOutroSilence);

  // Selected voice object derived from store voice name
  const selectedVoiceObj = $derived(
    ALL_VOICES.find(v => v.name === introOutroVoice) ?? null
  );

  // Voice dropdown open state
  let voiceDropdownOpen = $state(false);
  let voiceDropdownRef = $state<HTMLDivElement | undefined>(undefined);

  // Voice preview state
  let playingVoice = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;

  // Preview audio state
  let isGeneratingPreview = $state(false);
  let isPlayingPreview = $state(false);
  let previewAudioElement = $state<HTMLAudioElement | null>(null);
  let previewError = $state('');

  function handleToggle() {
    const newEnabled = !introOutroEnabled;
    bulletinStore.update(s => ({ ...s, introOutroEnabled: newEnabled }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
    if (newEnabled && !isOpen) bulletinPanelStore.setOpen('intro-outro');
    if (!newEnabled) bulletinPanelStore.close();
  }

  function handleChevronClick() {
    if (!introOutroEnabled) return;
    if (isOpen) {
      bulletinPanelStore.close();
    } else {
      bulletinPanelStore.setOpen('intro-outro');
    }
  }

  function handleIntroInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    bulletinStore.update(s => ({ ...s, introScript: val }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
  }

  function handleOutroInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    bulletinStore.update(s => ({ ...s, outroScript: val }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
  }

  function selectVoice(voice: VoiceOption) {
    bulletinStore.update(s => ({ ...s, introOutroVoice: voice.name }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
    voiceDropdownOpen = false;
    stopVoicePreview();
  }

  function toggleVoiceDropdown() {
    voiceDropdownOpen = !voiceDropdownOpen;
    if (!voiceDropdownOpen) stopVoicePreview();
  }

  function handleVoiceClickOutside(event: MouseEvent) {
    if (voiceDropdownRef && !(voiceDropdownRef as HTMLDivElement).contains(event.target as Node)) {
      voiceDropdownOpen = false;
      stopVoicePreview();
    }
  }

  $effect(() => {
    if (voiceDropdownOpen) {
      document.addEventListener('click', handleVoiceClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleVoiceClickOutside);
    };
  });

  function getPreviewFilename(voice: VoiceOption): string {
    const baseName = voice.displayName.split(' ')[0].split('(')[0].toLowerCase();
    return `/voices/${baseName}.mp3`;
  }

  function previewVoice(event: MouseEvent, voice: VoiceOption) {
    event.stopPropagation();
    if (playingVoice === voice.name) {
      stopVoicePreview();
      return;
    }
    stopVoicePreview();
    playingVoice = voice.name;
    const url = getPreviewFilename(voice);
    previewAudio = new Audio(url);
    previewAudio.onended = () => { playingVoice = null; };
    previewAudio.onerror = () => { playingVoice = null; };
    previewAudio.play();
  }

  function stopVoicePreview() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio = null;
    }
    playingVoice = null;
  }

  function getFlagForVoice(voice: VoiceOption): string {
    if (voice.provider === 'azure') {
      if (voice.name.startsWith('en-NG')) return '🇳🇬';
      if (voice.name.startsWith('en-GB')) return '🇬🇧';
    }
    if (voice.provider === 'yarngpt') return '🇳🇬';
    if (voice.provider === 'minimax') {
      if (voice.description.includes('Malawi')) return '🇲🇼';
      if (voice.description.includes('Zimbabwe')) return '🇿🇼';
    }
    return '';
  }

  function wordCount(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function estimatedDuration(text: string): number {
    return Math.round(wordCount(text) / 2.5);
  }

  function handleSpeedChange(speed: number) {
    bulletinStore.update(s => ({ ...s, introOutroSpeed: speed }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
  }

  function handleSilenceChange(level: 'default' | 'trim' | 'tight') {
    bulletinStore.update(s => ({ ...s, introOutroSilence: level }));
    bulletinStore.clearBulletinAudio();
    onSettingsChange?.();
  }

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
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function decodeAudio(base64Audio: string): Promise<AudioBuffer> {
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
      return audioBuffer;
    } finally {
      await audioContext.close();
    }
  }

  async function processAudioSegment(base64Audio: string, speed: number, silenceLevel: SilenceLevel): Promise<string> {
    let processedBase64 = base64Audio;

    // Apply speed adjustment if not 1.0
    if (speed !== 1.0) {
      try {
        const buffer = await decodeAudio(base64Audio);
        const stretchedBuffer = await timeStretch(buffer, speed);
        const blob = audioBufferToWav(stretchedBuffer);
        processedBase64 = await blobToBase64(blob);
      } catch (e) {
        console.error('[BulletinIntroOutro] Speed adjustment failed:', e);
        // Continue with original audio if speed adjustment fails
      }
    }

    // Apply silence removal if not default
    if (silenceLevel !== 'default') {
      try {
        const result = await removeSilence(processedBase64, silenceLevel);
        processedBase64 = await blobToBase64(result.blob);
      } catch (e) {
        console.error('[BulletinIntroOutro] Silence removal failed:', e);
        // Continue with current audio if silence removal fails
      }
    }

    return processedBase64;
  }

  async function generatePreview() {
    // If currently playing, stop playback
    if (isPlayingPreview && previewAudioElement) {
      previewAudioElement.pause();
      isPlayingPreview = false;
      return;
    }

    // If generating, do nothing
    if (isGeneratingPreview) return;

    if (!introScript.trim() && !outroScript.trim()) return;
    if (!introOutroVoice) return;

    isGeneratingPreview = true;
    previewError = '';

    try {
      const audioSegments: string[] = [];

      // Generate intro TTS if present
      if (introScript.trim()) {
        const introResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: introScript,
            voiceName: introOutroVoice,
            provider: 'azure'
          })
        });

        if (!introResponse.ok) throw new Error('Intro TTS failed');
        const introData = await introResponse.json();
        
        // Apply speed and silence processing
        const processedIntroAudio = await processAudioSegment(
          introData.audioContent,
          introOutroSpeed,
          introOutroSilence
        );
        
        audioSegments.push(processedIntroAudio);
        bulletinStore.update(s => ({ ...s, introTtsAudio: processedIntroAudio }));
      }

      // Generate outro TTS if present
      if (outroScript.trim()) {
        const outroResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: outroScript,
            voiceName: introOutroVoice,
            provider: 'azure'
          })
        });

        if (!outroResponse.ok) throw new Error('Outro TTS failed');
        const outroData = await outroResponse.json();
        
        // Apply speed and silence processing
        const processedOutroAudio = await processAudioSegment(
          outroData.audioContent,
          introOutroSpeed,
          introOutroSilence
        );
        
        audioSegments.push(processedOutroAudio);
        bulletinStore.update(s => ({ ...s, outroTtsAudio: processedOutroAudio }));
      }

      // Concatenate segments
      if (audioSegments.length > 0) {
        const concatenatedBlob = await concatenateAudioSegments(audioSegments);
        const url = URL.createObjectURL(concatenatedBlob);
        
        // Stop any existing preview
        if (previewAudioElement) {
          previewAudioElement.pause();
        }

        previewAudioElement = new Audio(url);
        previewAudioElement.onended = () => { isPlayingPreview = false; };
        previewAudioElement.onerror = () => {
          isPlayingPreview = false;
          previewError = 'Could not play preview audio';
        };
        
        // Auto-play
        previewAudioElement.play();
        isPlayingPreview = true;
      }
    } catch (e) {
      previewError = 'Could not generate preview. Please try again.';
      console.error('[BulletinIntroOutro]', e);
    } finally {
      isGeneratingPreview = false;
    }
  }

  function togglePreviewPlayPause() {
    if (!previewAudioElement) return;
    if (isPlayingPreview) {
      previewAudioElement.pause();
      isPlayingPreview = false;
    } else {
      previewAudioElement.play();
      isPlayingPreview = true;
    }
  }
</script>

<div class="toggle-panel" class:open={isOpen} class:active={introOutroEnabled}>
  <div class="panel-header">
    <button
      type="button"
      class="chevron-btn"
      class:disabled={!introOutroEnabled}
      onclick={handleChevronClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse intro & outro' : 'Expand intro & outro'}
    >
      <img
        src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="chevron-icon"
      />
    </button>
    <span class="panel-label">Intro &amp; Outro</span>
    <button
      type="button"
      class="toggle-switch"
      class:active={introOutroEnabled}
      onclick={handleToggle}
      aria-pressed={introOutroEnabled}
      aria-label="Toggle intro and outro"
    >
      <span class="toggle-thumb"></span>
    </button>
  </div>

  {#if isOpen}
    <div class="panel-content">

      <!-- Voice selector -->
      <div class="field-group">
        <label class="field-label" for="intro-outro-voice">Voice</label>
        <div class="dropdown" bind:this={voiceDropdownRef}>
          <button
            id="intro-outro-voice"
            type="button"
            class="dropdown-trigger"
            class:open={voiceDropdownOpen}
            onclick={toggleVoiceDropdown}
            aria-expanded={voiceDropdownOpen}
            aria-haspopup="listbox"
          >
            <span class="dropdown-value" class:placeholder={!selectedVoiceObj}>
              {selectedVoiceObj
                ? `${getFlagForVoice(selectedVoiceObj)} ${selectedVoiceObj.displayName}`
                : 'Select voice'}
            </span>
            <img
              src={voiceDropdownOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
              alt=""
              class="dropdown-icon"
            />
          </button>
          {#if voiceDropdownOpen}
            <ul class="dropdown-menu" role="listbox">
              {#each ALL_VOICES as voice, i}
                <li>
                  <div class="dropdown-option-row">
                    <button
                      type="button"
                      class="dropdown-option"
                      class:selected={voice.name === introOutroVoice}
                      onclick={() => selectVoice(voice)}
                      role="option"
                      aria-selected={voice.name === introOutroVoice}
                    >
                      <span class="voice-name">
                        <span class="flag">{getFlagForVoice(voice)}</span>
                        {voice.displayName}
                      </span>
                      {#if voice.provider === 'azure'}
                        <span class="speed-badge">⚡</span>
                      {/if}
                    </button>
                    <button
                      type="button"
                      class="preview-voice-btn"
                      class:playing={playingVoice === voice.name}
                      onclick={(e) => previewVoice(e, voice)}
                      aria-label={`Preview ${voice.displayName}`}
                    >
                      <img
                        src={playingVoice === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'}
                        alt=""
                        class="preview-voice-icon"
                      />
                    </button>
                  </div>
                </li>
                {#if i < ALL_VOICES.length - 1}
                  <li class="dropdown-separator" role="separator"></li>
                {/if}
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <!-- Intro textarea -->
      <div class="field-group">
        <label class="field-label" for="intro-text">Intro</label>
        <textarea
          id="intro-text"
          class="script-textarea"
          placeholder="Add your intro here…"
          value={introScript}
          oninput={handleIntroInput}
          rows="3"
        ></textarea>
        {#if introScript.trim()}
          <span class="word-count">{wordCount(introScript)} words · ~{estimatedDuration(introScript)}s</span>
        {/if}
      </div>

      <!-- Outro textarea -->
      <div class="field-group">
        <label class="field-label" for="outro-text">Outro</label>
        <textarea
          id="outro-text"
          class="script-textarea"
          placeholder="Add your outro here…"
          value={outroScript}
          oninput={handleOutroInput}
          rows="3"
        ></textarea>
        {#if outroScript.trim()}
          <span class="word-count">{wordCount(outroScript)} words · ~{estimatedDuration(outroScript)}s</span>
        {/if}
      </div>

      <!-- Preview button -->
      <button
        type="button"
        class="preview-btn"
        class:playing={isPlayingPreview && previewAudioElement}
        onclick={generatePreview}
        disabled={(!introScript.trim() && !outroScript.trim()) || !introOutroVoice || isGeneratingPreview}
      >
        {#if isGeneratingPreview}
          <span class="btn-text">Generating</span>
          <span class="spinner" />
        {:else if previewAudioElement && isPlayingPreview}
          <span class="btn-text">Playing</span>
          <img src="/icons/icon-square-fill.svg" alt="" class="btn-icon" />
        {:else}
          <span class="btn-text">Preview</span>
          <img src="/icons/icon-play-fill.svg" alt="" class="btn-icon" />
        {/if}
      </button>

      {#if previewError}
        <p class="error-text">{previewError}</p>
      {/if}

      <!-- Adjust audio section -->
      <div class="adjust-audio-section" class:inactive={!previewAudioElement}>
        <button
          type="button"
          class="adjust-audio-header"
          class:inactive={!previewAudioElement}
          onclick={() => { if (previewAudioElement) adjustAudioOpen = !adjustAudioOpen; }}
          aria-expanded={adjustAudioOpen && previewAudioElement !== null}
          disabled={!previewAudioElement}
        >
          <span class="adjust-audio-label">Adjust audio</span>
          <img
            src={adjustAudioOpen && previewAudioElement ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
            alt=""
            class="adjust-audio-chevron"
          />
        </button>

        {#if adjustAudioOpen && previewAudioElement}
          <div class="adjust-audio-content">
            <div class="adjust-audio-row">
              <div class="adjust-audio-slider">
                <div class="slider-header">
                  <span class="slider-label-text">Speed</span>
                </div>
                <SpeedSlider
                  speed={introOutroSpeed}
                  isActive={!isPlayingPreview}
                  onSpeedChange={handleSpeedChange}
                  size="small"
                />
              </div>

              <div class="adjust-audio-slider">
                <div class="slider-header">
                  <span class="slider-label-text">Silence</span>
                </div>
                <SilenceSlider
                  level={introOutroSilence}
                  isActive={!isPlayingPreview}
                  onLevelChange={handleSilenceChange}
                  size="small"
                />
              </div>
            </div>
          </div>
        {/if}
      </div>

    </div>
  {/if}
</div>

<style>
  .toggle-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: visible;
    transition: border-color var(--transition-normal);
  }

  .toggle-panel.active {
    border-color: var(--color-border-active);
  }

  .panel-header {
    display: flex;
    align-items: center;
    padding: 12px var(--spacing-md);
    gap: var(--spacing-sm);
  }

  .chevron-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity var(--transition-normal);
  }

  .chevron-btn.disabled {
    cursor: default;
    opacity: 0.4;
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
  }

  .panel-label {
    flex: 1;
    font-size: var(--font-size-base);
    color: #777777;
    font-weight: var(--font-weight-medium);
    transition: color var(--transition-normal);
  }

  .toggle-panel.active .panel-label {
    color: var(--text-primary);
  }

  .toggle-switch {
    width: 44px;
    height: 24px;
    background: #999999;
    border: none;
    border-radius: var(--radius-round);
    cursor: pointer;
    position: relative;
    transition: background var(--transition-normal);
    padding: 0;
    flex-shrink: 0;
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
    background: var(--bg-white);
    border-radius: 50%;
    transition: transform var(--transition-normal);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .panel-content {
    padding: 0 var(--spacing-md) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .field-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  /* Voice dropdown */
  .dropdown {
    position: relative;
    width: 100%;
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px var(--spacing-md);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--transition-normal);
  }

  .dropdown-trigger.open {
    border-color: var(--color-border-active);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dropdown-value {
    text-align: left;
  }

  .dropdown-value.placeholder {
    color: var(--text-secondary);
  }

  .dropdown-icon {
    width: 18px;
    height: 18px;
    filter: invert(0.4);
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    left: 0;
    right: 0;
    background: var(--bg-white);
    border: 1px solid var(--color-border-active);
    border-top: none;
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    list-style: none;
    margin: 0;
    padding: 0;
    z-index: 200;
    max-height: 240px;
    overflow-y: auto;
  }

  .dropdown-option-row {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .dropdown-option {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 10px var(--spacing-md);
    background: none;
    border: none;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-normal);
  }

  .dropdown-option:hover {
    background-color: var(--color-highlight);
  }

  .dropdown-option.selected {
    color: var(--color-primary);
    font-weight: var(--font-weight-semibold);
  }

  .voice-name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .speed-badge {
    font-size: 12px;
    margin-left: 4px;
  }

  .preview-voice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .preview-voice-icon {
    width: 24px;
    height: 24px;
    filter: invert(0.54) sepia(0.5) hue-rotate(248deg);
  }

  .preview-voice-btn.playing .preview-voice-icon {
    filter: invert(0.32) sepia(0.6) hue-rotate(248deg) saturate(1.5);
  }

  .dropdown-separator {
    height: 1px;
    background-color: var(--color-border);
    margin: 0 var(--spacing-md);
  }

  .flag {
    display: inline-block;
    width: 20px;
    text-align: center;
  }

  /* Textarea */
  .script-textarea {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-family: var(--font-family-base);
    line-height: var(--line-height-normal);
    color: var(--text-primary);
    background: var(--bg-white);
    resize: vertical;
    transition: border-color var(--transition-normal);
    box-sizing: border-box;
  }

  .script-textarea:focus {
    outline: none;
    border-color: var(--color-border-active);
  }

  .script-textarea::placeholder {
    color: var(--text-secondary);
  }

  .word-count {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    text-align: right;
  }

  /* Preview button */
  .preview-btn {
    width: 100%;
    padding: 12px var(--spacing-md);
    background: var(--color-primary);
    color: var(--bg-white);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background var(--transition-normal);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
  }

  .preview-btn:hover:not(:disabled):not(.playing) {
    background: #4a1d9e;
  }

  .preview-btn:disabled {
    background: var(--color-border);
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  .preview-btn:disabled:has(.spinner) {
    background: var(--color-primary);
    color: var(--bg-white);
    cursor: default;
  }

  .btn-text {
    display: inline;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    filter: invert(1);
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-text {
    font-size: var(--font-size-sm);
    color: #d32f2f;
    margin: 0;
  }

  /* Adjust audio section */
  .adjust-audio-section {
    border-top: 1px solid var(--color-border);
    padding-top: var(--spacing-md);
  }

  .adjust-audio-section.inactive {
    opacity: 0.5;
    pointer-events: none;
  }

  .adjust-audio-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    transition: color var(--transition-normal);
  }

  .adjust-audio-header:disabled {
    cursor: not-allowed;
  }

  .adjust-audio-header.inactive {
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  .adjust-audio-label {
    flex: 1;
    text-align: left;
  }

  .adjust-audio-chevron {
    width: 18px;
    height: 18px;
    filter: invert(0.4);
    flex-shrink: 0;
  }

  .adjust-audio-content {
    padding-top: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .adjust-audio-row {
    display: flex;
    gap: var(--spacing-md);
  }

  .adjust-audio-slider {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .slider-label-text {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }
</style>
