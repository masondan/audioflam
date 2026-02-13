<script lang="ts">
  import type { SilenceLevel } from '$lib/audioProcessing';

  interface Props {
    level: SilenceLevel;
    isActive: boolean;
    onLevelChange: (level: SilenceLevel) => void;
    size?: 'large' | 'small';
  }

  let { level = 'default', isActive = false, onLevelChange, size = 'large' }: Props = $props();

  const silenceSteps: SilenceLevel[] = ['default', 'trim', 'tight'];
  const silenceLabels: Record<SilenceLevel, string> = {
    default: 'Default',
    trim: 'Trim',
    tight: 'Tight'
  };

  let isDragging = $state(false);
  let sliderRef: HTMLInputElement;
  let draggingValue = $state<number>(0);

  function getLevelIndex(lvl: SilenceLevel): number {
    return silenceSteps.indexOf(lvl);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value);
    draggingValue = value;
    const step = silenceSteps[value];
    if (step) {
      onLevelChange(step);
    }
  }

  function handleMouseDown() {
    if (!isActive) {
      onLevelChange(level);
      return;
    }
    isDragging = true;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleTouchStart() {
    if (!isActive) {
      onLevelChange(level);
      return;
    }
    isDragging = true;
  }

  function handleTouchEnd() {
    isDragging = false;
  }

  $effect(() => {
    if (sliderRef) {
      sliderRef.value = getLevelIndex(level).toString();
    }
  });
</script>

<svelte:window on:mouseup={handleMouseUp} on:touchend={handleTouchEnd} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="silence-slider-container"
  class:inactive={!isActive}
  class:size-large={size === 'large'}
  class:size-small={size === 'small'}
  onmousedown={handleMouseDown}
  ontouchstart={handleTouchStart}
>
  <input
    bind:this={sliderRef}
    type="range"
    min="0"
    max="2"
    step="1"
    value={getLevelIndex(level)}
    disabled={!isActive}
    oninput={handleInput}
    class="silence-slider"
  />
  
  {#if isDragging && isActive}
    <div class="silence-label-popup">{silenceLabels[silenceSteps[draggingValue]]}</div>
  {/if}
</div>

<style>
  .silence-slider-container {
    position: relative;
    transition: opacity var(--transition-fast);
  }

  .silence-slider-container.inactive {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .silence-slider-container.size-large {
    --slider-height: 6px;
    --thumb-size: 20px;
  }

  .silence-slider-container.size-small {
    --slider-height: 4px;
    --thumb-size: 16px;
  }

  .silence-slider {
    width: 100%;
    height: var(--slider-height);
    border-radius: var(--radius-full);
    background: #dcdcdc;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    transition: background var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
    margin-bottom: var(--spacing-xs);
  }

  .silence-slider:disabled {
    cursor: not-allowed;
  }

  .silence-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #5422b0;
    cursor: pointer;
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
    -webkit-tap-highlight-color: transparent;
    border: none;
  }

  .silence-slider::-webkit-slider-thumb:hover:not(:disabled) {
    background: #5422b0;
  }

  .silence-slider::-webkit-slider-thumb:active:not(:disabled),
  .silence-slider:active::-webkit-slider-thumb {
    background: #5422b0;
  }

  .silence-slider-container:not(.inactive) .silence-slider::-webkit-slider-thumb {
    background: #5422b0;
  }

  .silence-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #5422b0;
    cursor: pointer;
    border: none;
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
  }

  .silence-slider::-moz-range-thumb:hover:not(:disabled) {
    background: #5422b0;
  }

  .silence-slider::-moz-range-thumb:active:not(:disabled),
  .silence-slider:active::-moz-range-thumb {
    background: #5422b0;
  }

  .silence-slider-container:not(.inactive) .silence-slider::-moz-range-thumb {
    background: #5422b0;
  }

  .silence-slider::-webkit-slider-runnable-track {
    background: #dcdcdc;
    height: var(--slider-height);
    border-radius: var(--radius-full);
  }

  .silence-slider::-moz-range-track {
    background: transparent;
    border: none;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
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

  .silence-label-popup {
    position: absolute;
    top: -24px;
    right: 0;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-primary);
    background: var(--color-lavender-veil);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
