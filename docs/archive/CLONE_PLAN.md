# Plan: Improve Qwen Voice Clone Reliability and Naturalness

**Objective:** Enhance the reliability and quality of Qwen voice clones by improving audio preprocessing, providing a transcript to the API, and refining user guidance.

---

## Context

This is a SvelteKit app (AudioFlam). Voice cloning uses Qwen's `qwen-voice-enrollment` API via DashScope.
Relevant files: [`src/lib/components/VoiceClonePanel.svelte`](src/lib/components/VoiceClonePanel.svelte), [`src/routes/api/tts/clone/+server.ts`](src/routes/api/tts/clone/+server.ts), [`src/lib/stores.ts`](src/lib/stores.ts).
The audio sent to enrollment is currently inconsistent in sample rate, has no loudness check, and the optional text/language transcript fields are never sent — all of which are documented to affect Qwen's accept/reject behavior and clone quality.

---

## Checkpoints

### Checkpoint 1 — Build a proper audio-prep utility

**Action:** Create `src/lib/utils/audioPrep.ts` (new file).
**Functionality:**
- Takes a `Blob` (any MIME type the recorder/upload produced) and an `AudioContext`-decodable buffer.
- Decodes it, downmixes to mono, resamples to 24000 Hz using `OfflineAudioContext`.
- Computes RMS loudness across the buffer. Returns a `{ ok, reason }` style verdict:
    - Reject if RMS is below a "too quiet" threshold.
    - Reject if peak sample amplitude is at/near 1.0 for a *sustained run* (e.g., 10+ consecutive samples at >= 0.99) indicating clipping.
- Appends ~0.5s of silence to the end of the buffer (fixes the phoneme-bleed-into-first-word artifact).
- Trims the audio to a maximum of 20 seconds.
- Re-encodes as 16-bit PCM WAV (reuse the existing `audioBufferToWav` logic from the panel, moved here).
- Exports one function, e.g., `prepareAudioForCloning(blob): Promise<{ blob: Blob, warnings: string[] }>`. This function should throw/return a clear reason on hard failure (too short after silence-trim, too quiet, clipping) so the UI can show a real message instead of a generic "something went wrong."

**✅ Check:**
- Review the new file. Confirm it has no dependency on Svelte (pure TS, testable in isolation).
- Confirm thresholds are named constants near the top (not magic numbers buried in logic) so they can be tuned later from real-world testing.

---

### Checkpoint 2 — Wire it into `VoiceClonePanel.svelte`

**Action:**
- Replace `normaliseAudioForCloning()` (which only fires for WebM and does no cleanup) with a call to `prepareAudioForCloning()` from Checkpoint 1. Apply it unconditionally to every recording/upload before it's sent — WebM, MP4, MP3, WAV, all of them.
- Surface the loudness/clipping verdict in the UI: if rejected, show a specific message ("Too quiet — move closer to the mic" / "Audio is clipping — move back slightly") instead of letting it hit the API and fail there.
- Remove the now-redundant `audioBufferToWav` duplicate if it's been moved into the shared util (or keep the panel importing it from there).

**✅ Check:**
- Record a deliberately quiet sample and a deliberately loud/clipped one. Confirm the UI catches both before calling `/api/tts/clone`, with a message that tells you what to do differently.

---

### Checkpoint 3 — Send the transcript to Qwen

**Action:**
- In [`VoiceClonePanel.svelte`](src/lib/components/VoiceClonePanel.svelte)'s `handleCreate()`, pass the `CLONE_RECORDING_SCRIPT` (from the amended Checkpoint 4) into the POST body to `/api/tts/clone`, as `text`.
- In [`clone/+server.ts`](src/routes/api/tts/clone/+server.ts), accept `text` from the request body, forward it as `input.text` to DashScope, and add `input.language: 'en'`.
- Drop the old "pass full codec string through" comment/logic in the server route — it's no longer needed once the client always sends clean WAV.

**✅ Check:**
- Create a clone with the panel and check server logs (or a temporary `console.log` of the outgoing DashScope payload) to confirm `text` and `language` are actually present in the request. This is the step most likely to silently not-fire if there's a typo in the field name, so verify it explicitly rather than assuming.

---

### Checkpoint 4 — Improve the recording script and guidance (Amended)

**Action:**
- Create a new constant, `CLONE_RECORDING_SCRIPT`, in [`src/lib/stores.ts`](src/lib/stores.ts). This script should be 10–15 seconds of natural, conversational speech with built-in pitch variation. Example:
    ```typescript
    export const CLONE_RECORDING_SCRIPT = "Good morning. Today we're looking at the latest developments across the region. There's been significant progress on the infrastructure project, and community leaders say they're cautiously optimistic about what comes next.";
    ```
- Update the UI in [`VoiceClonePanel.svelte`](src/lib/components/VoiceClonePanel.svelte) to display `CLONE_RECORDING_SCRIPT` prominently during the recording flow (e.g., in the `progress-placeholder` area or a dedicated instruction box), so the user reads it aloud.
- Update the "Quick start" modal copy in [`VoiceClonePanel.svelte`](src/lib/components/VoiceClonePanel.svelte) to tell the user to read the *displayed script* conversationally, as if explaining something to a colleague — not as a script read.
- **`CLONE_PREVIEW_SCRIPT` must remain unchanged.**

**✅ Check:**
- Read the new `CLONE_RECORDING_SCRIPT` aloud yourself — does it sound like something a trainee would say naturally, with at least one rise and one fall in it, without feeling performative?
- Verify that `CLONE_PREVIEW_SCRIPT` is not modified.
- Confirm the `CLONE_RECORDING_SCRIPT` is clearly visible and users are instructed to read it during the recording process.

---

### Checkpoint 5 — End-to-end test pass

**Action:**
- Record 5 clones under varied conditions:
    1. Quiet room, normal voice.
    2. Slightly noisy background.
    3. Deliberately too-quiet take (should now be caught client-side).
    4. Deliberately too-loud/clipped take (should now be caught client-side).
    5. A clean take read with natural intonation per the new `CLONE_RECORDING_SCRIPT`.
- For each successful clone, generate a TTS preview and listen for: word-gap stiltedness at the start of sentences, overall flatness versus the source recording, and clone latency (time from clicking "Create voice clone" to completion).
- Compare against your prior baseline — you should see fewer outright rejections, more consistent timing, and somewhat less stiltedness on case (5).

**✅ Check:**
- This is the real proof. If rejections and slow/variable timing drop noticeably, Checkpoints 1–3 worked. If naturalness improves somewhat but isn't fully solved, that matches expectations — the remaining flatness is the architectural zero-shot-cloning limit, not a bug.
