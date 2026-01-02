<script lang="ts">
  import type { VoiceOption } from '$lib/stores';

  interface Props {
    label: string;
    voices: VoiceOption[];
    value: VoiceOption | null;
    onchange: (voice: VoiceOption) => void;
  }

  let { label, voices, value, onchange }: Props = $props();
  
  let isOpen = $state(false);
  let playingVoice = $state<string | null>(null);
  let dropdownRef: HTMLDivElement;
  let audioElement: HTMLAudioElement | null = null;

  const PREVIEW_TEXT = "Hello, my name is a Nigerian journalist.";

  function toggle() {
    isOpen = !isOpen;
  }

  function select(voice: VoiceOption) {
    onchange(voice);
    isOpen = false;
  }

  async function previewVoice(event: MouseEvent, voice: VoiceOption) {
    event.stopPropagation();
    
    if (playingVoice === voice.name) {
      stopPreview();
      return;
    }

    stopPreview();
    playingVoice = voice.name;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          voiceName: voice.name
        })
      });

      if (!res.ok) {
        throw new Error('Preview failed');
      }

      const data = await res.json();
      const byteCharacters = atob(data.audioContent);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);

      audioElement = new Audio(audioUrl);
      audioElement.onended = () => {
        playingVoice = null;
      };
      audioElement.play();
    } catch (err) {
      console.error('Preview error:', err);
      playingVoice = null;
      alert('Preview failed - check console for details');
    }
  }

  function stopPreview() {
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    playingVoice = null;
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="dropdown" bind:this={dropdownRef}>
  <span class="dropdown-label" id="voice-dropdown-label">{label}</span>
  <button 
    type="button" 
    class="dropdown-trigger" 
    class:open={isOpen}
    onclick={toggle}
    aria-expanded={isOpen}
    aria-haspopup="listbox"
  >
    <span class="dropdown-value">{value?.displayName || 'Select voice'}</span>
    <img 
      src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'} 
      alt="" 
      class="dropdown-icon"
    />
  </button>
  
  {#if isOpen}
    <ul class="dropdown-menu" role="listbox">
      {#each voices as voice, i}
        <li>
          <div class="dropdown-option-row">
            <button
              type="button"
              class="dropdown-option"
              class:selected={voice.name === value?.name}
              onclick={() => select(voice)}
              role="option"
              aria-selected={voice.name === value?.name}
            >
              <span class="voice-name">{voice.displayName}</span>
              {#if voice.provider === 'replicate'}
                <span class="speed-badge">⚡</span>
              {/if}
            </button>
            <button
              type="button"
              class="preview-btn"
              class:playing={playingVoice === voice.name}
              onclick={(e) => previewVoice(e, voice)}
              aria-label={`Preview ${voice.displayName}`}
            >
              <img 
                src={playingVoice === voice.name ? '/icons/icon-speak-fill.svg' : '/icons/icon-speak.svg'} 
                alt=""
                class="preview-icon"
              />
            </button>
          </div>
        </li>
        {#if i < voices.length - 1}
          <li class="dropdown-separator" role="separator"></li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    width: 100%;
  }

  .dropdown-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    margin-bottom: var(--spacing-xs);
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-md);
    background: var(--color-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .dropdown-trigger:hover {
    border-color: var(--color-border-dark);
  }

  .dropdown-trigger.open {
    border-color: var(--color-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dropdown-value {
    text-align: left;
  }

  .dropdown-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: relative;
    width: 100%;
    background: var(--color-white);
    border: 1px solid var(--color-primary);
    border-top: none;
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    list-style: none;
    margin: 0;
    padding: 0;
    z-index: 100;
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

  .dropdown-option-row {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .dropdown-option {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 12px var(--spacing-md);
    background: none;
    border: none;
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .dropdown-option:hover {
    background-color: var(--color-lavender-veil);
  }

  .dropdown-option.selected {
    color: var(--color-primary);
    font-weight: 500;
  }

  .preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .preview-btn:hover {
    background-color: var(--color-lavender-veil);
  }

  .preview-icon {
    width: 24px;
    height: 24px;
  }

  .preview-btn.playing .preview-icon {
    filter: none;
  }

  .dropdown-separator {
    height: 1px;
    background-color: var(--color-border);
    margin: 0 var(--spacing-md);
  }

  .voice-name {
    flex: 1;
  }

  .speed-badge {
    font-size: 12px;
    margin-left: 4px;
  }
</style>
