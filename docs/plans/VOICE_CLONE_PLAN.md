# AudioFlam Voice Cloning — Implementation Plan
**Version:** 2.0 — May 2026 (Updated post-review)  
**Status:** Ready for agent handoff  
**Stack:** SvelteKit 2 + Svelte 5 (TypeScript), Cloudflare Pages, native CSS variables  
**Provider:** Qwen3-TTS via DashScope International (`dashscope-intl.aliyuncs.com`)

---

## Overview

A journalist records or uploads a 10–20 second voice sample, names it, types their country, and their cloned voice appears at the top of the TTS voice dropdown. Maximum 4 custom voices. All data stored in localStorage. No backend persistence. Export/import via JSON file.

---

## Files Changed / Created

```
NEW  src/lib/components/VoiceClonePanel.svelte     ← Main clone UI (collapsible panel)
NEW  src/routes/api/tts/clone/+server.ts           ← Clone registration + deletion API
MOD  src/lib/stores.ts                             ← CustomVoice type + customVoices store
MOD  src/lib/components/VoiceDropdown.svelte       ← Cloned voices merged into voices prop
MOD  src/routes/+page.svelte                       ← Mount VoiceClonePanel under Adjust audio
MOD  AGENTS.md                                     ← Document new feature
```

---

## Data Model

Add to `src/lib/stores.ts`:

```typescript
export interface CustomVoice {
  id: string;           // Qwen clone ID from DashScope (e.g. "qwen-vc-xxxx")
  name: string;         // Max 15 chars, e.g. "Amara"
  country: string;      // Free text, e.g. "Ghana"
  previewAudio: string; // Base64 MP3 (NOT WAV) — generated once at clone time
  createdAt: number;    // Date.now() timestamp
}

const MAX_CUSTOM_VOICES = 4;

function loadCustomVoices(): CustomVoice[] {
  // SSR guard: localStorage only exists in browser
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('audioflam_custom_voices') ?? '[]');
  } catch {
    return [];
  }
}

export const customVoices = writable<CustomVoice[]>(loadCustomVoices());

customVoices.subscribe(val => {
  // SSR guard: only save in browser
  if (typeof window !== 'undefined') {
    localStorage.setItem('audioflam_custom_voices', JSON.stringify(val));
  }
});

export { MAX_CUSTOM_VOICES };

// Helper: convert CustomVoice to VoiceOption for dropdown integration
export function customVoiceToVoiceOption(voice: CustomVoice): VoiceOption {
  return {
    name: voice.id,           // Use clone ID as the voice name for TTS API
    ssmlGender: 'FEMALE',     // Placeholder; not used for Qwen clones
    displayName: voice.name,  // User-friendly name for dropdown
    description: `Custom (${voice.country})`,
    provider: 'qwen'
  };
}
```

**Notes:**
- No gender field — not needed (no flag, no dropdown grouping)
- No ISO country code — Unicode star `★` replaces flag entirely
- `previewAudio` stored as base64 **MP3** (not WAV) — smaller storage footprint (~60–120KB per voice vs 480KB–960KB for WAV)
- SSR guard required: `localStorage` doesn't exist on server during build

---

## Placeholder Script (Preview Text)

Used for all voice previews — built-in and cloned:

```
They say change begins at the end of your comfort zone. So are you ready to change your story?
```

Store as a constant in `src/lib/stores.ts`:

```typescript
export const CLONE_PREVIEW_SCRIPT = "They say change begins at the end of your comfort zone. So are you ready to change your story?";
```

---

## Phase 1 — Data Model + Store

**File:** `src/lib/stores.ts`

1. Add `CustomVoice` interface
2. Add `MAX_CUSTOM_VOICES = 4` constant
3. Add `CLONE_PREVIEW_SCRIPT` constant
4. Add `customVoices` writable store with localStorage persistence (load on init with SSR guard, subscribe to save with SSR guard)
5. Add `customVoiceToVoiceOption()` helper function

**Checkpoint 1:** Open browser console. Run:
```javascript
localStorage.setItem('audioflam_custom_voices', JSON.stringify([{id:'test',name:'Test',country:'Ghana',previewAudio:'',createdAt:Date.now()}]));
location.reload();
```
Confirm store loads the test entry on refresh. Delete it after confirming.

---

## Phase 2 — Clone Registration API

**New file:** `src/routes/api/tts/clone/+server.ts`

### POST `/api/tts/clone` — Register a new voice clone

