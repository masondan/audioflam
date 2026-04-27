<script lang="ts">
  import { onMount } from 'svelte';
  import { bulletinStore } from '$lib/stores/bulletin';
  import { ALL_VOICES } from '$lib/stores';
  import type { VoiceOption } from '$lib/stores';
  import VoiceDropdown from '$lib/components/VoiceDropdown.svelte';
  import PlayButton from '$lib/components/PlayButton.svelte';
  import BulletinStoryCard from '$lib/components/bulletin/BulletinStoryCard.svelte';
  import BulletinIntroOutroCard from '$lib/components/bulletin/BulletinIntroOutroCard.svelte';
  import BulletinSoundsCard from '$lib/components/bulletin/BulletinSoundsCard.svelte';

  // Trigger localStorage initialisation on mount
  onMount(() => {
    const unsub = bulletinStore.subscribe(() => {});
    unsub();
  });

  // Derived state from store
  let stories = $derived($bulletinStore.stories);
  let selectedVoiceName = $derived($bulletinStore.selectedVoice);
  let bulletinAudio = $derived($bulletinStore.bulletinAudio);

  // Resolve voice name → VoiceOption object for VoiceDropdown
  const selectedVoiceObj = $derived(
    ALL_VOICES.find(v => v.name === selectedVoiceName) ?? null
  );

  // Bulletin playback state (static for Checkpoint 2 — wired in Checkpoint 6)
  let isPlaying = $state(false);
  let isGenerating = $state(false);

  // Derived PlayButton state — matches TTS tab pattern
  const playButtonState = $derived(
    isGenerating ? 'loading'
    : isPlaying   ? 'playing'
    : stories.length > 0 ? 'active'
    : 'inactive'
  );

  function handleVoiceChange(voice: VoiceOption) {
    bulletinStore.update(s => ({ ...s, selectedVoice: voice.name }));
  }

  // Story reorder handlers
  function handleMoveUp(index: number) {
    if (index === 0) return;
    bulletinStore.reorderStories(index, index - 1);
  }

  function handleMoveDown(index: number) {
    if (index === stories.length - 1) return;
    bulletinStore.reorderStories(index, index + 1);
  }

  // Edit handler — placeholder until Checkpoint 3 drawer exists
  function handleEditStory(story: import('$lib/stores/bulletin').BulletinStory) {
    console.log('[Bulletin] Edit story:', story.id);
  }

  // Add Story — placeholder until Checkpoint 3 drawer exists
  function handleAddStory() {
    console.log('[Bulletin] Add story');
  }

  // Play button: generates if no audio, plays/pauses if audio exists (wired in Checkpoint 6)
  function handlePlayButton() {
    if (!bulletinAudio && !isGenerating) {
      console.log('[Bulletin] Generate bulletin');
    } else if (bulletinAudio) {
      isPlaying = !isPlaying;
      console.log('[Bulletin] Play/pause');
    }
  }

  function skipBackward() {
    console.log('[Bulletin] Skip back');
  }

  function skipForward() {
    console.log('[Bulletin] Skip forward');
  }

  function handleDownload() {
    console.log('[Bulletin] Download bulletin');
  }

  function handleAddToAudiogram() {
    console.log('[Bulletin] Add to audiogram');
  }
</script>

