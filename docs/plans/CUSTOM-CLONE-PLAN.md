Good — I have everything I need. Here's the full implementation plan.

---

# AudioFlam Voice Cloning — Implementation Plan

## Overview

A journalist records or uploads a short voice sample, names it, assigns a country, and their voice appears in the main voice dropdown alongside Chisomo, Tawanda, and the others. Maximum 3 custom voices. Stored in localStorage. No backend persistence needed.

---

## Architecture

```
[New] VoiceCloneDrawer.svelte          ← UI (record/upload, name, country, preview)
[New] src/routes/api/tts/clone/+server.ts  ← Registers clone with Qwen DashScope
[Mod] src/lib/stores.ts                ← customVoices store + localStorage persistence
[Mod] src/lib/components/VoiceDropdown.svelte  ← Shows custom voices in same format
[Mod] src/routes/api/tts/+server.ts   ← handleQwen() already works; just needs dynamic clone ID
[Mod] src/routes/+page.svelte         ← Renders VoiceCloneDrawer, wires "My Voices" section
```

---

## Phase 1 — Data Model & Store

**File: `src/lib/stores.ts`** — add alongside existing voice definitions:

```typescript
export interface CustomVoice {
  id: string;                  // Qwen clone ID returned from DashScope
  name: string;                // e.g. "Amara"
  country: string;             // e.g. "Ghana"
  countryCode: string;         // e.g. "gh" (for flag emoji)
  gender: 'M' | 'F' | '?';
  previewAudio: string | null; // base64 WAV of the preview sentence
  createdAt: number;           // timestamp
}

// Max 3 clones
export const customVoices = writable<CustomVoice[]>(
  JSON.parse(localStorage.getItem('audioflam_custom_voices') ?? '[]')
);

customVoices.subscribe(val =>
  localStorage.setItem('audioflam_custom_voices', JSON.stringify(val))
);
```

Key points:
- `id` is the Qwen clone voice ID — passed to `handleQwen()` exactly like `qwen-tts-vc-malawi-voice-...`
- `previewAudio` is generated once at clone time using the placeholder script, stored as base64 — no re-generation needed on dropdown load
- 3-voice cap enforced in UI and API route

---

## Phase 2 — Clone Registration API

**New file: `src/routes/api/tts/clone/+server.ts`**

Two endpoints:

### `POST /api/tts/clone` — Register a new voice clone

```
Request:
{
  audioBase64: string,   // MP3 or WAV, base64-encoded
  audioFormat: 'mp3' | 'wav',
  voiceName: string      // for logging only; ID comes back from Qwen
}

Response:
{
  cloneId: string        // Qwen-assigned voice clone ID
}
```

Calls DashScope voice clone registration API (same auth as existing `QWEN_SPEECH_KEY`). Check Alibaba's DashScope docs for the exact registration endpoint — it's separate from synthesis but uses the same Bearer token.

### `DELETE /api/tts/clone` — Delete a clone from Qwen

```
Request: { cloneId: string }
Response: { success: boolean }
```

Calls DashScope clone deletion endpoint. If DashScope doesn't offer deletion (check docs), skip this and just remove from localStorage — the clone may persist server-side but that's acceptable at this scale.

---

## Phase 3 — Clone Registration UI

**New file: `src/lib/components/VoiceCloneDrawer.svelte`**

A collapsible drawer/panel (use existing `TogglePanel.svelte` pattern) on the TTS page. Three states:

### State A — Slot available (fewer than 3 clones)

```
┌─────────────────────────────────────────────┐
│  🎙 Clone Your Voice                    [▾] │
├─────────────────────────────────────────────┤
│                                             │
│  [ Record ]  or  [ Upload MP3/WAV ]         │
│  30–60 seconds of clear speech              │
│                                             │
│  Voice name:  [____________]                │
│  Country:     [🌍 Select country ▾]         │
│  Gender:      [ M ]  [ F ]  [ ? ]          │
│                                             │
│  [ Create my voice ]   ← disabled until    │
│                          audio + name set  │
└─────────────────────────────────────────────┘
```

On **Record:** use existing `recording.ts` MediaRecorder wrapper — same as audiogram recording. Show waveform or simple timer. Stop recording saves as base64 WAV.

On **Upload:** `<input type="file" accept=".mp3,.wav">` — read as base64.

**Import clone ID** — a small secondary link: `Already have a clone ID? Import →` opens a simple text input. This lets journalists bring a clone from another session or device. Paste ID → enter name/country → saves directly to localStorage without hitting the API.