**Request:**
```json
{
  "audioBase64": "<base64-encoded audio>",
  "audioFormat": "webm",
  "preferredName": "amara"
}
```

**Implementation:**
```typescript
// DashScope voice clone registration
const response = await fetch(
  'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${QWEN_SPEECH_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen-voice-enrollment',
      input: {
        action: 'create',
        target_model: 'qwen3-tts-vc-2026-01-22',
        preferred_name: preferredName,
        audio: {
          data: `data:audio/${audioFormat};base64,${audioBase64}`
        }
      }
    })
  }
);
const data = await response.json();
const cloneId = data.output.voice; // Qwen-assigned clone ID
return json({ cloneId });
```

**Response:**
```json
{ "cloneId": "qwen-vc-xxxxxxxxxxxx" }
```

**Important:** The `audioFormat` field must reflect the actual MIME type of the recorded audio. `MediaRecorder` produces `audio/webm;codecs=opus` (or `audio/mp4` on iOS), not WAV. Extract the MIME type from the blob and pass it to the API.

### DELETE `/api/tts/clone` — Remove a clone from Qwen

**Request:**
```json
{ "cloneId": "qwen-vc-xxxxxxxxxxxx" }
```

**Implementation:** Call DashScope deletion endpoint if available. If endpoint returns 404 or is not documented, log and return `{ success: true }` — localStorage removal is the source of truth; server-side orphan clones at this scale are acceptable.

**Error handling:** Wrap all fetch calls in try/catch. Return `{ error: 'message' }` with appropriate HTTP status. Do not expose DashScope raw errors to client.

**Checkpoint 2:** Use a REST client (Bruno/Postman/curl) or a temporary test button to POST a short audio base64 to `/api/tts/clone`. Confirm a `cloneId` string is returned. Log the ID.

---

## Phase 3 — VoiceClonePanel Component

**New file:** `src/lib/components/VoiceClonePanel.svelte`

This is a simple collapsible panel (NOT using `TogglePanel.svelte` — that component has a built-in toggle switch which is not needed here). Build a custom collapsible shell with a chevron button and panel content.

### 3A — Panel Shell

```svelte
<div class="clone-panel">
  <button class="panel-header" onclick={() => clonePanelOpen = !clonePanelOpen}>
    <img src={clonePanelOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'} alt="" />
    <span>Clone your voice</span>
  </button>
  {#if clonePanelOpen}
    <div class="panel-content">
      <!-- panel content -->
    </div>
  {/if}
</div>
```

### 3B — Panel States

The panel has three logical states driven by reactive variables:

```typescript
let voiceName = '';         // max 15 chars
let country = '';
let audioBlob: Blob | null = null;     // recorded or uploaded audio
let audioBase64: string = '';
let recordingState: 'idle' | 'countdown' | 'recording' | 'done' = 'idle';
let recordingSeconds = 0;
let isProcessing = false;
let processingMessage = '';
let intervalId: number;
```

### 3C — Initial State (idle, no audio)

```
┌─────────────────────────────────────────────────────┐
│  [Read first ℹ]                                      │
│  [Voice name ____________] (max 15 chars)            │
│  [Country   ____________]                            │
│  [🎤 Record]  [↑ Upload MP3/WAV]  [📋 Import ID]    │
│  [░░░░░░░░░░░░░░░░ Speak clearly for 10–20s  0s]    │  ← inactive
│                                    [Delete audio]    │  ← inactive
│  [      Create voice clone      ]                   │  ← inactive, full-width purple
└─────────────────────────────────────────────────────┘
```

**Styling rules:**
- "Read first" button: small, ghost style, `--font-size-sm`, ℹ icon = white text in dark grey `--radius-round` circle (24×24px)
- Voice name + Country: standard text inputs, `--radius-sm`, `--color-border`
- Three-button row: equal-width flex, `--radius-md`, outlined style (not filled)
- Progress bar frame: `border: 1px solid var(--color-border)`, `--radius-sm`, height 40px, mic icon left, timer text right
- Delete audio + Create voice clone: `--text-secondary` when inactive (no pointer events)
- Create voice clone: full-width, `background: var(--color-primary)` when active, greyed when inactive

### 3D — Recording State

**After tapping 🎤 Record:**

1. Countdown in the mic icon area: `3` → `2` → `1` (1s each, using `setTimeout`)
2. After countdown: start `MediaRecorder` via existing `src/lib/utils/recording.ts`
3. Icon switches to stop square (`icon-square-new.svg`)
4. Progress bar activates:
   - Start interval: increment `recordingSeconds` every 1s
   - 0–9s: progress bar fill = `#FFCCCC` (light red)
   - 10–20s: progress bar fill = `#CCFFCC` (light green)
   - Placeholder text hidden; timer shown as `{recordingSeconds}s` at right
   - At 20s: auto-stop recording

