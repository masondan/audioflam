<script lang="ts">
  import { bulletinStore, bulletinPanelStore } from '$lib/stores/bulletin';
  import type { SilenceLevel } from '$lib/audioProcessing';
  import SpeedSlider from '$lib/components/SpeedSlider.svelte';
  import SilenceSlider from '$lib/components/SilenceSlider.svelte';

  // Local UI state
  let openPanel = $derived($bulletinPanelStore);
  let isOpen = $derived(openPanel === 'adjust-voice');

  // Derived from store
  let mainVoiceSpeed = $derived($bulletinStore.mainVoiceSpeed);
  let mainVoiceSilence = $derived($bulletinStore.mainVoiceSilence);

  function handleChevronClick() {
    if (isOpen) {
      bulletinPanelStore.close();
    } else {
      bulletinPanelStore.setOpen('adjust-voice');
    }
  }

  function handleSpeedChange(speed: number) {
    bulletinStore.update(s => ({ ...s, mainVoiceSpeed: speed }));
    // Invalidate assembled audio when controls change
    bulletinStore.clearBulletinAudio();
  }

  function handleSilenceChange(silence: SilenceLevel) {
    bulletinStore.update(s => ({ ...s, mainVoiceSilence: silence }));
    // Invalidate assembled audio when controls change
    bulletinStore.clearBulletinAudio();
  }
</script>

<div class="toggle-panel" class:open={isOpen}>
  <div class="panel-header">
    <button
      type="button"
      class="chevron-btn"
      onclick={handleChevronClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse adjust main voice' : 'Expand adjust main voice'}
    >
      <img
        src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="chevron-icon"
      />
    </button>
    <span class="panel-label">Adjust main voice</span>
  </div>

  {#if isOpen}
    <div class="panel-content">
      <div class="adjust-audio-row">
        <div class="adjust-audio-slider">
          <div class="slider-header">
            <span class="slider-label-text">Speed</span>
          </div>
          <SpeedSlider
            speed={mainVoiceSpeed}
            isActive={true}
            onSpeedChange={handleSpeedChange}
            size="small"
          />
        </div>

        <div class="adjust-audio-slider">
          <div class="slider-header">
            <span class="slider-label-text">Silence</span>
          </div>
          <SilenceSlider
            level={mainVoiceSilence}
            isActive={true}
            onLevelChange={handleSilenceChange}
            size="small"
          />
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

  .toggle-panel.open {
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

  .chevron-icon {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
  }

  .panel-label {
    flex: 1;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    transition: color var(--transition-normal);
  }

  .panel-content {
    padding: 0 var(--spacing-md) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .adjust-audio-row {
    display: flex;
    gap: var(--spacing-md);
  }

  .adjust-audio-slider {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .slider-label-text {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }
</style>
