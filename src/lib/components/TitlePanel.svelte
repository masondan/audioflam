<script lang="ts">
  import ColorPicker from './ColorPicker.svelte';

  export type TitleFont = 'Inter' | 'Lora' | 'Roboto Slab' | 'Saira Condensed' | 'Playfair Display' | 'Bebas Neue';
  export type TitleAlign = 'left' | 'center' | 'right';

  interface Props {
    text: string;
    selectedFont: TitleFont;
    selectedAlign: TitleAlign;
    isBold: boolean;
    lineHeight: number;
    letterSpacing: number;
    textColor: string;
    labelEnabled: boolean;
    labelOpacity: number;
    labelSpace: number;
    labelColor: string;
    onTextChange: (text: string) => void;
    onFontChange: (font: TitleFont) => void;
    onAlignChange: (align: TitleAlign) => void;
    onBoldChange: (bold: boolean) => void;
    onLineHeightChange: (value: number) => void;
    onLetterSpacingChange: (value: number) => void;
    onTextColorChange: (color: string) => void;
    onLabelEnabledChange: (enabled: boolean) => void;
    onLabelOpacityChange: (value: number) => void;
    onLabelSpaceChange: (value: number) => void;
    onLabelColorChange: (color: string) => void;
  }

  let { 
    text, 
    selectedFont, 
    selectedAlign,
    isBold,
    lineHeight,
    letterSpacing,
    textColor,
    labelEnabled,
    labelOpacity,
    labelSpace,
    labelColor,
    onTextChange, 
    onFontChange, 
    onAlignChange,
    onBoldChange,
    onLineHeightChange,
    onLetterSpacingChange,
    onTextColorChange,
    onLabelEnabledChange,
    onLabelOpacityChange,
    onLabelSpaceChange,
    onLabelColorChange
  }: Props = $props();

  type TabId = 'font' | 'style' | 'label';
  let activeTab = $state<TabId>('font');

  let showTextColorPicker = $state(false);
  let showLabelColorPicker = $state(false);
  
  let isTextWhite = $derived(textColor.toLowerCase() === '#ffffff');

  const fonts: { id: TitleFont; label: string; family: string }[] = [
    { id: 'Inter', label: 'Inter', family: "'Inter', sans-serif" },
    { id: 'Lora', label: 'Lora', family: "'Lora', serif" },
    { id: 'Roboto Slab', label: 'Roboto', family: "'Roboto Slab', serif" },
    { id: 'Saira Condensed', label: 'Saira', family: "'Saira Condensed', sans-serif" },
    { id: 'Playfair Display', label: 'Playfair', family: "'Playfair Display', serif" },
    { id: 'Bebas Neue', label: 'BEBAS', family: "'Bebas Neue', sans-serif" }
  ];

  function handleTextInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onTextChange(target.value);
    autoResize(target);
  }

  function autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    const lineHeightPx = 24;
    const maxHeight = lineHeightPx * 4 + 16;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }

  function getFontWeight(font: TitleFont): number {
    if (font === 'Inter') {
      return isBold ? 700 : 400;
    }
    if (font === 'Bebas Neue') {
      return 400;
    }
    return isBold ? 700 : 400;
  }
</script>

