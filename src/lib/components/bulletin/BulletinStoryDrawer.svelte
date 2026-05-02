<script lang="ts">
  import { untrack } from 'svelte';
  import { bulletinStore, generateStoryId, getStorySource } from '$lib/stores/bulletin';
  import type { BulletinStory, ScriptLength, ScriptType } from '$lib/stores/bulletin';
  import type { SilenceLevel } from '$lib/audioProcessing';
  import PlayButton from '$lib/components/PlayButton.svelte';
  import SpeedSlider from '$lib/components/SpeedSlider.svelte';
  import SilenceSlider from '$lib/components/SilenceSlider.svelte';

  interface Props {
    story?: BulletinStory | null;   // null/undefined = new story mode
    onClose: () => void;
  }

  let { story = null, onClose }: Props = $props();

  // ─── Draft state ─────────────────────────────────────────────────────────────
  // The drawer is always mounted for a single fixed story (or null); it never
  // re-uses the same instance for a different story.
  // We snapshot the prop via a function call to avoid Svelte's
  // state_referenced_locally warning (function calls are not tracked).

  function snapshotStory(s: typeof story) {
    return {
      id:           s?.id           ?? null,
      originalText: s?.originalText ?? '',
      script:       s?.script       ?? '',
      scriptActive: s?.scriptActive ?? false,
      scriptLength: (s?.scriptLength ?? 20) as ScriptLength,
      scriptType:   (s?.scriptType   ?? 'summary') as ScriptType,
      ttsAudio:     s?.ttsAudio     ?? null,
    };
  }

  const _init = untrack(() => snapshotStory(story));
  const isEditMode = _init.id !== null;

  let draft = $state({
    originalText: _init.originalText,
    script:       _init.script,
    scriptActive: _init.scriptActive,
    scriptLength: _init.scriptLength,
    scriptType:   _init.scriptType,
    ttsAudio:     _init.ttsAudio as string | null,
  });

  // ─── UI state ─────────────────────────────────────────────────────────────────

  let scriptCardOpen = $state(draft.scriptActive);
  let originalTextExpanded = $state(false);
  let textareaElement: HTMLTextAreaElement | null = null;


  // Toast state
  let toastMessage = $state('');
  let toastVisible = $state(false);
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Close-confirmation state
  let showCloseConfirm = $state(false);

  // Delete-confirmation state
  let showDeleteConfirm = $state(false);

  // ─── URL fetch state ──────────────────────────────────────────────────────────

  let fetchUrl = $state('');
  let fetchState: 'idle' | 'loading' | 'error' = $state('idle');
  let fetchError = $state('');
  let fetchSuccess = $state(false);
  let fetchProgress = $state('');

  // ─── Script generation state ──────────────────────────────────────────────────

  let isGeneratingScript = $state(false);
  let scriptError = $state('');

  // ─── Derived ──────────────────────────────────────────────────────────────────

  const originalWordCount = $derived(
    draft.originalText.trim() ? draft.originalText.trim().split(/\s+/).length : 0
  );
  const originalDuration = $derived(Math.round(originalWordCount / 2.5));

  const scriptWordCount = $derived(
    draft.script.trim() ? draft.script.trim().split(/\s+/).length : 0
  );
  const scriptDuration = $derived(Math.round(scriptWordCount / 2.5));

  const hasUnsavedChanges = $derived(
    draft.originalText !== _init.originalText ||
    draft.script       !== _init.script       ||
    draft.scriptActive !== _init.scriptActive ||
    draft.scriptLength !== _init.scriptLength ||
    draft.scriptType   !== _init.scriptType
  );

  // ─── Effects ──────────────────────────────────────────────────────────────────

  // Clear script and cached TTS when original text changes (invalidates generated script and audio)
  $effect(() => {
    if (draft.originalText !== _init.originalText) {
      draft.script = '';
      draft.scriptActive = false;
      draft.ttsAudio = null;
      scriptError = '';
    }
  });

  // ─── Toast helper ─────────────────────────────────────────────────────────────

  function showToast(msg: string, duration = 2200) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMessage = msg;
    toastVisible = true;
    toastTimeout = setTimeout(() => { toastVisible = false; }, duration);
  }

  // ─── Close logic ─────────────────────────────────────────────────────────────

  function requestClose() {
    if (hasUnsavedChanges) {
      showCloseConfirm = true;
    } else {
      onClose();
    }
  }

  function confirmClose() {
    showCloseConfirm = false;
    onClose();
  }

  function cancelClose() {
    showCloseConfirm = false;
  }

  // ─── Save logic ───────────────────────────────────────────────────────────────

  function saveStory() {
    if (!draft.originalText.trim()) {
      showToast('Please paste some text first.');
      return;
    }

    // If text changed, invalidate cached TTS audio
    const textChanged = draft.originalText !== _init.originalText;
    const scriptChanged = draft.script !== _init.script;
    const scriptActiveChanged = draft.scriptActive !== _init.scriptActive;

    const saved: BulletinStory = {
      id: _init.id ?? generateStoryId(),
      originalText: draft.originalText,
      script: draft.script,
      scriptActive: draft.scriptActive,
      scriptLength: draft.scriptLength,
      scriptType: draft.scriptType,
      // Clear cached TTS if any text-related field changed
      ttsAudio: (textChanged || scriptChanged || scriptActiveChanged) ? null : draft.ttsAudio,
    };

    if (isEditMode) {
      bulletinStore.updateStory(saved);
    } else {
      bulletinStore.addStory(saved);
    }

    onClose();
  }

  // ─── Delete logic ─────────────────────────────────────────────────────────────

  function requestDelete() {
    showDeleteConfirm = true;
  }

  function confirmDelete() {
    if (_init.id) {
      bulletinStore.deleteStory(_init.id);
    }
    showDeleteConfirm = false;
    onClose();
  }

  function cancelDelete() {
    showDeleteConfirm = false;
  }

  // ─── Original text helpers ────────────────────────────────────────────────────

  function clearText() {
    draft.originalText = '';
    // Clearing original text also clears any generated audio
    draft.ttsAudio = null;
  }

  async function copyText() {
    if (!draft.originalText.trim()) return;
    try {
      await navigator.clipboard.writeText(draft.originalText);
      showToast('Copied!');
    } catch {
      showToast('Could not copy text.');
    }
  }

  // ─── URL fetch handler ────────────────────────────────────────────────────────

  async function fetchFromUrl() {
    if (!fetchUrl.trim()) return;
    fetchState = 'loading';
    fetchError = '';
    fetchSuccess = false;
    fetchProgress = 'Fetching the page…';

    try {
      const res = await fetch('/api/fetch-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fetchUrl.trim() })
      });

      fetchProgress = 'Processing the article…';
      const data = await res.json();

      if (data.error === 'PAYWALL') {
        fetchError = 'Sorry, the article may be blocked or paywalled. Try pasting instead.';
        fetchState = 'error';
        fetchProgress = '';
      } else if (data.error === 'FETCH_FAILED') {
        fetchError = 'Sorry, the article may be blocked or paywalled. Try pasting instead.';
        fetchState = 'error';
        fetchProgress = '';
      } else if (data.error === 'NO_CONTENT') {
        fetchError = 'Sorry, the article may be blocked or paywalled. Try pasting instead.';
        fetchState = 'error';
        fetchProgress = '';
      } else if (data.error === 'GEMINI_FAILED') {
        fetchError = 'Sorry, the article may be blocked or paywalled. Try pasting instead.';
        fetchState = 'error';
        fetchProgress = '';
      } else if (data.text) {
        draft.originalText = data.text;
        fetchUrl = '';
        fetchState = 'idle';
        fetchSuccess = true;
        fetchProgress = '';
        originalTextExpanded = true;
        setTimeout(() => { fetchSuccess = false; }, 2000);
      }
    } catch (e: any) {
      fetchError = 'Sorry, the article may be blocked or paywalled. Try pasting instead.';
      fetchState = 'error';
      fetchProgress = '';
    }
  }

  function clearFetchUrl() {
    fetchUrl = '';
    fetchState = 'idle';
    fetchError = '';
    fetchSuccess = false;
  }

  // ─── Script generation ────────────────────────────────────────────────────────

  async function generateScript() {
    const source = draft.originalText.trim();
    if (!source) return;

    isGeneratingScript = true;
    scriptError = '';

    try {
      const response = await fetch('/api/bulletin-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: source,
          scriptLength: draft.scriptLength,
          scriptType: draft.scriptType,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? 'Script generation failed');
      }

      const { script } = await response.json();
      draft.script = script;
      draft.scriptActive = true;
    } catch (e) {
      scriptError = 'Could not generate script. Please try again.';
      console.error('[BulletinScript]', e);
    } finally {
      isGeneratingScript = false;
    }
  }

  // ─── Script card ─────────────────────────────────────────────────────────────

  function setScriptLength(len: ScriptLength) {
    draft.scriptLength = len;
  }

  function setScriptType(type: ScriptType) {
    draft.scriptType = type;
  }

  // When script textarea is edited, just update the script text
  // Don't auto-set scriptActive; let the toggle control that
  function handleScriptInput(e: Event) {
    draft.script = (e.target as HTMLTextAreaElement).value;
  }

  // Auto-resize textarea on input (only for collapsed state)
  function autoResize(e: Event | { target: HTMLTextAreaElement }) {
    const el = e.target as HTMLTextAreaElement;
    // Always clear inline height — CSS min-height handles sizing
    el.style.height = '';
  }

  // Toggle expand/collapse and immediately apply height
  function toggleExpand() {
    originalTextExpanded = !originalTextExpanded;
    if (textareaElement) {
      textareaElement.style.height = '';
    }
  }

  // ─── TTS helpers ─────────────────────────────────────────────────────────────

  function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteChars = atob(base64);
    const byteNumbers = Array.from(byteChars, c => c.charCodeAt(0));
    return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  }

