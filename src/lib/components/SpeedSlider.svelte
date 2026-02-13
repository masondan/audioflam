<script lang="ts">
  type SpeedLevel = 'default' | 'lively' | 'fast';

  interface Props {
    speed: number;
    isActive: boolean;
    onSpeedChange: (speed: number) => void;
    size?: 'large' | 'small';
  }

  let { speed = 1.0, isActive = false, onSpeedChange, size = 'large' }: Props = $props();

  const speedSteps: { level: SpeedLevel; label: string; value: number }[] = [
    { level: 'default', label: 'Default', value: 1.0 },
    { level: 'lively', label: 'Lively', value: 1.15 },
    { level: 'fast', label: 'Fast', value: 1.25 }
  ];

  let isDragging = $state(false);
  let sliderRef: HTMLInputElement;

  function getSpeedIndex(spd: number): number {
    const idx = speedSteps.findIndex(s => s.value === spd);
    return idx >= 0 ? idx : 0;
  }

  function getCurrentLevel(spd: number): SpeedLevel {
    const step = speedSteps.find(s => s.value === spd);
    return step?.level ?? 'default';
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value);
    const step = speedSteps[value];
    if (step) {
      onSpeedChange(step.value);
    }
  }

  function handleMouseDown() {
    if (!isActive) {
      onSpeedChange(speed);
      return;
    }
    isDragging = true;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleTouchStart() {
    if (!isActive) {
      onSpeedChange(speed);
      return;
    }
    isDragging = true;
  }

  function handleTouchEnd() {
    isDragging = false;
  }

  $effect(() => {
    if (sliderRef) {
      sliderRef.value = getSpeedIndex(speed).toString();
    }
  });
</script>

<svelte:window on:mouseup={handleMouseUp} on:touchend={handleTouchEnd} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="speed-slider-container"
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
    value={getSpeedIndex(speed)}
    disabled={!isActive}
    oninput={handleInput}
    class="speed-slider"
  />
  
  {#if isDragging && isActive}
    <div class="speed-label-popup">{speedSteps.find(s => s.value === speed)?.label ?? 'Default'}</div>
  {/if}
</div>

<style>
  .speed-slider-container {
    position: relative;
    transition: opacity var(--transition-fast);
  }

  .speed-slider-container.inactive {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .speed-slider-container.size-large {
    --slider-height: 6px;
    --thumb-size: 20px;
  }

  .speed-slider-container.size-small {
    --slider-height: 4px;
    --thumb-size: 16px;
  }

  .speed-slider {
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

  .speed-slider:disabled {
    cursor: not-allowed;
  }

  /* Webkit browsers (Chrome, Safari) */
  .speed-slider::-webkit-slider-thumb {
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

  .speed-slider::-webkit-slider-thumb:hover:not(:disabled) {
    background: #5422b0;
  }

  .speed-slider::-webkit-slider-thumb:active:not(:disabled),
  .speed-slider:active::-webkit-slider-thumb {
    background: #5422b0;
  }

  .speed-slider-container:not(.inactive) .speed-slider::-webkit-slider-thumb {
    background: #5422b0;
  }

  /* Firefox */
  .speed-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #5422b0;
    cursor: pointer;
    border: none;
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
  }

  .speed-slider::-moz-range-thumb:hover:not(:disabled) {
    background: #5422b0;
  }

  .speed-slider::-moz-range-thumb:active:not(:disabled),
  .speed-slider:active::-moz-range-thumb {
    background: #5422b0;
  }

  .speed-slider-container:not(.inactive) .speed-slider::-moz-range-thumb {
    background: #5422b0;
  }

  /* Track styling */
  .speed-slider::-webkit-slider-runnable-track {
    background: #dcdcdc;
    height: var(--slider-height);
    border-radius: var(--radius-full);
  }

  .speed-slider::-moz-range-track {
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

  .speed-label-popup {
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
