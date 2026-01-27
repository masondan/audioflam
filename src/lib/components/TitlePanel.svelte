<script lang="ts">
  import ColorPicker from './ColorPicker.svelte';

  export type TitleFont = 'Inter' | 'Roboto Slab' | 'Lora';
  export type TitleStyle = 'transparent' | 'background';

  interface Props {
    text: string;
    selectedFont: TitleFont;
    selectedStyle: TitleStyle;
    selectedColor: string;
    onTextChange: (text: string) => void;
    onFontChange: (font: TitleFont) => void;
    onStyleChange: (style: TitleStyle) => void;
    onColorChange: (color: string) => void;
  }

  let { 
    text, 
    selectedFont, 
    selectedStyle, 
    selectedColor, 
    onTextChange, 
    onFontChange, 
    onStyleChange, 
    onColorChange 
  }: Props = $props();

  let showColorPicker = $state(false);
  let isWhiteSelected = $derived(selectedColor === '#ffffff' || selectedColor === '#FFFFFF');

  const fonts: { id: TitleFont; label: string; family: string }[] = [
    { id: 'Inter', label: 'Ag', family: "'Inter', sans-serif" },
    { id: 'Roboto Slab', label: 'Ag', family: "'Roboto Slab', serif" },
    { id: 'Lora', label: 'Ag', family: "'Lora', serif" }
  ];

  const styles: { id: TitleStyle; label: string }[] = [
    { id: 'transparent', label: 'Ag' },
    { id: 'background', label: 'Ag' }
  ];

  function handleTextInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onTextChange(target.value);
  }

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
</script>

<div class="title-panel">
  <textarea
    class="title-input"
    placeholder="Add title"
    value={text}
    oninput={handleTextInput}
    rows="2"
  ></textarea>

  <div class="options-section">
    <div class="options-row">
      <span class="options-label">Font</span>
      <div class="options-buttons">
        {#each fonts as font}
          <button
            type="button"
            class="option-btn font-btn"
            class:selected={selectedFont === font.id}
            onclick={() => onFontChange(font.id)}
            aria-pressed={selectedFont === font.id}
            aria-label={font.id}
            style="font-family: {font.family}; font-weight: 700;"
          >
            {font.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="options-row">
      <span class="options-label">Style</span>
      <div class="options-buttons">
        {#each styles as style}
          <button
            type="button"
            class="option-btn style-btn"
            class:selected={selectedStyle === style.id}
            onclick={() => onStyleChange(style.id)}
            aria-pressed={selectedStyle === style.id}
            aria-label={style.id === 'transparent' ? 'Colored text' : 'White text on background'}
          >
            <span 
              class="style-preview"
              class:transparent-style={style.id === 'transparent'}
              class:background-style={style.id === 'background'}
            >
              {style.label}
            </span>
          </button>
        {/each}
      </div>
    </div>
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
  .title-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .title-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    resize: vertical;
    min-height: 60px;
  }

  .title-input::placeholder {
    color: var(--color-text-secondary);
  }

  .title-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .options-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .options-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .options-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    min-width: 40px;
  }

  .options-buttons {
    display: flex;
    gap: var(--spacing-sm);
  }

  .option-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color var(--transition-fast);
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
  }

  .option-btn.selected {
    border-color: var(--color-primary);
  }

  .option-btn:hover:not(.selected) {
    border-color: var(--color-text-secondary);
  }

  .font-btn.selected {
    color: var(--color-primary);
  }

  .style-preview {
    font-weight: 700;
    font-size: var(--font-size-sm);
  }

  .style-preview.transparent-style {
    color: var(--color-text-primary);
  }

  .style-preview.background-style {
    background: var(--color-text-primary);
    color: var(--color-white);
    padding: 2px 4px;
    border-radius: 2px;
  }

  .style-btn.selected .style-preview.transparent-style {
    color: var(--color-primary);
  }

  .style-btn.selected .style-preview.background-style {
    background: var(--color-primary);
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
