<script lang="ts">
  interface Props {
    opacity: number;
    speed: number;
    onOpacityChange: (opacity: number) => void;
    onSpeedChange: (speed: number) => void;
  }

  let { opacity, speed, onOpacityChange, onSpeedChange }: Props = $props();

  function handleOpacityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onOpacityChange(parseFloat(target.value));
  }

  function handleSpeedInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onSpeedChange(parseFloat(target.value));
  }
</script>

<div class="light-effect-panel">
  <div class="slider-group">
    <div class="slider-column">
      <label class="slider-label" for="opacity-slider">Opacity</label>
      <input
        id="opacity-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={opacity}
        oninput={handleOpacityInput}
        class="effect-slider"
      />
    </div>
    <div class="slider-column">
      <label class="slider-label" for="speed-slider">Speed</label>
      <input
        id="speed-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={speed}
        oninput={handleSpeedInput}
        class="effect-slider"
      />
    </div>
  </div>
</div>

<style>
  .light-effect-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .slider-group {
    display: flex;
    gap: var(--spacing-lg);
  }

  .slider-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .slider-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .effect-slider {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-full);
    background: #efefef;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .effect-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #777777;
    cursor: pointer;
    transition: background var(--transition-fast);
    border: none;
    margin-top: -6px;
  }

  .effect-slider::-webkit-slider-thumb:hover {
    background: #555555;
  }

  .effect-slider::-webkit-slider-thumb:active {
    background: var(--color-primary);
  }

  .effect-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #777777;
    cursor: pointer;
    border: none;
    transition: background var(--transition-fast);
  }

  .effect-slider::-moz-range-thumb:hover {
    background: #555555;
  }

  .effect-slider::-moz-range-thumb:active {
    background: var(--color-primary);
  }

  .effect-slider::-webkit-slider-runnable-track {
    background: #d0d0d0;
    height: 6px;
    border-radius: var(--radius-full);
  }

  .effect-slider::-moz-range-track {
    background: #d0d0d0;
    height: 6px;
    border-radius: var(--radius-full);
    border: none;
  }
</style>
