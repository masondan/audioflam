# Handoff: Migrate AudioFlam voice cloning off retiring Qwen models

## Context for Claude Code

You're working on AudioFlam, a mobile-first web app (SvelteKit 2 + Cloudflare Pages) used to train journalists. Full project context is in `AGENTS.md` at the project root — read it first if you haven't already.

Alibaba Cloud Model Studio is retiring two models AudioFlam depends on for voice cloning, effective **October 10, 2026**:

- `qwen-voice-enrollment` (used to register new voice clones)
- `qwen3-tts-vc-2026-01-22` (used for all voice-cloned speech synthesis)

We're migrating to the replacement model family recommended by Alibaba: **`qwen-audio-3.0-tts-flash`**, using the new unified **`voice-enrollment`** model for clone registration. This is a same-vendor migration (still Alibaba/Qwen), but it is not a drop-in swap — the API shape, audio upload method, and voice IDs all change.

**This plan was written from Alibaba's official documentation and a direct support response, but documentation can drift and the current codebase may have details not reflected in `AGENTS.md`. Before writing any code, complete Step 0.**

---

## Step 0: Verify this plan against the actual codebase (do this first)

Before implementing anything, check the following against the real code and report back any discrepancies before proceeding:

1. Open `src/routes/api/tts/clone/+server.ts` and confirm it currently calls `qwen-voice-enrollment` as described. Note the exact current request/response shape, including how the audio is passed (should be inline base64 per `AGENTS.md`).
2. Open `src/routes/api/tts/+server.ts` and find `handleQwen()`. Confirm it currently calls `qwen3-tts-vc-2026-01-22` and note the exact request/response shape.
3. Open `src/lib/utils/audioPrep.ts` and note exactly what it currently outputs (format, sample rate, encoding) so we know what changes, if any, are needed for the new model's audio requirements.
4. Open `src/lib/stores.ts` and confirm how the 6 existing built-in voices (Malawi: Chisomo, Mercy; Zimbabwe: Tawanda, Precious; Wales: Ffion, Owain) are defined, and confirm `MAX_CUSTOM_VOICES` and how it's enforced.
5. Check `wrangler.toml` (or equivalent Cloudflare config) for existing bindings, to see what's already configured before we add an R2 binding.
6. List the contents of `/static/voice-samples` and `/static/voice-transcripts` to confirm what source audio and transcripts exist for the 6 voices to be re-cloned.

**Report back a short summary of what you find before moving to Step 1.** If anything here contradicts this plan, flag it — don't silently adapt the plan without saying so.

---

## Background: what's changing and why

| | Old (retiring Oct 10, 2026) | New |
|---|---|---|
| Enrollment model | `qwen-voice-enrollment` | `voice-enrollment` |
| Synthesis model | `qwen3-tts-vc-2026-01-22` | `qwen-audio-3.0-tts-flash` |
| Audio upload method | Inline base64 data URI | Public URL (base64 not supported) |
| Enrollment cost | $0.01/voice | Free |
| Synthesis cost | $0.115/10K chars | Not yet confirmed — check current pricing during testing |
| Region | Singapore (`dashscope-intl.aliyuncs.com`) | Singapore (new endpoint, see below) |
| Existing voice IDs | — | **Do not carry over.** Must re-clone all voices under the new model. |

New enrollment endpoint (Singapore region):
```
POST https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/services/audio/tts/customization
```

New enrollment request body:
```json
{
  "model": "voice-enrollment",
  "input": {
    "action": "create_voice",
    "target_model": "qwen-audio-3.0-tts-flash",
    "prefix": "myvoice",
    "url": "https://your-public-audio-url.wav"
  }
}
```

New synthesis call uses the same `qwen-audio-3.0-tts-flash` model, with the returned `voice_id` from enrollment. Confirm the exact synthesis request/response shape from Alibaba's current docs during Step 2 — check whether it's still a simple HTTP POST (matching the current `handleQwen()` pattern) or requires the WebSocket-based SpeechSynthesizer approach shown in some SDK examples. If only WebSocket is available for this model, flag this immediately — it would be a bigger architectural change than expected and worth stopping to discuss before continuing.

