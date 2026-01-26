<script lang="ts">
  type SpeedLevel = 'default' | 'lively' | 'fast';
  type SilenceLevel = 'default' | 'trim' | 'tight';

  interface Props {
    speedLevel: SpeedLevel;
    silenceLevel: SilenceLevel;
    isActive: boolean;
    onSpeedChange: (level: SpeedLevel) => void;
    onSilenceChange: (level: SilenceLevel) => void;
    onInactiveClick?: () => void;
  }

  let { 
    speedLevel = 'default', 
    silenceLevel = 'default', 
    isActive = false, 
    onSpeedChange, 
    onSilenceChange,
    onInactiveClick 
  }: Props = $props();

  let speedOpen = $state(false);
  let silenceOpen = $state(false);

  const speedSteps: { level: SpeedLevel; label: string; value: number }[] = [
    { level: 'default', label: 'Default', value: 1.0 },
    { level: 'lively', label: 'Lively', value: 1.15 },
    { level: 'fast', label: 'Fast', value: 1.25 }
  ];

  const silenceSteps: { level: SilenceLevel; label: string }[] = [
    { level: 'default', label: 'Default' },
    { level: 'trim', label: 'Trim' },
    { level: 'tight', label: 'Tight' }
  ];

  function getSpeedIndex(level: SpeedLevel): number {
    return speedSteps.findIndex(s => s.level === level);
  }

  function getSilenceIndex(level: SilenceLevel): number {
    return silenceSteps.findIndex(s => s.level === level);
  }

  function toggleSpeed() {
    if (!isActive) {
      onInactiveClick?.();
      return;
    }
    speedOpen = !speedOpen;
    if (speedOpen) {
      silenceOpen = false;
    }
  }

  function toggleSilence() {
    if (!isActive) {
      onInactiveClick?.();
      return;
    }
    silenceOpen = !silenceOpen;
    if (silenceOpen) {
      speedOpen = false;
    }
  }

  function handleSpeedSliderInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value);
    const step = speedSteps[value];
    if (step) {
      onSpeedChange(step.level);
    }
  }

  function handleSilenceSliderInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value);
    const step = silenceSteps[value];
    if (step) {
      onSilenceChange(step.level);
    }
  }

  function handleContainerClick() {
    if (!isActive) {
      onInactiveClick?.();
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="speed-silence-row" class:inactive={!isActive} onclick={handleContainerClick}>
  <div class="control-panel" class:open={speedOpen}>
    <button
      type="button"
      class="panel-header"
      onclick={toggleSpeed}
      aria-expanded={speedOpen}
    >
      <span class="panel-label">Speed</span>
      <img
        src={speedOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="panel-chevron"
      />
    </button>
    {#if speedOpen}
      <div class="panel-content">
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={getSpeedIndex(speedLevel)}
          oninput={handleSpeedSliderInput}
          class="discrete-slider"
        />
        <div class="slider-labels">
          {#each speedSteps as step}
            <span class="slider-label" class:active={speedLevel === step.level}>{step.label}</span>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="control-panel" class:open={silenceOpen}>
    <button
      type="button"
      class="panel-header"
      onclick={toggleSilence}
      aria-expanded={silenceOpen}
    >
      <span class="panel-label">Silence</span>
      <img
        src={silenceOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="panel-chevron"
      />
    </button>
    {#if silenceOpen}
      <div class="panel-content">
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={getSilenceIndex(silenceLevel)}
          oninput={handleSilenceSliderInput}
          class="discrete-slider"
        />
        <div class="slider-labels">
          {#each silenceSteps as step}
            <span class="slider-label" class:active={silenceLevel === step.level}>{step.label}</span>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .speed-silence-row {
    display: flex;
    gap: var(--spacing-sm);
    transition: opacity var(--transition-fast);
  }

  .speed-silence-row.inactive {
    opacity: 0.5;
  }

  .control-panel {
    flex: 1;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-white);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .control-panel.open {
    border-color: var(--color-primary);
  }

  .panel-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-md);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .inactive .panel-header {
    cursor: not-allowed;
  }

  .panel-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .panel-chevron {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
  }

  .panel-content {
    padding: 0 var(--spacing-md) var(--spacing-md);
    animation: slideDown var(--transition-fast);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .discrete-slider {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-full);
    background: #efefef;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    margin-bottom: var(--spacing-xs);
  }

  .discrete-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #666666;
    cursor: pointer;
    border: none;
    transform: translateY(-7px);
  }

  .discrete-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #666666;
    cursor: pointer;
    border: none;
  }

  .discrete-slider::-webkit-slider-runnable-track {
    background: #efefef;
    height: 6px;
    border-radius: var(--radius-full);
  }

  .discrete-slider::-moz-range-track {
    background: transparent;
    border: none;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    margin-top: var(--spacing-xs);
  }

  .slider-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    transition: color var(--transition-fast), font-weight var(--transition-fast);
  }

  .slider-label.active {
    color: var(--color-primary);
    font-weight: 600;
  }
</style>