**Stop button tapped:**
- If `recordingSeconds < 10`: reset everything to idle. Show brief error message below progress bar: *"Too short. Your recording must be over 10 seconds."* (use `--color-error` or red text, auto-clear after 3s)
- If `recordingSeconds >= 10`: stop recording, save blob, switch icon to ▶ Play. Progress bar persists with final colour. Delete audio and Create voice clone become active.

**Play/Stop review:**
- Tap ▶: play the recorded audio via `new Audio(URL.createObjectURL(audioBlob))`
- Icon switches to ⏹ Stop while playing
- Tap ⏹ or audio ends: icon returns to ▶

**Delete audio tapped (when active):**
- Reset: clear `audioBlob`, `audioBase64`, `recordingSeconds`, `recordingState = 'idle'`
- Progress bar returns to empty with placeholder text
- Mic icon returns to 🎤
- Delete audio + Create voice clone return to inactive

### 3E — Upload Flow

**Tap ↑ Upload MP3/WAV:**
- Trigger `<input type="file" accept=".mp3,.wav" style="display:none">` via `input.click()`
- On file selected:
   - Read file duration using `AudioContext.decodeAudioData`
   - If duration < 10s: show error *"Too short. Your recording must be over 10 seconds."* Do not load file.
   - If duration > 20s: show warning *"Recording over 20s — only the first 20s will be used."* Load file.
   - If 10–20s: load file silently
   - Set `audioBlob` to file, `recordingSeconds` to Math.round(duration)
   - Show progress bar filled to correct proportion + final colour (green for 10–20s, warning amber for >20s)
   - ▶ Play icon active. Delete audio + Create voice clone active.

### 3F — Import ID Flow

**Tap 📋 Import ID:**
- Trigger `<input type="file" accept=".json" style="display:none">` via `input.click()`
- Parse JSON: `{ voiceName, country, cloneId }`
- Validate: all three fields present, `cloneId` is a non-empty string
- On valid:
   - Show processing spinner with message *"Generating preview..."*
   - Call `/api/tts` with `{ provider: 'qwen', voiceName: cloneId, text: CLONE_PREVIEW_SCRIPT }`
   - On response: transcode WAV to MP3 via `/api/audio/silence-removal` (see 3G step 2b)
   - Save `CustomVoice` to `customVoices` store
   - Panel updates to show completed voice row
- On invalid JSON: show error *"Invalid clone file. Please use an exported clone file."*

**Note:** Import skips the recording/upload UI entirely. Name and country come from the JSON file.

### 3G — Processing State

**After Create voice clone tapped:**

```
  ⏳ Analysing recording...    (immediate)
  ⏳ Building voice clone...   (after 3s)
```

- Disable all buttons
- Show spinner (copy from existing TTS spinner component)
- Sequential API calls:
   1. POST `/api/tts/clone` → get `cloneId` (show "Analysing recording...")
   2. After 3s switch message to "Building voice clone..."
   3. POST `/api/tts` with `{ provider: 'qwen', voiceName: cloneId, text: CLONE_PREVIEW_SCRIPT }` → get `previewAudio` (base64 WAV)
   4. **NEW STEP 2b:** Transcode WAV to MP3 via POST `/api/audio/silence-removal` with `{ base64Audio: previewAudio, level: 'default' }` → get MP3 base64
   5. Save to `customVoices` store with MP3 audio (not WAV)
- On success: save to `customVoices` store, reset recording UI, show completed voice row
- On any error: show inline error message, re-enable buttons so user can retry

**Storage impact:** MP3 preview (~60–120KB per voice) vs WAV (~480KB–960KB per voice). 4 voices = ~240–480KB with MP3 vs ~2–4MB with WAV. MP3 stays well within localStorage limits.

### 3H — Completed Voice Row

Appears below the Create button after successful cloning:

```
[Amara (Ghana)]  [▶ preview]  [⬇ export]  [🗑 delete]
```

- Voice name + country in one label: `{voice.name} ({voice.country})`
- ▶ Speaker icon: plays `voice.previewAudio` (base64 MP3) via `new Audio()`
- ⬇ Download icon: triggers Export modal (see 3I)
- 🗑 Trash icon: triggers Delete modal (see 3J)

