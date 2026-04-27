<script lang="ts">
  import { bulletinStore, INTRO_OUTRO_SOUNDS, TRANSITION_SOUNDS } from '$lib/stores/bulletin';

  // Local UI state
  let isOpen = $state(false);

  // Derived from store
  let soundsEnabled = $derived($bulletinStore.soundsEnabled);
  let selectedIntroOutroSound = $derived($bulletinStore.selectedIntroOutroSound);
  let selectedTransitionSound = $derived($bulletinStore.selectedTransitionSound);

  // Audio preview state
  let playingSound = $state<string | null>(null);
  let previewAudio: HTMLAudioElement | null = null;

  function handleToggle() {
    const newEnabled = !soundsEnabled;
    bulletinStore.update(s => ({ ...s, soundsEnabled: newEnabled }));
    if (newEnabled && !isOpen) isOpen = true;
    if (!newEnabled) isOpen = false;
  }

  function handleChevronClick() {
    if (!soundsEnabled) return;
    isOpen = !isOpen;
  }

  function selectIntroOutroSound(filename: string | null) {
    bulletinStore.update(s => ({ ...s, selectedIntroOutroSound: filename }));
  }

  function selectTransitionSound(filename: string | null) {
    bulletinStore.update(s => ({ ...s, selectedTransitionSound: filename }));
  }

  function previewSound(event: MouseEvent, filename: string) {
    event.stopPropagation();

    if (playingSound === filename) {
      stopPreview();
      return;
    }

    stopPreview();
    playingSound = filename;

    previewAudio = new Audio(`/sounds/${filename}`);
    previewAudio.onended = () => { playingSound = null; };
    previewAudio.onerror = () => { playingSound = null; };
    previewAudio.play();
  }

  function stopPreview() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio = null;
    }
    playingSound = null;
  }
</script>

<div class="toggle-panel" class:open={isOpen} class:active={soundsEnabled}>
  <div class="panel-header">
    <button
      type="button"
      class="chevron-btn"
      class:disabled={!soundsEnabled}
      onclick={handleChevronClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse sounds' : 'Expand sounds'}
    >
      <img
        src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="chevron-icon"
      />
    </button>
    <span class="panel-label">Sounds</span>
    <button
      type="button"
      class="toggle-switch"
      class:active={soundsEnabled}
      onclick={handleToggle}
      aria-pressed={soundsEnabled}
      aria-label="Toggle sounds"
    >
      <span class="toggle-thumb"></span>
    </button>
  </div>

  {#if isOpen}
    <div class="panel-content">

      <!-- Intro & Outro Sound section -->
      <div class="sound-section">
        <h3 class="section-title">Intro &amp; Outro Sound</h3>
        <div class="sound-list">

          <!-- None option -->
          <div class="sound-row">
            <label class="radio-label">
              <input
                type="radio"
                name="intro-outro-sound"
                value=""
                checked={selectedIntroOutroSound === null}
                onchange={() => selectIntroOutroSound(null)}
                class="radio-input"
              />
              <span class="radio-custom" class:checked={selectedIntroOutroSound === null}></span>
              <span class="sound-name">None</span>
            </label>
          </div>

          {#each INTRO_OUTRO_SOUNDS as filename}
            <div class="sound-row">
              <label class="radio-label">
                <input
                  type="radio"
                  name="intro-outro-sound"
                  value={filename}
                  checked={selectedIntroOutroSound === filename}
                  onchange={() => selectIntroOutroSound(filename)}
                  class="radio-input"
                />
                <span class="radio-custom" class:checked={selectedIntroOutroSound === filename}></span>
                <span class="sound-name">{filename}</span>
              </label>
              <button
                type="button"
                class="play-btn"
                class:playing={playingSound === filename}
                onclick={(e) => previewSound(e, filename)}
                aria-label={playingSound === filename ? `Stop ${filename}` : `Play ${filename}`}
              >
                <img
                  src={playingSound === filename ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'}
                  alt=""
                  class="play-icon"
                />
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- Transition Sound section -->
      <div class="sound-section">
        <h3 class="section-title">Transition Sound</h3>
        <div class="sound-list">

          <!-- None option -->
          <div class="sound-row">
            <label class="radio-label">
              <input
                type="radio"
                name="transition-sound"
                value=""
                checked={selectedTransitionSound === null}
                onchange={() => selectTransitionSound(null)}
                class="radio-input"
              />
              <span class="radio-custom" class:checked={selectedTransitionSound === null}></span>
              <span class="sound-name">None</span>
            </label>
          </div>

          {#each TRANSITION_SOUNDS as filename}
            <div class="sound-row">
              <label class="radio-label">
                <input
                  type="radio"
                  name="transition-sound"
                  value={filename}
                  checked={selectedTransitionSound === filename}
                  onchange={() => selectTransitionSound(filename)}
                  class="radio-input"
                />
                <span class="radio-custom" class:checked={selectedTransitionSound === filename}></span>
                <span class="sound-name">{filename}</span>
              </label>
              <button
                type="button"
                class="play-btn"
                class:playing={playingSound === filename}
                onclick={(e) => previewSound(e, filename)}
                aria-label={playingSound === filename ? `Stop ${filename}` : `Play ${filename}`}
              >
                <img
                  src={playingSound === filename ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'}
                  alt=""
                  class="play-icon"
                />
              </button>
            </div>
          {/each}
        </div>
      </div>

    </div>
  {/if}
</div>

<style>
  .toggle-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: hidden;
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

  .sound-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .section-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin: 0;
  }

  .section-divider {
    height: 1px;
    background: var(--color-border);
  }

  .sound-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sound-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    flex: 1;
  }

  /* Hide native radio */
  .radio-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  /* Custom radio circle */
  .radio-custom {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--color-border-active);
    background: var(--bg-white);
    flex-shrink: 0;
    position: relative;
    transition: border-color var(--transition-normal);
  }

  .radio-custom.checked {
    border-color: var(--color-primary);
  }

  .radio-custom.checked::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
  }

  .sound-name {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
  }

  .play-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition: background-color var(--transition-normal);
  }

  .play-btn:hover {
    background-color: var(--color-highlight);
  }

  .play-icon {
    width: 20px;
    height: 20px;
    filter: invert(0.32) sepia(0.6) hue-rotate(248deg) saturate(1.5);
  }

  .play-btn.playing .play-icon {
    filter: invert(0.2) sepia(0.8) hue-rotate(248deg) saturate(2);
  }
</style>