Also confirm: whether `language_hints: ["en"]` should be passed on enrollment calls (recommended by Alibaba support for better English feature extraction — low effort, include it if the parameter exists).

---

## Step 1: Set up Cloudflare R2 for temporary audio hosting

The new enrollment API requires a **public URL** to the audio file, not inline base64. We need somewhere to briefly host the prepared WAV so Alibaba can fetch it.

1. In the Cloudflare dashboard (or via `wrangler`), create a new R2 bucket, e.g. `audioflam-voice-clone-temp`.
2. Add an R2 binding to `wrangler.toml` for this bucket.
3. Confirm whether the bucket needs public access enabled (via R2's public bucket URL feature) or whether a signed/presigned URL approach is preferable. Public bucket access is simpler; a presigned URL is more private since files aren't left publicly discoverable even briefly. Recommend the presigned URL approach if it's not significantly more complex to implement — flag which you chose and why.
4. This is on Cloudflare's free tier (10GB storage, 1M writes/month, 10M reads/month, zero egress fees, no time limit) — confirm no billing is enabled on the account that would incur charges, but expect none.

**Checkpoint 1 — test before continuing:**
Write and run a small standalone script (or a temporary test route) that uploads a sample WAV to the new R2 bucket, generates a URL, and confirms that URL is fetchable from outside your Cloudflare account (e.g. via `curl` from your terminal, not just from within a Worker). This proves the URL will actually be reachable by Alibaba's servers before we wire it into the real flow.

Report back: does the URL work? Public bucket or presigned URL? Any issues?

---

## Step 2: Update `/api/tts/clone/+server.ts` (enrollment)

1. Change the enrollment call to use the new endpoint, `voice-enrollment` model, and `qwen-audio-3.0-tts-flash` target model, per the request shape above.
2. Before calling the enrollment API, upload the prepared audio to R2 (from Step 1) and use the resulting URL in the `url` field.
3. After a successful enrollment response, delete the R2 object — it's only needed transiently for Alibaba to fetch it, no reason to keep it in the bucket afterward.
4. Add `language_hints: ["en"]` to the request if confirmed available (see Step 0/background note above).
5. Update the response handling to match whatever the new API actually returns (voice ID field name may differ from the old `output.voice` — check actual response and adjust parsing accordingly).
6. Check `src/lib/utils/audioPrep.ts` — confirm the WAV output already meets the new audio requirements (10-20s recommended, WAV/MP3/M4A, ≥16kHz, ≤10MB, mono or stereo). This is likely already compliant or close to it since it's similar to the old requirements, but verify rather than assume.

**Checkpoint 2 — test before continuing:**
Using the VoiceClonePanel UI (or a direct test call), enroll ONE test voice end-to-end: record/select audio → upload to R2 → call enrollment → confirm you get back a valid voice ID and no errors. Don't move to re-cloning all 6 production voices yet — prove the pipe works with one throwaway test voice first.

Report back: did enrollment succeed? What did the response look like? Any surprises versus what this plan expected?

---

## Step 3: Update `/api/tts/+server.ts` — `handleQwen()` (synthesis)

1. Update the synthesis call to use `qwen-audio-3.0-tts-flash` as the model, with the new voice ID format from Step 2.
2. Confirm the response format still matches what AudioFlam expects (`{ audioContent, format: 'wav' }` per `AGENTS.md`'s documented contract) — adjust if the new model returns something different (e.g. different default format, different field names).
3. Confirm `cleanForTTS()` (the existing text-cleaning utility) is still called before synthesis, unchanged — no reason this should need to change, but don't assume, confirm it's still wired in after your edits.

**Checkpoint 3 — test before continuing:**
Using the test voice ID from Checkpoint 2, generate actual speech via the two-speaker or main TTS panel. Play back the resulting audio. Confirm:
- Audio plays without errors
- It sounds like a reasonable voice clone (doesn't need to be perfect yet — just confirm the pipeline produces intelligible cloned speech)
- Format field and base64 decoding work correctly in the existing frontend code, unchanged

Report back: did synthesis succeed? How does it sound, roughly? Any errors in console?

---

## Step 4: Re-clone the 6 production voices

Once Checkpoints 1–3 pass, re-clone the real voices using their existing source audio.

1. Source audio is in `/static/voice-samples` (already confirmed present in Step 0).
2. Transcripts are being added to `/static/voice-transcripts` for all 6 voices (previously only Ffion and Owain had them; Dan is adding the remaining 4). If a transcript file exists for a given voice, check whether the new API accepts a transcript-type field and pass it through if so; if the field doesn't exist or a transcript is missing for a given voice, proceed without one — it is not a hard requirement.
3. Re-clone each of the 6 voices one at a time: Chisomo, Mercy (Malawi), Tawanda, Precious (Zimbabwe), Ffion, Owain (Wales).
4. Record the new voice IDs returned for each.
5. Update `src/lib/stores.ts` (or wherever the 6 built-in voice IDs are currently hardcoded) to use the new voice IDs in place of the old ones.

**Checkpoint 4 — test before continuing:**
Generate a short sample of speech from each of the 6 re-cloned voices (same test sentence for all 6, to make comparison easy). Listen to each. For any voice pairs where a transcript was available (Ffion, Owain) versus not, note whether there's an audible quality difference — this is useful data for deciding whether to bother with transcripts for future clones.

Report back: all 6 working? Any that sound noticeably worse than before? Any that failed to enroll or synthesize?

---

## Step 5: Quality comparison against the old voices

Before removing any old code, do a rough side-by-side quality check.

1. If old recordings/samples of the previous voices exist anywhere (exported audiograms, saved test clips, etc.), compare against the new output.
2. If not, this step is just a subjective listen: does the new `qwen-audio-3.0-tts-flash` output sound natural, clear, and usable for journalist training purposes? Flag anything that sounds notably worse (robotic, mispronounced, accent handling issues — especially for the Welsh and African-accented voices, which were a specific design goal per `AGENTS.md`).

Report back with an honest quality assessment — this doesn't block shipping if quality is broadly acceptable, but Dan needs to know now if something sounds meaningfully worse, not after the old model is retired and there's no fallback.

---

## Step 6: Clean up and finalize

1. Remove any now-dead code referencing `qwen-voice-enrollment` or `qwen3-tts-vc-2026-01-22`, unless there's value in keeping it commented for reference during a transition period — use your judgment, flag your choice.
2. Update `AGENTS.md` to reflect the new model names, endpoint, and R2 dependency, following the existing style/structure of that document (see its own instruction: "Update AGENTS.md whenever it changes significantly").
3. Update the environment variables section of `AGENTS.md` if any new env vars (R2 credentials, new endpoint config) were introduced.
4. Confirm `QWEN_SPEECH_KEY` (or whatever the existing env var is called) still works for the new endpoint, or whether a new API key/workspace ID is needed — flag if Dan needs to generate anything new in the Alibaba console.

**Checkpoint 5 — final test:**
Full end-to-end test: a user with no existing clones opens AudioFlam, records a new voice sample, enrolls it, generates speech with it, and it plays correctly. Then test the 6 production voices one more time in the actual app UI (not just via test scripts) to confirm everything works exactly as a real user would experience it.

Report back with a final summary: what changed, what's left to verify, and any open questions Dan should be aware of (e.g. unconfirmed pricing, anything that seemed off versus documentation).

---

## Known open items (not blockers, but worth tracking)

- Exact current pricing for `qwen-audio-3.0-tts-flash` synthesis wasn't confirmed in planning — worth checking the Alibaba console directly once live, to make sure costs are as expected.
- No confirmed rate limits on enrollment calls for burst usage (e.g. many journalists cloning voices simultaneously in a workshop) — unlikely to be an issue at AudioFlam's scale, but not something to assume without evidence if a large training session is ever planned.
- Whether `language_hints` meaningfully changes output quality is unverified — worth an informal before/after listen if time allows.

---

*Prepared by Claude (claude.ai) based on Alibaba Cloud Model Studio official documentation, retirement notices, and a direct support response, August 2026. Verify current details against live documentation and the actual codebase before implementing, per Step 0.*