<div class="bulletin-page">

  <!-- Header -->
  <header class="bulletin-header">
    <h1 class="bulletin-title">Bulletin</h1>
  </header>

  <main class="bulletin-main">

    <!-- Voice selector -->
    <section class="section">
      <VoiceDropdown
        label="Voice"
        voices={ALL_VOICES}
        value={selectedVoiceObj}
        onchange={handleVoiceChange}
      />
    </section>

    <!-- Add Story button -->
    <section class="section">
      <button
        type="button"
        class="add-story-btn"
        class:disabled={!selectedVoiceName}
        disabled={!selectedVoiceName}
        onclick={handleAddStory}
      >
        <span class="add-icon">+</span>
        Add Story
      </button>
    </section>

    <!-- Story list -->
    <section class="section story-list-section">
      {#if stories.length === 0}
        <div class="empty-state">
          <p class="empty-text">No stories yet</p>
          <p class="empty-hint">Select a voice and tap Add Story to begin.</p>
        </div>
      {:else}
        <div class="story-list">
          {#each stories as story, i (story.id)}
            <BulletinStoryCard
              {story}
              index={i}
              total={stories.length}
              onEdit={handleEditStory}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- Intro & Outro card -->
    <section class="section">
      <BulletinIntroOutroCard />
    </section>

    <!-- Sounds card -->
    <section class="section">
      <BulletinSoundsCard />
    </section>

    <!-- Controls cluster — matches TTS tab style exactly -->
    <section class="section controls-section">

      <!-- Player row: back · play/pause · forward -->
      <div class="player-row">
        <button
          type="button"
          class="skip-btn"
          onclick={skipBackward}
          disabled={!bulletinAudio}
          aria-label="Skip back 5 seconds"
        >
          <img src="/icons/icon-back-five.svg" alt="Back 5s" />
        </button>

        <PlayButton
          state={playButtonState}
          disabled={stories.length === 0}
          onclick={handlePlayButton}
          ariaLabel={isPlaying ? 'Pause' : 'Play'}
        />

        <button
          type="button"
          class="skip-btn"
          onclick={skipForward}
          disabled={!bulletinAudio}
          aria-label="Skip forward 5 seconds"
        >
          <img src="/icons/icon-forward-five.svg" alt="Forward 5s" />
        </button>
      </div>

      <!-- Download button — full width, purple when enabled -->
      <button
        type="button"
        class="download-btn"
        class:enabled={!!bulletinAudio}
        disabled={!bulletinAudio}
        onclick={handleDownload}
      >
        Download audio
      </button>

      <!-- Add to audiogram — modest text link -->
      <button
        type="button"
        class="audiogram-btn"
        class:enabled={!!bulletinAudio}
        disabled={!bulletinAudio}
        onclick={handleAddToAudiogram}
      >
        Add to audiogram
      </button>

    </section>

  </main>
</div>

<style>
  .bulletin-page {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background-color: var(--bg-white);
  }

  .bulletin-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--bg-white);
    z-index: 10;
  }

  .bulletin-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    margin: 0;
  }

  .bulletin-main {
    padding: var(--spacing-lg) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .section {
    margin-bottom: var(--spacing-md);
  }

  /* Add Story button */
  .add-story-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: 14px var(--spacing-md);
    background: var(--bg-white);
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
    cursor: pointer;
    transition: border-color var(--transition-normal), background-color var(--transition-normal);
  }

  .add-story-btn:hover:not(.disabled) {
    border-color: var(--color-primary);
    background-color: var(--color-highlight);
  }

  .add-story-btn.disabled {
    color: var(--text-secondary);
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  .add-icon {
    font-size: 1.25rem;
    line-height: 1;
    font-weight: var(--font-weight-regular);
  }

  /* Story list */
  .story-list-section {
    min-height: 60px;
  }

  .story-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* Empty state */
  .empty-state {
    padding: var(--spacing-xl) var(--spacing-md);
    text-align: center;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-main);
  }

  .empty-text {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-xs);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Controls cluster */
  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    margin-top: var(--spacing-sm);
  }

  /* Player row — back · PlayButton · forward */
  .player-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xl);
  }

  .skip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-normal);
  }

  .skip-btn img {
    width: 32px;
    height: 32px;
    filter: brightness(0) saturate(100%) invert(47%);
    transition: filter var(--transition-normal);
  }

  .skip-btn:hover:not(:disabled) img {
    filter: brightness(0) saturate(100%) invert(33%);
  }

  .skip-btn:disabled {
    cursor: default;
  }

  .skip-btn:disabled img {
    opacity: 0.4;
  }

  /* Download button — full width, purple when enabled */
  .download-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    background: var(--bg-main);
    color: #777777;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: not-allowed;
    transition: all var(--transition-normal);
  }

  .download-btn.enabled {
    background: var(--color-primary);
    color: var(--bg-white);
    cursor: pointer;
  }

  .download-btn.enabled:hover {
    background: #4a1d9e;
  }

  /* Add to audiogram — modest text link */
  .audiogram-btn {
    display: block;
    width: 100%;
    padding: var(--spacing-xs) 0;
    margin-top: calc(-1 * var(--spacing-sm));
    border: none;
    background: transparent;
    color: #777777;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: not-allowed;
    transition: color var(--transition-normal);
  }

  .audiogram-btn.enabled {
    color: var(--color-primary);
    cursor: pointer;
  }

  .audiogram-btn.enabled:hover {
    text-decoration: underline;
  }
</style>