</script>

<!-- ─── Drawer overlay ──────────────────────────────────────────────────────── -->
<div class="drawer-overlay" role="dialog" aria-modal="true" aria-label="Story editor">

  <div class="drawer">

    <!-- Header -->
    <header class="drawer-header">
      <button
        type="button"
        class="header-btn close-btn"
        onclick={requestClose}
        aria-label="Close drawer"
      >
        ×
      </button>
      <span class="drawer-title">{isEditMode ? 'Edit Story' : 'Add Story'}</span>
      <button
        type="button"
        class="header-btn save-btn"
        onclick={saveStory}
        disabled={!draft.originalText.trim()}
      >
        Save
      </button>
    </header>

    <!-- Scrollable body -->
    <div class="drawer-body">

      <!-- ── URL Fetch ──────────────────────────────────────────────────────── -->
      <div class="url-fetch">
        <div class="url-fetch__row">
          <input
            type="url"
            class="url-fetch__input"
            placeholder="Add story URL"
            bind:value={fetchUrl}
            onkeydown={(e) => e.key === 'Enter' && fetchFromUrl()}
            disabled={fetchState === 'loading'}
          />

          <button
            class="url-fetch__btn"
            class:url-fetch__btn--active={fetchUrl.trim().length > 0 && fetchState !== 'loading' && !fetchSuccess}
            class:url-fetch__btn--loading={fetchState === 'loading'}
            class:url-fetch__btn--success={fetchSuccess}
            onclick={fetchFromUrl}
            disabled={fetchState === 'loading' || fetchSuccess || !fetchUrl.trim()}
            aria-label="Fetch story from URL"
          >
            {#if fetchState === 'loading'}
              <span class="url-fetch__spinner"></span>
            {:else if fetchSuccess}
              <span class="url-fetch__icon url-fetch__icon--tick">✓</span>
            {:else}
              <span class="url-fetch__icon">›</span>
            {/if}
          </button>
        </div>

        {#if fetchState === 'loading' && fetchProgress}
          <p class="url-fetch__progress">{fetchProgress}</p>
        {:else if fetchState === 'error'}
          <p class="url-fetch__error">{fetchError}</p>
        {/if}
      </div>

      <!-- ── Divider ────────────────────────────────────────────────────────── -->
      <div class="url-fetch__divider"><span>or paste story text</span></div>

      <!-- ── Original Text card ─────────────────────────────────────────────── -->
      <div class="text-card" class:expanded={originalTextExpanded}>
        <textarea
          bind:this={textareaElement}
          class="original-textarea"
          placeholder="Paste text"
          value={draft.originalText}
          oninput={(e) => {
            draft.originalText = (e.target as HTMLTextAreaElement).value;
            autoResize(e);
            if (draft.originalText.trim()) {
              originalTextExpanded = true;
            }
          }}
        ></textarea>

        {#if originalWordCount > 0}
          <div class="text-meta">
            <span class="word-count">{originalWordCount} words · ~{originalDuration}s</span>
          </div>
        {/if}

        <!-- Below-card actions -->
        <div class="text-actions">
          <button
            type="button"
            class="text-action-btn clear-btn"
            onclick={clearText}
            disabled={!draft.originalText.trim()}
          >
            CLEAR TEXT
          </button>
          <button
            type="button"
            class="text-action-btn copy-btn"
            onclick={copyText}
            disabled={!draft.originalText.trim()}
          >
            <img src="/icons/icon-copy.svg" alt="" class="action-icon" />
            COPY
          </button>
          <button
            type="button"
            class="text-action-btn expand-btn"
            onclick={toggleExpand}
            aria-label={originalTextExpanded ? 'Collapse text area' : 'Expand text area'}
          >
            <img
              src={originalTextExpanded ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
              alt=""
              class="action-icon"
            />
          </button>
        </div>
      </div>

      <!-- ── Use original / Create script toggle ────────────────────────────── -->
      <div class="choice-section">
        <button
          type="button"
          class="choice-btn"
          class:active={!draft.scriptActive}
          onclick={() => {
            draft.scriptActive = false;
          }}
          aria-pressed={!draft.scriptActive}
        >
          Use original
        </button>
        <button
          type="button"
          class="choice-btn"
          class:active={draft.scriptActive}
          onclick={() => {
            draft.scriptActive = true;
            // Collapse text input when Create script is activated
            originalTextExpanded = false;
          }}
          aria-pressed={draft.scriptActive}
        >
          Create script
        </button>
      </div>

      <!-- ── Script card (only shown when Create script is active) ──────────── -->
      {#if draft.scriptActive}
        <div class="script-card">

          <!-- Script length selector -->
          <div class="field-group">
            <span class="field-label">Length</span>
            <div class="toggle-boxes">
              {#each ([20, 30, 60, 90] as const) as len}
                <button
                  type="button"
                  class="toggle-box"
                  class:active={draft.scriptLength === len}
                  onclick={() => setScriptLength(len)}
                >{len}s</button>
              {/each}
            </div>
          </div>

          <!-- Script type selector -->
          <div class="field-group">
            <span class="field-label">Format</span>
            <div class="toggle-boxes">
              <button
                type="button"
                class="toggle-box toggle-box--wide"
                class:active={draft.scriptType === 'summary'}
                onclick={() => setScriptType('summary')}
              >Summary</button>
              <button
                type="button"
                class="toggle-box toggle-box--wide"
                class:active={draft.scriptType === 'explainer'}
                onclick={() => setScriptType('explainer')}
              >Explainer</button>
            </div>
          </div>

          <!-- Script textarea -->
          <div class="field-group">
            <textarea
              class="script-textarea"
              placeholder="Script will appear here"
              value={draft.script}
              oninput={handleScriptInput}
              rows="6"
            ></textarea>
            {#if scriptWordCount > 0}
              <span class="word-count word-count--right">{scriptWordCount} words · ~{scriptDuration}s</span>
            {/if}
          </div>

          <!-- Generate Script button -->
          <button
            type="button"
            class="btn-generate"
            onclick={generateScript}
            disabled={isGeneratingScript || !draft.originalText.trim()}
          >
            {#if isGeneratingScript}
              Generating <span class="spinner"></span>
            {:else}
              Generate script
            {/if}
          </button>

          {#if scriptError}
            <p class="error-text">{scriptError}</p>
          {/if}

        </div>
      {/if}

      <!-- ── Delete Story ────────────────────────────────────────────────────── -->
      <div class="controls-section">

        <!-- Delete Story — centred modest text button with trash icon -->
        {#if isEditMode}
          <div class="delete-section">
            <button
              type="button"
              class="delete-btn"
              onclick={requestDelete}
            >
              <img src="/icons/icon-trash.svg" alt="" class="delete-icon" />
              Delete Story
            </button>
          </div>
        {/if}

      </div><!-- /controls-section -->

    </div><!-- /drawer-body -->

  </div><!-- /drawer -->

</div><!-- /drawer-overlay -->

<!-- ─── Close confirmation toast ──────────────────────────────────────────── -->
{#if showCloseConfirm}
  <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label="Discard changes?">
    <div class="confirm-sheet">
      <p class="confirm-message">Discard unsaved changes?</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn confirm-btn--cancel" onclick={cancelClose}>
          Keep editing
        </button>
        <button type="button" class="confirm-btn confirm-btn--destructive" onclick={confirmClose}>
          Discard
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Delete confirmation sheet ─────────────────────────────────────────── -->
{#if showDeleteConfirm}
  <div class="confirm-overlay" role="dialog" aria-modal="true" aria-label="Delete story?">
    <div class="confirm-sheet">
      <p class="confirm-message">Delete this story? This cannot be undone.</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn confirm-btn--cancel" onclick={cancelDelete}>
          Cancel
        </button>
        <button type="button" class="confirm-btn confirm-btn--destructive" onclick={confirmDelete}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ─── Toast ──────────────────────────────────────────────────────────────── -->
{#if toastVisible}
  <div class="toast" role="status" aria-live="polite">
    {toastMessage}
  </div>
{/if}

<style>
  /* ── Overlay ────────────────────────────────────────────────────────────── */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: var(--bg-white);
    z-index: 500;
    display: flex;
    flex-direction: column;
  }

  /* ── Drawer shell ───────────────────────────────────────────────────────── */
  .drawer {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 480px;
    width: 100%;
    margin: 0 auto;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .drawer-header {
    display: flex;
    align-items: center;
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
  }

  .drawer-title {
    flex: 1;
    text-align: center;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .header-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    transition: background-color var(--transition-normal), color var(--transition-normal);
    min-width: 52px;
  }

  .close-btn {
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text-secondary);
    text-align: left;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background-color: var(--color-highlight);
  }

  .save-btn {
    color: var(--color-primary);
    font-weight: var(--font-weight-semibold);
    text-align: right;
  }

  .save-btn:hover:not(:disabled) {
    background-color: var(--color-highlight);
  }

  .save-btn:disabled {
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  /* ── Body ───────────────────────────────────────────────────────────────── */
  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── Original text card ─────────────────────────────────────────────────── */
  .text-card {
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-sm);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .original-textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-size: var(--font-size-base);
    font-family: var(--font-family-base);
    line-height: var(--line-height-normal);
    color: var(--text-primary);
    resize: none;
    box-sizing: border-box;
    padding: var(--spacing-xs) var(--spacing-sm);
    min-height: 100px;
    transition: min-height var(--transition-normal);
    overflow-y: auto;
  }

  .text-card.expanded .original-textarea {
    min-height: calc(100vh - 280px);
  }

  .original-textarea::placeholder {
    color: var(--text-secondary);
  }

  .text-meta {
    display: flex;
    justify-content: flex-end;
    padding: 0 var(--spacing-xs);
  }

  .word-count {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .word-count--right {
    display: block;
    text-align: right;
  }

  /* Below-card action row */
  .text-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-xs) 0;
    border-top: 1px solid var(--color-border);
    margin-top: var(--spacing-xs);
  }

  .text-action-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    letter-spacing: 0.04em;
    transition: color var(--transition-normal), background-color var(--transition-normal);
  }

  .text-action-btn:hover:not(:disabled) {
    color: var(--text-primary);
    background-color: var(--color-border);
  }

  .text-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .expand-btn {
    margin-left: auto;
  }

  .action-icon {
    width: 14px;
    height: 14px;
    filter: invert(0.5);
  }

  /* ── Script card ────────────────────────────────────────────────────────── */
  .script-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: visible;
    transition: border-color var(--transition-normal);
  }

  .script-card.open {
    border-color: var(--color-border-active);
  }

  .script-card-header {
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
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
  }

  /* ── Choice section — Use original / Create script ────────────────────────── */
  .choice-section {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
    margin-bottom: var(--spacing-md);
  }

  .choice-btn {
    flex: 1;
    padding: 8px var(--spacing-xs);
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    text-align: center;
    transition: all var(--transition-normal);
  }

  .choice-btn:hover:not(.active) {
    border-color: var(--color-border-active);
    color: var(--text-primary);
  }

  .choice-btn.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--bg-white);
    font-weight: var(--font-weight-semibold);
  }

  /* ── Script card ────────────────────────────────────────────────────────── */
  .script-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* ── Field group ────────────────────────────────────────────────────────── */
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .field-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  /* ── Toggle boxes (length / type) ───────────────────────────────────────── */
  .toggle-boxes {
    display: flex;
    gap: var(--spacing-xs);
  }

  .toggle-box {
    flex: 1;
    padding: 8px var(--spacing-xs);
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    text-align: center;
    transition: all var(--transition-normal);
  }

  .toggle-box:hover:not(.active) {
    border-color: var(--color-border-active);
    color: var(--text-primary);
  }

  .toggle-box.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--bg-white);
    font-weight: var(--font-weight-semibold);
  }

  .toggle-box--wide {
    flex: 1;
  }

  /* ── Script textarea ────────────────────────────────────────────────────── */
  .script-textarea {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-family: var(--font-family-base);
    line-height: var(--line-height-normal);
    color: var(--text-primary);
    background: var(--bg-white);
    resize: vertical;
    transition: border-color var(--transition-normal);
    box-sizing: border-box;
  }

  .script-textarea:focus {
    outline: none;
    border-color: var(--color-border-active);
  }

  .script-textarea::placeholder {
    color: var(--text-secondary);
  }

  /* ── Generate Script button ─────────────────────────────────────────────── */
  .error-text {
    font-size: var(--font-size-sm);
    color: #c62828;
    margin: 0;
    text-align: center;
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(84, 34, 176, 0.3);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: middle;
    margin-left: 6px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .btn-generate {
    width: 100%;
    padding: 12px var(--spacing-md);
    background: var(--color-primary);
    color: var(--bg-white);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: background var(--transition-normal);
  }

  .btn-generate:hover:not(:disabled) {
    background: #4a1d9e;
  }

  .btn-generate:disabled {
    background: var(--color-highlight);
    color: var(--color-primary);
    cursor: not-allowed;
  }

  /* ── Controls section ───────────────────────────────────────────────────── */
  .controls-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-xl);
  }

  /* ── Delete section ─────────────────────────────────────────────────────── */
  .delete-section {
    display: flex;
    justify-content: center;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    padding: var(--spacing-xs) var(--spacing-md);
    border-radius: var(--radius-sm);
    transition: color var(--transition-normal), background-color var(--transition-normal);
  }

  .delete-btn:hover {
    color: #c62828;
    background-color: #ffebee;
  }

  .delete-icon {
    width: 14px;
    height: 14px;
    filter: invert(0.5);
    transition: filter var(--transition-normal);
  }

  .delete-btn:hover .delete-icon {
    filter: invert(20%) sepia(80%) saturate(3000%) hue-rotate(340deg);
  }

  /* ── Confirmation overlay ───────────────────────────────────────────────── */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 600;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .confirm-sheet {
    background: var(--bg-white);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding: var(--spacing-xl) var(--spacing-lg);
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .confirm-message {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    text-align: center;
    margin: 0;
  }

  .confirm-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .confirm-btn {
    flex: 1;
    padding: 12px var(--spacing-md);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all var(--transition-normal);
  }

  .confirm-btn--cancel {
    background: var(--bg-main);
    color: var(--text-primary);
  }

  .confirm-btn--cancel:hover {
    background: var(--color-border);
  }

  .confirm-btn--destructive {
    background: #c62828;
    color: var(--bg-white);
  }

  .confirm-btn--destructive:hover {
    background: #b71c1c;
  }

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  .toast {
    position: fixed;
    bottom: calc(var(--spacing-xl) + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    background: #1f1f1f;
    color: var(--bg-white);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-round);
    z-index: 700;
    white-space: nowrap;
    pointer-events: none;
    animation: toast-in 0.18s ease;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── URL Fetch ──────────────────────────────────────────────────────────── */
  .url-fetch {
    margin-bottom: 0;
  }

  .url-fetch__row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .url-fetch__input {
    flex: 1;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-base);
    color: var(--text-primary);
    background: var(--bg-white);
    min-width: 0;
  }

  .url-fetch__input:focus {
    outline: none;
    border-color: var(--color-border-active);
  }

  .url-fetch__input:disabled {
    opacity: 0.6;
    background: #f5f5f5;
  }

  .url-fetch__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    background: #e8e8e8;
    color: #999;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
    cursor: not-allowed;
    flex-shrink: 0;
    transition: background-color 200ms ease, color 200ms ease;
  }

  .url-fetch__btn--active {
    background: var(--accent-brand);
    color: #fff;
    cursor: pointer;
  }

  .url-fetch__btn--active:hover {
    opacity: 0.9;
  }

  .url-fetch__btn--loading {
    background: var(--accent-brand);
    color: #fff;
    cursor: wait;
  }

  .url-fetch__btn--success {
    background: #2e7d32;
    color: #fff;
    cursor: default;
  }

  .url-fetch__spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: url-fetch-spin 0.8s linear infinite;
  }

  @keyframes url-fetch-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .url-fetch__icon {
    display: inline-block;
  }

  .url-fetch__progress {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    line-height: var(--line-height-normal);
  }

  .url-fetch__error {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-sm);
    color: #c0392b;
    line-height: var(--line-height-normal);
  }

  .url-fetch__divider {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    margin: 0;
  }

  .url-fetch__divider::before,
  .url-fetch__divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
</style>