If multiple clones exist, each has its own row. Rows appear in reverse chronological order (newest first).

### 3I — Export Modal

Triggered by ⬇ icon:

```
┌──────────────────────────────┐
│  Export your voice clone ID? │
│                              │
│  [Cancel]        [Export]    │
└──────────────────────────────┘
```

On Export: generate and download `{voicename-lowercase}-voice-clone.json`:

```json
{
  "voiceName": "Amara",
  "country": "Ghana",
  "cloneId": "qwen-vc-xxxxxxxxxxxx"
}
```

Use `URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))` and trigger download via `<a download>` click.

### 3J — Delete Modal

Triggered by 🗑 icon:

```
┌──────────────────────────────┐
│  Delete your cloned voice?   │
│                              │
│  [Cancel]        [Delete]    │
└──────────────────────────────┘
```

On Delete:
1. Call `DELETE /api/tts/clone` with `{ cloneId: voice.id }` (best-effort — don't block on failure)
2. Remove voice from `customVoices` store
3. If this voice is currently selected in the TTS dropdown: reset selected voice to first available voice
4. Row disappears from panel; voice disappears from dropdown

### 3K — Four-Clone Limit Modal

When `$customVoices.length >= 4` and user taps Create voice clone (if somehow still active) OR taps Record/Upload when already at limit — show modal:

```
┌─────────────────────────────────────────────────────────────┐
│  You have reached your limit of four active clones.         │
│  Delete one and try again. Export to save a clone.          │
│                                                             │
│  [Cancel]                                    [Got it]       │
└─────────────────────────────────────────────────────────────┘
```

**UI behaviour at 4 clones:** Record, Upload, Import ID buttons remain visible but tapping any of them triggers the limit modal rather than their normal action. The progress bar and Create button remain inactive/hidden.

### 3L — Read First Modal

Triggered by ℹ button:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  • Record 10–20 seconds of clean, fluent audio,     │
│    with no background noise or echo.                │
│                                                      │
│  • Each Clone ID is stored on your device and may   │
│    be lost if you delete your device cache.          │
│    Export if you wish to save or import the clone    │
│    to another device.                                │
│                                                      │
│  • Cloned voices appear with a ★ in the             │
│    dropdown list.                                    │
│                                                      │
│                                          [Got it]   │
└──────────────────────────────────────────────────────┘
```

Use existing modal pattern from the app (check `SpeedBlockModal.svelte` as reference).

**Checkpoint 3:** Render `VoiceClonePanel` in isolation (temporarily mount on main page). Confirm:
- All three button states (idle / recording / complete) render correctly
- Progress bar colour changes at 10s
- Auto-stop at 20s works
- Under-10s reset triggers error message
- Upload validation works for short/long files
- All modals open and close
- Export downloads a valid `.json` file

---

## Phase 4 — VoiceDropdown Integration

**File:** `src/lib/components/VoiceDropdown.svelte`

The dropdown is a pure, prop-driven component. **Do not import the store inside it.** Instead, merge custom voices into the `voices` prop at the call site.

### 4A — No changes to VoiceDropdown.svelte itself

The component already works with any `VoiceOption[]` array. Custom voices will be passed in as part of that array.

### 4B — Integration at call sites

In `src/routes/+page.svelte` (TTS tab) and `src/lib/components/bulletin/BulletinStoryDrawer.svelte` (bulletin tab):

```typescript
import { customVoices, customVoiceToVoiceOption, ALL_VOICES } from '$lib/stores';

// Merge custom voices into the dropdown list
$: voicesForDropdown = [
  ...$customVoices.map(customVoiceToVoiceOption),
  ...ALL_VOICES
];
```

Then pass `voicesForDropdown` to the `VoiceDropdown` component:

```svelte
<VoiceDropdown
  label="Select voice"
  voices={voicesForDropdown}
  value={selectedVoice}
  onchange={handleVoiceChange}
/>
```

### 4C — Star styling

The `VoiceDropdown` already renders a flag emoji for each voice. For custom voices, the `displayName` will be the user-friendly name (e.g., "Amara"), and the flag will be empty (since `customVoiceToVoiceOption` doesn't set a flag). To add the purple star, modify the flag logic in `VoiceDropdown.svelte`:

```typescript
function getFlagForVoice(voice: VoiceOption): string {
  if (voice.provider === 'qwen' && voice.description.includes('Custom')) {
    return '★'; // Purple star for custom clones
  }
  // ... existing logic
}
```

And add CSS:

```css
.flag {
  color: var(--color-primary); /* #5422b0 purple */
  font-size: 1rem;
  width: 24px;
  text-align: center;
}
```

### 4D — Preview playback

For custom voices, the preview audio is stored as base64 MP3 (not WAV). The existing preview logic in `VoiceDropdown.svelte` loads from `/voices/` static files. For custom voices, decode the base64 and play directly:

```typescript
function playPreview(event: MouseEvent, voice: VoiceOption) {
  event.stopPropagation();
  
  if (playingVoice === voice.name) {
    stopPreview();
    return;
  }

  stopPreview();
  playingVoice = voice.name;

  // Check if this is a custom voice
  const customVoice = $customVoices.find(v => v.id === voice.name);
  if (customVoice) {
    // Decode base64 MP3 and play
    const audio = new Audio();
    const bytes = atob(customVoice.previewAudio);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: 'audio/mp3' });
    audio.src = URL.createObjectURL(blob);
    audio.onended = () => { playingVoice = null; };
    audio.onerror = () => { console.error('Preview error'); playingVoice = null; };
    audio.play();
    audioElement = audio;
  } else {
    // Existing logic for built-in voices
    const previewUrl = getPreviewFilename(voice);
    audioElement = new Audio(previewUrl);
    audioElement.onended = () => { playingVoice = null; };
    audioElement.onerror = () => { console.error('Preview error:', previewUrl); playingVoice = null; };
    audioElement.play();
  }
}
```

### 4E — Voice selection plumbing

When a custom voice is selected, the existing TTS call in `+page.svelte` must pass:
```json
{ "provider": "qwen", "voiceName": "<cloneId>" }
```

The existing `handleQwen()` in `src/routes/api/tts/+server.ts` requires no changes — it already accepts any voice ID string. Ensure the voice selection state tracks both `voiceId` and `provider` for custom voices.

### 4F — Deletion sync

When a custom voice is deleted from `VoiceClonePanel`, if `selectedVoice === voice.id`, reset to the first built-in Qwen voice (e.g. Chisomo). Subscribe to `customVoices` in `VoiceDropdown` or handle reset in the delete handler in `VoiceClonePanel`.

**Bulletin tab note:** The voice dropdown also appears in the Bulletin tab (`BulletinAdjustVoiceCard.svelte` and `BulletinStoryDrawer.svelte`). Since both use the merged `voicesForDropdown` approach and `customVoices` is a shared store, cloned voices will automatically appear there too. Per agreed spec, this is acceptable — the Clone panel itself only appears in the TTS tab.

**Checkpoint 4:** 
- Clone a voice (or manually insert a test entry into localStorage)
- Confirm it appears at top of dropdown with purple ★
- Confirm preview plays instantly
- Confirm selecting it and generating TTS works
- Confirm deleting it removes it from dropdown

---

## Phase 5 — Mount in TTS Page

**File:** `src/routes/+page.svelte`

1. Import `VoiceClonePanel`:
```typescript
import VoiceClonePanel from '$lib/components/VoiceClonePanel.svelte';
```

2. Find the "Adjust audio" button/panel in the TTS tab. Mount `VoiceClonePanel` directly below it:
```svelte
<VoiceClonePanel />
```

3. Confirm `VoiceClonePanel` only renders when the TTS tab is active (it should be inside the TTS tab conditional already by placement).

**Checkpoint 5:**
- Full end-to-end test on mobile (Chrome Android):
   - Record 12s of voice
   - Name it, add country
   - Tap Create voice clone
   - Confirm processing messages appear in sequence
   - Confirm voice row appears with name/country/preview/export/delete icons
   - Confirm voice appears at top of TTS dropdown with ★
   - Generate TTS using cloned voice
   - Export `.json` file
   - Delete voice, confirm dropdown clears

---

## Phase 6 — AGENTS.md Update

Add a new section to `AGENTS.md` after the Qwen3-TTS section:

```markdown
### User Voice Cloning