Country dropdown: curated list of ~25 African countries + UK + US + Other, with ISO country codes for flag emoji rendering (🇳🇬 = `\u{1F1F3}\u{1F1EC}` etc.).

### State B — Processing (after "Create my voice" tapped)

```
  ⏳ Registering your voice with Qwen...
  ⏳ Generating preview...
```

Two sequential API calls:
1. `POST /api/tts/clone` → get `cloneId`
2. `POST /api/tts` with `provider: 'qwen'`, `voiceName: cloneId`, text = placeholder script → get `previewAudio`

Both results saved to `customVoices` store.

### State C — Clone exists

Shows the voice card(s) and a "+ Add another voice" button (if < 3).

---

## Phase 4 — VoiceDropdown Integration

**File: `src/lib/components/VoiceDropdown.svelte`** — add a "My Voices" section above or below the existing provider groups.

Each custom voice renders in the same row format as built-in voices:

```
[🇬🇭] Amara · Ghana          [▶]
[🇰🇪] Kamau · Kenya          [▶]
```

- Flag: rendered from `countryCode` using Unicode flag emoji
- Name + Country: same typography as existing voices (`--font-size-sm`, `--text-secondary` for country)
- **Preview speaker icon [▶]**: plays `voice.previewAudio` (stored base64) directly — no API call needed. This is the key UX win — instant preview because audio was generated at clone time.

When selected, the voice is identified as `provider: 'qwen'` with `voiceName: voice.id` — `handleQwen()` needs no changes, it already accepts any clone ID.

---

## Phase 5 — Delete & Export

### Delete button

In the VoiceCloneDrawer, each existing voice card shows:

```
[🇬🇭] Amara · Ghana    [Export ID]  [🗑 Delete]
```

Clicking Delete opens a minimal inline confirm:

```
Delete "Amara"?    [Cancel]  [Delete]
```

On confirm:
1. Call `DELETE /api/tts/clone` with `cloneId` (best-effort — don't block if it fails)
2. Remove from `customVoices` store → localStorage auto-updates
3. If this voice was selected in the TTS panel, revert to first available voice

### Export clone ID

**Export ID** button copies the `cloneId` string to clipboard (or shows it in a small modal for manual copy). Accompanying text: *"Save this to restore your voice on another device."* No file needed — it's just a string.

---

## Phase 6 — TTS Page Export (Audiogram)

No changes needed. When a custom voice is selected and TTS is generated, `handleQwen()` returns base64 WAV exactly as it does for Chisomo/Tawanda. The existing export pipeline in `AudiogramPage.svelte` handles it identically — it just sees a WAV audio blob.

**One thing to verify:** the existing `format: 'wav'` response from `handleQwen()` is already decoded correctly in `+page.svelte:554-560`. It should be — but worth a check since Qwen returns WAV and the audiogram export may assume MP3 in one or two places.

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | `CustomVoice` type + store + localStorage | `stores.ts` |
| 2 | Clone registration API route | `api/tts/clone/+server.ts` |
| 3 | `VoiceCloneDrawer.svelte` — record/upload/name/country | new component |
| 4 | Wire preview generation after clone registration | `VoiceCloneDrawer.svelte` |
| 5 | Custom voices section in `VoiceDropdown.svelte` | `VoiceDropdown.svelte` |
| 6 | Delete flow (UI modal + API call) | `VoiceCloneDrawer.svelte` |
| 7 | Import clone ID flow | `VoiceCloneDrawer.svelte` |
| 8 | Export clone ID (copy to clipboard) | `VoiceCloneDrawer.svelte` |
| 9 | Verify WAV format flows cleanly into audiogram export | `+page.svelte` |
| 10 | Update AGENTS.md with new section | `AGENTS.md` |

---

## Key Design Decisions

**Why store preview audio at clone time, not on demand?** Because generating a preview requires a 5–10s API call. Doing it once at registration and caching as base64 means the dropdown speaker icon plays instantly — no spinner, no wait. The placeholder script is short (~80 chars) so the stored audio is tiny.

**Why localStorage and not a server store?** Consistent with your no-auth, educational design. Each journalist's clone lives in their browser. The Import clone ID feature is the escape hatch when they switch devices. It fits your "simple, single-purpose tool" rule from the Critical Rules section.

**Why cap at 3?** Keeps the dropdown clean, limits accidental API cost accumulation, and gives journalists a clear creative constraint — pick your best voice.