<script lang="ts">
  import type { BulletinStory } from '$lib/stores/bulletin';
  import { getStorySource } from '$lib/stores/bulletin';

  interface Props {
    story: BulletinStory;
    index: number;
    total: number;
    onEdit: (story: BulletinStory) => void;
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    onPreviewClick?: (story: BulletinStory) => Promise<HTMLAudioElement | null>;
    onPreviewStop?: () => void;
  }

  let { story, index, total, onEdit, onMoveUp, onMoveDown, onPreviewClick, onPreviewStop }: Props = $props();

  let isGeneratingPreview = $state(false);
  let isPlayingPreview = $state(false);
  let previewAudio = $state<HTMLAudioElement | null>(null);

  function getSnippet(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return 'No text yet';
    // Return first ~120 chars, trimmed to word boundary
    if (trimmed.length <= 120) return trimmed;
    const cut = trimmed.slice(0, 120);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  async function handlePreviewClick() {
    // If currently playing, stop playback
    if (isPlayingPreview && previewAudio) {
      previewAudio.pause();
      isPlayingPreview = false;
      onPreviewStop?.();
      return;
    }

    // If generating, do nothing
    if (isGeneratingPreview || !onPreviewClick) return;

    isGeneratingPreview = true;
    try {
      const audio = await onPreviewClick(story);
      if (audio) {
        previewAudio = audio;
        isPlayingPreview = true;
        
        // Listen for playback end
        audio.onended = () => {
          isPlayingPreview = false;
          onPreviewStop?.();
        };
      }
    } finally {
      isGeneratingPreview = false;
    }
  }

  const sourceText = $derived(getStorySource(story));
  const snippet = $derived(getSnippet(sourceText));
  const sourceLabel = $derived(story.scriptActive ? 'Script' : 'Original');
</script>

<div class="story-card">
  <div class="card-reorder">
    <button
      type="button"
      class="reorder-btn"
      class:disabled={index === 0}
      disabled={index === 0}
      onclick={() => onMoveUp(index)}
      aria-label="Move story up"
    >
      <img src="/icons/icon-collapse.svg" alt="" class="reorder-icon" />
    </button>
    <button
      type="button"
      class="reorder-btn"
      class:disabled={index === total - 1}
      disabled={index === total - 1}
      onclick={() => onMoveDown(index)}
      aria-label="Move story down"
    >
      <img src="/icons/icon-expand.svg" alt="" class="reorder-icon" />
    </button>
  </div>

  <div class="card-body">
    <div class="card-meta">
      <div class="meta-left">
        <span class="story-number">Story {index + 1}</span>
        <span class="source-badge">{sourceLabel}</span>
      </div>
      <button
        type="button"
        class="preview-badge"
        class:generating={isGeneratingPreview}
        class:playing={isPlayingPreview}
        onclick={handlePreviewClick}
        disabled={isGeneratingPreview}
        aria-label={isPlayingPreview ? 'Stop preview' : isGeneratingPreview ? 'Generating preview' : 'Preview story audio'}
      >
        {#if isGeneratingPreview}
          <span class="badge-text">Generating</span>
          <img src="/icons/icon-square-fill.svg" alt="" class="badge-icon" />
        {:else if isPlayingPreview}
          <span class="badge-text">Playing</span>
          <img src="/icons/icon-square-fill.svg" alt="" class="badge-icon" />
        {:else}
          <span class="badge-text">Preview</span>
          <img src="/icons/icon-play-fill.svg" alt="" class="badge-icon" />
        {/if}
      </button>
    </div>
    <p class="card-snippet">{snippet}</p>
  </div>

  <button
    type="button"
    class="edit-btn"
    onclick={() => onEdit(story)}
    aria-label="Edit story"
  >
    <img src="/icons/icon-edit.svg" alt="" class="edit-icon" />
  </button>
</div>

<style>
  .story-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: border-color var(--transition-normal);
  }

  .story-card:hover {
    border-color: var(--color-border-active);
  }

  .card-reorder {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .reorder-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    border-radius: var(--radius-sm);
    transition: background-color var(--transition-normal);
  }

  .reorder-btn:hover:not(.disabled) {
    background-color: var(--color-highlight);
  }

  .reorder-btn.disabled {
    opacity: 0.25;
    cursor: default;
  }

  .reorder-icon {
    width: 14px;
    height: 14px;
    filter: invert(0.5);
  }

  .card-body {
    flex: 1;
    min-width: 0;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    margin-bottom: 4px;
  }

  .meta-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .story-number {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .source-badge {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary);
    background: var(--color-highlight);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    line-height: 1;
    display: inline-block;
    height: 20px;
    display: flex;
    align-items: center;
  }

  .preview-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary);
    background: var(--color-highlight);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
    transition: background-color var(--transition-normal);
    white-space: nowrap;
    flex-shrink: 0;
    height: 20px;
  }

  .badge-text {
    display: inline;
  }

  .badge-icon {
    width: 12px;
    height: 12px;
    filter: invert(0.3);
  }

  .preview-badge:hover:not(.generating):not(.playing):not(:disabled) {
    background-color: #e8d9f5;
  }

  .preview-badge.generating {
    animation: shimmer 1.5s ease-in-out infinite;
    cursor: default;
  }

  .preview-badge.playing {
    animation: shimmer 1.5s ease-in-out infinite;
    cursor: pointer;
  }

  .preview-badge:disabled {
    cursor: default;
  }

  @keyframes shimmer {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .card-snippet {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    margin: 0;
    /* Clamp to 3 lines */
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .edit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    transition: background-color var(--transition-normal);
  }

  .edit-btn:hover {
    background-color: var(--color-highlight);
  }

  .edit-icon {
    width: 18px;
    height: 18px;
    filter: invert(0.5);
  }
</style>
