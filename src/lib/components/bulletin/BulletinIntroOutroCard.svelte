<script lang="ts">
  import { bulletinStore } from '$lib/stores/bulletin';
  import { ALL_VOICES } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import SpeedSilenceControls from '$lib/components/SpeedSilenceControls.svelte';

  type SpeedLevel = 'default' | 'lively' | 'fast';
  type SilenceLevel = 'default' | 'trim' | 'tight';

  // Local UI state
  let isOpen = $state(false);

  // Derived from store
  let introOutroEnabled = $derived($bulletinStore.introOutroEnabled);
  let introScript = $derived($bulletinStore.introScript);
  let outroScript = $derived($bulletinStore.outroScript);
  let introOutroVoice = $derived($bulletinStore.introOutroVoice);

  // Local speed/silence state (static for Checkpoint 2 — wired in Checkpoint 5)
  let speedLevel = $state<SpeedLevel>('default');
  let silenceLevel = $state<SilenceLevel>('default');

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

  function handleToggle() {
    const newEnabled = !introOutroEnabled;
    bulletinStore.update(s => ({ ...s, introOutroEnabled: newEnabled }));
    if (newEnabled && !isOpen) isOpen = true;
    if (!newEnabled) isOpen = false;
  }

  function handleChevronClick() {
    if (!introOutroEnabled) return;
    isOpen = !isOpen;
  }

  function handleIntroInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    bulletinStore.update(s => ({ ...s, introScript: val }));
  }

  function handleOutroInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    bulletinStore.update(s => ({ ...s, outroScript: val }));
  }

  function selectVoice(voice: VoiceOption) {
    bulletinStore.update(s => ({ ...s, introOutroVoice: voice.name }));
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

      <!-- Speed & Silence controls -->
      <div class="field-group">
        <SpeedSilenceControls
          {speedLevel}
          {silenceLevel}
          isActive={true}
          onSpeedChange={(l) => { speedLevel = l; }}
          onSilenceChange={(l) => { silenceLevel = l; }}
        />
      </div>

      <!-- Intro textarea -->
      <div class="field-group">
        <label class="field-label" for="intro-text">Intro</label>
        <textarea
          id="intro-text"
          class="script-textarea"
          placeholder="Type your intro here…"
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
          placeholder="Type your outro here…"
          value={outroScript}
          oninput={handleOutroInput}
          rows="3"
        ></textarea>
        {#if outroScript.trim()}
          <span class="word-count">{wordCount(outroScript)} words · ~{estimatedDuration(outroScript)}s</span>
        {/if}
      </div>

      <!-- Preview button (static — wired in Checkpoint 5) -->
      <button
        type="button"
        class="preview-btn"
        disabled={!introScript.trim() && !outroScript.trim()}
      >
        PREVIEW
      </button>

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
  }

  .preview-btn:hover:not(:disabled) {
    background: #4a1d9e;
  }

  .preview-btn:disabled {
    background: var(--color-border);
    color: var(--text-secondary);
    cursor: not-allowed;
  }
</style>
