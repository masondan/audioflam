
## URL Fetch Feature — Implementation Plan

**Target file:** `src/lib/components/bulletin/BulletinStoryDrawer.svelte`
**New file:** `src/routes/api/fetch-story/+server.ts`
**Existing integration:** Gemini (already used in `bulletin-script/+server.ts`)

---

## Stage 1 — Server Endpoint

**File:** `src/routes/api/fetch-story/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const STRIP_TAGS = /<(script|style|nav|footer|header|aside|noscript|iframe|form)[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_ALL_TAGS = /<[^>]+>/g;
const MAX_CHARS = 50000;

const SYSTEM_PROMPT = `You are an article text extractor for a journalism tool.
Extract ONLY the main article body text from the provided HTML.
Rules:
- Return plain text only. No markdown, no headings, no bullet points.
- Exclude: navigation, ads, related stories, captions, author bios, comment sections, cookie notices, subscription prompts.
- Preserve paragraph breaks with a single blank line between paragraphs.
- If the content appears to be a paywall stub or login prompt (less than 150 words of article body), respond with exactly: PAYWALL
- If no article content can be found, respond with exactly: NO_CONTENT`;

export const POST: RequestHandler = async ({ request }) => {
  const { url } = await request.json();

  if (!url || !url.startsWith('http')) {
    throw error(400, 'Invalid URL');
  }

  // Fetch the page server-side (bypasses CORS)
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AudioFlam/1.0)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e: any) {
    return json({ error: 'FETCH_FAILED', message: e.message });
  }

  // Strip heavy tags, then all remaining tags, truncate
  const stripped = html
    .replace(STRIP_TAGS, ' ')
    .replace(STRIP_ALL_TAGS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);

  // Send to Gemini 2.5 Flash
  const geminiApiKey = env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return json({ error: 'SERVER_ERROR', message: 'Gemini API key not configured' });
  }

  let geminiRes: Response;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: stripped }] }]
        })
      }
    );
  } catch (e: any) {
    return json({ error: 'GEMINI_FAILED', message: 'Failed to reach Gemini API' });
  }

  if (!geminiRes.ok) {
    return json({ error: 'GEMINI_FAILED', message: `Gemini API error: ${geminiRes.status}` });
  }

  const geminiData = await geminiRes.json();
  const extracted = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!extracted || extracted === 'NO_CONTENT') {
    return json({ error: 'NO_CONTENT' });
  }
  if (extracted === 'PAYWALL') {
    return json({ error: 'PAYWALL' });
  }

  return json({ text: extracted });
};
```

**Implementation notes:**
- Uses `import { env } from '$env/dynamic/private'` (matching `bulletin-script/+server.ts` pattern)
- Calls `gemini-2.5-flash` model (not 2.0-flash)
- Includes error handling for Gemini API failures (matching bulletin-script pattern)
- Returns structured error objects with `error` and optional `message` fields

**Verify:** Deploy and test with `curl -X POST /api/fetch-story -d '{"url":"https://punchng.com/[any-story]"}'`. Confirm clean text returns. Test a paywalled URL returns `PAYWALL`.

---

## Stage 2 — UI in BulletinStoryDrawer

**File:** `src/lib/components/bulletin/BulletinStoryDrawer.svelte`

### 2a — Add state variables (in the `<script>` block, near other local state)

```typescript
let fetchUrl = $state('');
let fetchState: 'idle' | 'loading' | 'error' = $state('idle');
let fetchError = $state('');
let fetchSuccess = $state(false);
```

### 2b — Add fetch handler (in `<script>` block)

```typescript
async function fetchFromUrl() {
  if (!fetchUrl.trim()) return;
  fetchState = 'loading';
  fetchError = '';
  fetchSuccess = false;
  
  try {
    const res = await fetch('/api/fetch-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fetchUrl.trim() })
    });
    const data = await res.json();
    
    if (data.error === 'PAYWALL') {
      fetchError = 'This page appears to be paywalled. Paste the text directly.';
      fetchState = 'error';
    } else if (data.error === 'FETCH_FAILED') {
      fetchError = 'Could not reach this page. Check the URL or paste the text directly.';
      fetchState = 'error';
    } else if (data.error === 'NO_CONTENT') {
      fetchError = 'No article text found. Paste the text directly.';
      fetchState = 'error';
    } else if (data.error === 'GEMINI_FAILED') {
      fetchError = 'Failed to process article. Paste the text directly.';
      fetchState = 'error';
    } else if (data.text) {
      // Update draft.originalText (not story.originalText directly)
      draft.originalText = data.text;
      fetchUrl = '';
      fetchState = 'idle';
      fetchSuccess = true;
      // Clear success indicator after 2 seconds
      setTimeout(() => { fetchSuccess = false; }, 2000);
    }
  } catch (e: any) {
    fetchError = 'Something went wrong. Paste the text directly.';
    fetchState = 'error';
  }
}

function clearFetchUrl() {
  fetchUrl = '';
  fetchState = 'idle';
  fetchError = '';
  fetchSuccess = false;
}
```

> **Note for implementing agent:** The handler updates `draft.originalText` (the local working copy), not `story.originalText` directly. This matches the pattern where the drawer maintains a draft state that syncs to the store on save. Verify this pattern in the existing textarea binding.

### 2c — Add UI markup (directly above the existing `<textarea>` for original text)

