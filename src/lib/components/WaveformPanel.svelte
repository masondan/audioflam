<script lang="ts">
  import ColorPicker from './ColorPicker.svelte';

  export type WaveformStyle = 'bars' | 'thin' | 'blocks';

  interface Props {
    selectedStyle: WaveformStyle;
    selectedColor: string;
    opacity: number;
    onStyleChange: (style: WaveformStyle) => void;
    onColorChange: (color: string) => void;
    onOpacityChange: (opacity: number) => void;
  }

  let { selectedStyle, selectedColor, opacity, onStyleChange, onColorChange, onOpacityChange }: Props = $props();

  let showColorPicker = $state(false);
  let isWhiteSelected = $derived(selectedColor === '#ffffff' || selectedColor === '#FFFFFF');

  const styles: { id: WaveformStyle; label: string }[] = [
    { id: 'bars', label: 'Rounded bars' },
    { id: 'thin', label: 'Thin lines' },
    { id: 'blocks', label: 'Blocks' }
  ];

  function handleWhiteClick() {
    onColorChange('#ffffff');
  }

  function handleRainbowClick() {
    showColorPicker = true;
  }

  function handleColorPickerClose() {
    showColorPicker = false;
  }

  function handleColorPickerChange(color: string) {
    onColorChange(color);
  }

  function handleOpacityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onOpacityChange(parseFloat(target.value));
  }
</script>

<div class="waveform-panel">
  <div class="style-tiles">
    {#each styles as style}
      <button
        type="button"
        class="style-tile"
        class:selected={selectedStyle === style.id}
        onclick={() => onStyleChange(style.id)}
        aria-pressed={selectedStyle === style.id}
        aria-label={style.label}
      >
        <div class="tile-preview">
          {#if style.id === 'bars'}
            <!-- Waveform 1: Thick bars, continuous -->
            <svg viewBox="0 0 80 40" class="tile-svg">
              {#each [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72] as x, i}
                {@const heights = [8, 14, 10, 16, 12, 14, 10, 16, 8, 12, 14, 8]}
                <rect x={x - 2.5} y={20 - heights[i]} width="5" height={heights[i] * 2} rx="2" fill="currentColor" />
              {/each}
            </svg>
          {:else if style.id === 'thin'}
            <!-- Waveform 2: Dense thin bars, continuous -->
            <svg viewBox="0 0 80 40" class="tile-svg">
              {#each Array(28) as _, i}
                {@const x = 4 + i * 2.7}
                {@const h = 4 + Math.abs(Math.sin(i * 0.6)) * 12}
                <rect x={x - 0.8} y={20 - h} width="1.6" height={h * 2} rx="0.8" fill="currentColor" />
              {/each}
            </svg>
          {:else}
            <!-- Waveform 3: Building blocks -->
            <svg viewBox="0 0 80 40" class="tile-svg">
              {#each Array(16) as _, i}
                {@const x = 4 + i * 4.8}
                {@const segmentCount = 1 + Math.floor(Math.abs(Math.sin(i * 0.5)) * 6)}
                {#each Array(segmentCount) as _, j}
                  <rect x={x - 1.5} y={36 - j * 4} width="3.5" height="3" fill="currentColor" />
                {/each}
              {/each}
            </svg>
          {/if}
        </div>
      </button>
    {/each}
  </div>

  <div class="opacity-row">
    <label class="opacity-label" for="waveform-opacity">Opacity</label>
    <input
      id="waveform-opacity"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={opacity}
      oninput={handleOpacityInput}
      class="opacity-slider"
    />
  </div>

  <div class="color-options">
    <button
      type="button"
      class="color-btn white-btn"
      class:selected={isWhiteSelected}
      onclick={handleWhiteClick}
      aria-pressed={isWhiteSelected}
      aria-label="White color"
    >
      <span class="color-swatch white"></span>
    </button>
    <button
      type="button"
      class="color-btn rainbow-btn"
      class:selected={!isWhiteSelected}
      onclick={handleRainbowClick}
      aria-label="Custom color"
      style={!isWhiteSelected ? `--selected-color: ${selectedColor}` : ''}
    >
      {#if !isWhiteSelected}
        <span class="color-swatch" style="background: {selectedColor}"></span>
      {:else}
        <span class="color-swatch rainbow"></span>
      {/if}
    </button>
  </div>
</div>

{#if showColorPicker}
  <ColorPicker
    color={selectedColor}
    onColorChange={handleColorPickerChange}
    onClose={handleColorPickerClose}
  />
{/if}

<style>
  .waveform-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-sm);
  }

  .style-tiles {
    display: flex;
    gap: var(--spacing-sm);
  }

  .style-tile {
    flex: 1;
    aspect-ratio: 16 / 9;
    padding: var(--spacing-xs);
    background: var(--color-white);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .style-tile.selected {
    border-color: var(--color-primary);
  }

  .style-tile:hover:not(.selected) {
    border-color: var(--color-text-secondary);
  }

  .tile-preview {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .style-tile.selected .tile-preview {
    color: var(--color-primary);
  }

  .tile-svg {
    width: 100%;
    height: 100%;
  }

  .opacity-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .opacity-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    flex-shrink: 0;
  }

  .opacity-slider {
    flex: 1;
    height: 6px;
    border-radius: var(--radius-full);
    background: #efefef;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .opacity-slider::-webkit-slider-thumb {
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

  .opacity-slider::-webkit-slider-thumb:hover {
    background: #555555;
  }

  .opacity-slider::-webkit-slider-thumb:active {
    background: var(--color-primary);
  }

  .opacity-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #777777;
    cursor: pointer;
    border: none;
    transition: background var(--transition-fast);
  }

  .opacity-slider::-moz-range-thumb:hover {
    background: #555555;
  }

  .opacity-slider::-moz-range-thumb:active {
    background: var(--color-primary);
  }

  .opacity-slider::-webkit-slider-runnable-track {
    background: #d0d0d0;
    height: 6px;
    border-radius: var(--radius-full);
  }

  .opacity-slider::-moz-range-track {
    background: #d0d0d0;
    height: 6px;
    border-radius: var(--radius-full);
    border: none;
  }

  .color-options {
    display: flex;
    justify-content: center;
    gap: var(--spacing-md);
  }

  .color-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1.5px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color var(--transition-fast);
  }

  .color-btn.white-btn.selected {
    border-color: #999999;
  }

  .color-btn.rainbow-btn.selected {
    border-color: var(--selected-color, #999999);
  }

  .color-swatch {
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }

  .color-swatch.white {
    background: #ffffff;
    border: 1px solid #999999;
  }

  .color-swatch.rainbow {
    background: conic-gradient(
      #ff0000,
      #ffff00,
      #00ff00,
      #00ffff,
      #0000ff,
      #ff00ff,
      #ff0000
    );
  }
</style>