<div class="title-panel">
  <textarea
    class="title-input"
    placeholder="Add title"
    value={text}
    oninput={handleTextInput}
    rows="1"
  ></textarea>

  <div class="tabs">
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'font'}
      onclick={() => activeTab = 'font'}
    >Font</button>
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'style'}
      onclick={() => activeTab = 'style'}
    >Style</button>
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'label'}
      onclick={() => activeTab = 'label'}
    >Label</button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'font'}
      <div class="font-grid">
        {#each fonts as font}
          <button
            type="button"
            class="font-btn"
            class:selected={selectedFont === font.id}
            onclick={() => onFontChange(font.id)}
            aria-pressed={selectedFont === font.id}
            aria-label={font.id}
            style="font-family: {font.family}; font-weight: {font.id === 'Inter' ? 700 : font.id === 'Bebas Neue' ? 400 : 400};"
          >
            {font.label}
          </button>
        {/each}
      </div>
    {:else if activeTab === 'style'}
      <div class="style-content">
        <div class="style-row">
          <span class="style-label">Alignment</span>
          <div class="align-buttons">
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'left'}
              onclick={() => onAlignChange('left')}
              aria-label="Align left"
            >
              <img src="/icons/icon-align-left.svg" alt="" class="align-icon" />
            </button>
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'center'}
              onclick={() => onAlignChange('center')}
              aria-label="Align center"
            >
              <img src="/icons/icon-align-center.svg" alt="" class="align-icon" />
            </button>
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'right'}
              onclick={() => onAlignChange('right')}
              aria-label="Align right"
            >
              <img src="/icons/icon-align-right.svg" alt="" class="align-icon" />
            </button>
          </div>
          <div class="bold-toggle">
            <button
              type="button"
              class="toggle-option"
              class:active={!isBold}
              onclick={() => onBoldChange(false)}
            >Normal</button>
            <button
              type="button"
              class="toggle-option"
              class:active={isBold}
              onclick={() => onBoldChange(true)}
            >Bold</button>
          </div>
        </div>

        <div class="style-row">
          <span class="style-label">Line space</span>
          <input
            type="range"
            class="slider"
            min="0.9"
            max="1.5"
            step="0.05"
            value={lineHeight}
            oninput={(e) => onLineHeightChange(parseFloat((e.target as HTMLInputElement).value))}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Letter space</span>
          <input
            type="range"
            class="slider"
            min="-0.05"
            max="0.1"
            step="0.01"
            value={letterSpacing}
            oninput={(e) => onLetterSpacingChange(parseFloat((e.target as HTMLInputElement).value))}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Colour</span>
          <div class="color-buttons">
            <button
              type="button"
              class="color-btn"
              class:selected={isTextWhite}
              onclick={() => onTextColorChange('#ffffff')}
              aria-label="White color"
            >
              <span class="color-swatch white"></span>
            </button>
            <button
              type="button"
              class="color-btn"
              class:selected={!isTextWhite}
              onclick={() => showTextColorPicker = true}
              aria-label="Custom color"
              style={!isTextWhite ? `--selected-color: ${textColor}` : ''}
            >
              {#if !isTextWhite}
                <span class="color-swatch" style="background: {textColor}"></span>
              {:else}
                <span class="color-swatch rainbow"></span>
              {/if}
            </button>
          </div>
        </div>
      </div>
    {:else if activeTab === 'label'}
      <div class="label-content">
        <div class="style-row">
          <span class="style-label">Opacity</span>
          <input
            type="range"
            class="slider"
            min="0"
            max="1"
            step="0.05"
            value={labelOpacity}
            oninput={(e) => onLabelOpacityChange(parseFloat((e.target as HTMLInputElement).value))}
            disabled={!labelEnabled}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Space</span>
          <input
            type="range"
            class="slider"
            min="0"
            max="1"
            step="0.05"
            value={labelSpace}
            oninput={(e) => onLabelSpaceChange(parseFloat((e.target as HTMLInputElement).value))}
            disabled={!labelEnabled}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Colour</span>
          <div class="color-buttons">
            <button
              type="button"
              class="color-btn none-btn"
              class:selected={!labelEnabled}
              onclick={() => onLabelEnabledChange(false)}
              aria-label="No label"
            >
              <img src="/icons/icon-none.svg" alt="" class="none-icon" />
            </button>
            <button
              type="button"
              class="color-btn"
              class:selected={labelEnabled}
              onclick={() => {
                onLabelEnabledChange(true);
                showLabelColorPicker = true;
              }}
              aria-label="Label color"
              style={labelEnabled ? `--selected-color: ${labelColor}` : ''}
            >
              <span class="color-swatch" style="background: {labelColor}"></span>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showTextColorPicker}
  <ColorPicker
    color={textColor}
    onColorChange={(color) => onTextColorChange(color)}
    onClose={() => showTextColorPicker = false}
  />
{/if}

{#if showLabelColorPicker}
  <ColorPicker
    color={labelColor}
    onColorChange={(color) => onLabelColorChange(color)}
    onClose={() => showLabelColorPicker = false}
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
    overflow-y: auto;
    min-height: 40px;
    max-height: 120px;
    line-height: 24px;
  }

  .title-input::placeholder {
    color: var(--color-text-secondary);
  }

  .title-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .tabs {
    display: flex;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-sm);
  }

  .tab {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: color var(--transition-fast);
    font-weight: 500;
  }

  .tab.active {
    color: var(--color-primary);
    font-weight: 700;
  }

  .tab-content {
    /* No min-height - let content determine height for consistent bottom gap */
  }

  /* Font Tab */
  .font-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-sm);
  }

  .font-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-white);
    border: 1px solid #999999;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    color: #999999;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--transition-fast);
  }

  .font-btn.selected {
    border-color: var(--color-primary);
    border-width: 2px;
    color: var(--color-text-primary);
  }

  /* Style Tab */
  .style-content,
  .label-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .style-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .style-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    min-width: 80px;
    flex-shrink: 0;
  }

  .align-buttons {
    display: flex;
    gap: var(--spacing-xs);
  }

  .align-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-fast);
  }

  .align-btn:hover {
    background: var(--color-app-bg);
  }

  .align-btn.active .align-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .align-icon {
    width: 24px;
    height: 24px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(70%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .bold-toggle {
    display: flex;
    border: 1px solid #999999;
    border-radius: var(--radius-md);
    overflow: hidden;
    margin-left: auto;
  }

  .toggle-option {
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toggle-option.active {
    background: #999999;
    color: var(--color-white);
  }

  .slider {
    flex: 1;
    height: 4px;
    background: #e0e0e0;
    border-radius: var(--radius-full);
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: #999999;
    border-radius: 50%;
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: #999999;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .slider:disabled {
    opacity: 0.5;
  }

  .color-buttons {
    display: flex;
    gap: var(--spacing-sm);
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

  .color-btn.selected {
    border-color: var(--selected-color, #999999);
  }

  .color-btn.none-btn {
    border: 1.5px solid #999999;
  }

  .color-btn.none-btn.selected {
    border-color: var(--color-primary);
  }

  .none-icon {
    width: 22px;
    height: 22px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(70%) contrast(89%);
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
