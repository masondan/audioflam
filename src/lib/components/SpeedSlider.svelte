<script lang="ts">
  interface Props {
    speed: number;
    isActive: boolean;
    onSpeedChange: (speed: number) => void;
    size?: 'large' | 'small';
  }

  let { speed = 1.0, isActive = false, onSpeedChange, size = 'large' }: Props = $props();

  const speedSteps = [1.0, 1.1, 1.2, 1.3];
  let isDragging = $state(false);
  let sliderRef: HTMLInputElement;
  let sizeClass = $derived(size === 'large' ? 'size-large' : 'size-small');

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    
    // Snap to nearest step
    const nearest = speedSteps.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    
    onSpeedChange(nearest);
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
      sliderRef.value = speed.toString();
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
    min="1.0"
    max="1.3"
    step="0.01"
    value={speed}
    disabled={!isActive}
    oninput={handleInput}
    class="speed-slider"
  />
  
  {#if isDragging && isActive}
    <div class="speed-label">x{speed.toFixed(1)}</div>
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
    background: #efefef;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    transition: background var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
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
    background: #999999;
    cursor: pointer;
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
    -webkit-tap-highlight-color: transparent;
    border: none;
  }

  .speed-slider::-webkit-slider-thumb:hover:not(:disabled) {
    background: #777777;
  }

  .speed-slider::-webkit-slider-thumb:active:not(:disabled),
  .speed-slider:active::-webkit-slider-thumb {
    background: var(--color-primary);
  }

  .speed-slider-container:not(.inactive) .speed-slider::-webkit-slider-thumb {
    background: #666666;
  }

  /* Firefox */
  .speed-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #999999;
    cursor: pointer;
    border: none;
    transition: background var(--transition-fast), box-shadow var(--transition-fast);
    transform: translateY(calc((var(--slider-height) - var(--thumb-size)) / 2));
  }

  .speed-slider::-moz-range-thumb:hover:not(:disabled) {
    background: #777777;
  }

  .speed-slider::-moz-range-thumb:active:not(:disabled),
  .speed-slider:active::-moz-range-thumb {
    background: var(--color-primary);
  }

  .speed-slider-container:not(.inactive) .speed-slider::-moz-range-thumb {
    background: #666666;
  }

  /* Track styling */
  .speed-slider::-webkit-slider-runnable-track {
    background: #efefef;
    height: var(--slider-height);
    border-radius: var(--radius-full);
  }

  .speed-slider::-moz-range-track {
    background: transparent;
    border: none;
  }

  .speed-label {
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