- **Max clones:** 4 (enforced in UI and stored in localStorage)
- **Storage:** `localStorage` key: `audioflam_custom_voices` (array of CustomVoice)
- **Clone registration:** POST `/api/tts/clone` → DashScope `qwen-voice-enrollment` model
- **Preview script:** `CLONE_PREVIEW_SCRIPT` constant in `src/lib/stores.ts`
- **Preview audio:** Generated at clone time, transcoded to MP3, stored as base64 in localStorage
- **Storage footprint:** ~240–480KB for 4 voices (MP3 format)
- **Dropdown position:** Top of voice list, above all built-in voices
- **Identifier:** Purple ★ (U+2605) in place of country flag
- **Export format:** JSON: `{ voiceName, country, cloneId }`
- **Filename:** `{voicename-lowercase}-voice-clone.json`
- **Import:** File picker → parse JSON → generate preview → transcode to MP3 → add to store
- **Recording duration:** 10–20s required. Auto-stops at 20s. Resets if under 10s.
- **Upload validation:** Reject < 10s. Warn (allow) > 20s.
- **Audio format:** MediaRecorder produces WebM/Opus (or MP4 on iOS), not WAV. Format field must reflect actual blob MIME type.
- **Key files:**
   - `src/lib/components/VoiceClonePanel.svelte` — Clone UI
   - `src/routes/api/tts/clone/+server.ts` — Registration + deletion API
   - `src/lib/stores.ts` — CustomVoice type, customVoices store, MAX_CUSTOM_VOICES, CLONE_PREVIEW_SCRIPT, customVoiceToVoiceOption()