```svelte
<!-- URL Fetch Section -->
<div class="url-fetch">
  <label class="url-fetch__label">Fetch story from URL</label>
  
  <div class="url-fetch__row">
    <input
      type="url"
      class="url-fetch__input"
      placeholder="Add URL"
      bind:value={fetchUrl}
      onkeydown={(e) => e.key === 'Enter' && fetchFromUrl()}
      disabled={fetchState === 'loading'}
    />
    
    <button
      class="url-fetch__btn"
      class:url-fetch__btn--active={fetchUrl.trim().length > 0 && fetchState !== 'loading'}
      class:url-fetch__btn--loading={fetchState === 'loading'}
      onclick={fetchFromUrl}
      disabled={fetchState === 'loading' || !fetchUrl.trim()}
      aria-label="Fetch story from URL"
    >
      {#if fetchState === 'loading'}
        <span class="url-fetch__spinner"></span>
      {:else if fetchSuccess}
        <span class="url-fetch__icon">✓</span>
      {:else}
        <span class="url-fetch__icon">›</span>
      {/if}
    </button>
    
    {#if fetchSuccess}
      <button
        class="url-fetch__clear"
        onclick={clearFetchUrl}
        aria-label="Clear URL"
      >
        ×
      </button>
    {/if}
  </div>
  
  {#if fetchState === 'error'}
    <p class="url-fetch__error">{fetchError}</p>
  {/if}
</div>

<!-- Divider -->
<div class="url-fetch__divider">---- or paste story text ----</div>

<!-- Original Text Textarea (existing) -->
<textarea
  class="story-textarea"
  placeholder="Paste or edit story text…"
  bind:value={draft.originalText}
></textarea>
```

### 2d — Add styles (in the component's `<style>` block)

```css
.url-fetch {
  margin-bottom: 1rem;
}

.url-fetch__label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: 0.5rem;
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

.url-fetch__spinner {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.url-fetch__icon {
  display: inline-block;
}

.url-fetch__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  color: var(--text-secondary);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 1.5rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 200ms ease, background-color 200ms ease;
}

.url-fetch__clear:hover {
  color: var(--text-primary);
  background: var(--color-highlight);
}

.url-fetch__error {
  margin: 0.5rem 0 0;
  font-size: var(--font-size-sm);
  color: #c0392b;
  line-height: var(--line-height-normal);
}

.url-fetch__divider {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: 1rem 0;
  letter-spacing: 0.05em;
}
```

---

## UI Design Vision

The URL fetch section provides a streamlined, mobile-friendly interface for importing article text:

1. **Label** — "Fetch story from URL" clearly identifies the feature
2. **Input field** — Placeholder "Add URL" guides users; accepts any HTTP/HTTPS URL
3. **Chevron button** — 
   - **Inactive (grey):** Disabled state when input is empty
   - **Active (purple):** Enabled when URL is entered; chevron (›) indicates "go" action
   - **Loading:** Spinner animation during fetch
   - **Success:** Checkmark (✓) briefly shown after successful fetch
4. **Clear button (×)** — Appears only after successful fetch; allows quick reset
5. **Divider text** — "---- or paste story text ----" separates URL section from manual text entry
6. **Error messages** — Contextual feedback for paywall, fetch failure, or no content found

All styling uses design tokens from `src/app.css` for consistency with the rest of AudioFlam.

---

## Checkpoints

This feature is self-contained enough that a single agent pass should complete it. Checkpoints are only needed if the implementing agent hits token limits mid-way.

**Checkpoint A** — after Stage 1: endpoint tested via curl/Postman, clean text confirmed from at least one Nigerian and one international news URL. Verify Gemini 2.5 Flash model is called correctly and error handling matches bulletin-script pattern.

**Checkpoint B** — after Stage 2: UI renders correctly in the drawer on mobile viewport, text populates the draft.originalText field, error states display for paywall and fetch failure. Verify chevron button state transitions (grey → purple → spinner → checkmark) and clear button appears/disappears correctly.

---

## Handoff note for implementing agent

Read `AGENTS.md` first (tech stack overview). Then read these files before touching anything:

- `src/lib/components/bulletin/BulletinStoryDrawer.svelte` — find the `<textarea>` for `originalText` and the pattern used to update draft state. The fetch handler's success path must update `draft.originalText` (not `story.originalText` directly). Verify the exact binding pattern before implementing.
- `src/routes/api/bulletin-script/+server.ts` — reference for how Gemini is called in this project. This endpoint should follow the same pattern:
  - Use `import { env } from '$env/dynamic/private'` (not `$env/static/private`)
  - Call `gemini-2.5-flash` model
  - Include error handling for API failures (check for `!geminiRes.ok` before parsing)
  - Return structured error objects with `error` and optional `message` fields

**Key implementation details:**
1. The `fetchSuccess` state tracks the post-success UI state (checkmark + clear button visible for 2 seconds)
2. The chevron button uses CSS classes to transition between inactive (grey), active (purple), and loading (spinner) states
3. The clear button (×) only appears when `fetchSuccess === true`
4. The divider text "---- or paste story text ----" is a visual separator, not interactive
5. All error messages are user-friendly and suggest fallback actions (paste text directly)

The Gemini API key env var is `GEMINI_API_KEY` — confirm in `bulletin-script/+server.ts` before writing the endpoint.