```

---

## Implementation Order Summary

| Phase | What | Files | Checkpoint |
|-------|------|-------|------------|
| 1 | Data model + store | `stores.ts` | localStorage round-trip test |
| 2 | Clone registration API | `api/tts/clone/+server.ts` | REST client POST test |
| 3 | VoiceClonePanel component | `VoiceClonePanel.svelte` | Isolated render + all UI states |
| 4 | VoiceDropdown integration | `VoiceDropdown.svelte` + call sites | Clone in dropdown, TTS generates |
| 5 | Mount in TTS page | `+page.svelte` | Full mobile end-to-end |
| 6 | AGENTS.md update | `AGENTS.md` | — |

---

## Critical Rules for Agent

1. **Use existing patterns** — `SpeedBlockModal.svelte` for modal pattern, `recording.ts` for MediaRecorder. Build custom collapsible shell for panel (don't use `TogglePanel` — it has unwanted toggle switch).
2. **CSS variables only** — no hardcoded colours; use `var(--color-primary)`, `var(--color-border)`, etc.
3. **`cleanForTTS()` not needed for clone preview** — the preview script is clean; but apply it anyway for consistency if generating TTS via `handleQwen()`
4. **Never expose DashScope errors** to client — catch and return generic message
5. **`btoa()` not `Buffer`** — Cloudflare Pages compatibility
6. **Star is Unicode** — `★` (U+2605), colour `var(--color-primary)`, no SVG needed
7. **Preview audio plays instantly** — stored as base64 MP3 at clone time; no API call on playback
8. **Deletion is best-effort server-side** — localStorage is source of truth; don't block delete on API failure
9. **Bulletin tab gets clones for free** — shared store + merged voices prop; no extra wiring needed
10. **Test on mobile** — MediaRecorder behaviour differs between desktop and Android Chrome
11. **SSR guard required** — `localStorage` doesn't exist on server; wrap all access in `if (typeof window !== 'undefined')`
12. **Audio format field must be dynamic** — derive from actual blob MIME type, not hardcode `wav`
13. **Preview audio is MP3, not WAV** — transcode via `/api/audio/silence-removal` before storing to keep localStorage footprint small (~60–120KB per voice)
14. **VoiceDropdown is prop-driven** — merge custom voices at call sites, don't import store inside component

---

## DashScope API Reference

**Base URL (international):** `https://dashscope-intl.aliyuncs.com`  
**Auth:** `Authorization: Bearer ${QWEN_SPEECH_KEY}` (same key as existing Qwen TTS)  
**Clone registration endpoint:** `/api/v1/services/audio/tts/customization`  
**Model for registration:** `qwen-voice-enrollment`  
**Synthesis model:** `qwen3-tts-vc-2026-01-22` (already in use)  
**Audio data format:** `data:audio/{format};base64,{base64string}` (data URI in `audio.data` field; format must match actual blob MIME type)  
**Clone ID returned in:** `response.output.voice`

---

## Known Constraints & Decisions

**No noise reduction:** The app's silence removal pipeline only trims silent frames; it does not reduce background noise. The "Read first" modal instructs users to record in a quiet space. This is sufficient for training purposes.

**No separate API key:** Custom voice cloning uses the same `QWEN_SPEECH_KEY` as standard TTS synthesis. The DashScope API handles both enrollment and synthesis with a single credential. No additional API key or account setup required.

---

*Plan updated May 2026 post-review. All corrections applied. Ready for implementation.*
