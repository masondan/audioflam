# Handoff 2: Verified API details + implementation (Steps 1–6)

## Context

This continues the AudioFlam Qwen voice-cloning migration. You (Claude Code) completed Step 0 and raised several questions you couldn't resolve without web access. I've had those verified directly against Alibaba's official documentation. All five of Dan's decisions from the last round are confirmed — proceed on that basis. Below is what's now confirmed, what changed from the original plan, and the implementation steps.

---

## Answers to your Step 0 open questions (verified against Alibaba docs)

**1. Endpoint/Workspace ID — good news, no new credentials needed.**
The existing domain `dashscope-intl.aliyuncs.com` **remains fully functional** — it is not being retired or replaced. The workspace-specific subdomain (`{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`) is an optional, higher-performance alternative Alibaba recommends but does not require. **Decision: keep using `dashscope-intl.aliyuncs.com` for both enrollment and synthesis.** Same host as today, same `QWEN_SPEECH_KEY`, no console work needed, no new Workspace ID to source. This removes the biggest unknown from the last round — do not implement the workspace-subdomain approach, it adds complexity with zero benefit for AudioFlam's usage volume.

**2. `language_hints` — confirmed real, is a language code, not a transcript.**
Safe to include as `"language_hints": ["en"]` in enrollment requests. It is not a transcript field — no relationship to the `/static/voice-transcripts` files. Include it; low effort, no downside.

**3. HTTP vs. WebSocket for synthesis — confirmed HTTP works, one detail to carry over from your existing code.**
Alibaba's own model-naming convention confirms it directly: models **without** a `-realtime` suffix use HTTP, models **with** `-realtime` use WebSocket. Your target model is `qwen-audio-3.0-tts-flash` — no `-realtime` suffix — so **HTTP is fully supported.** Your existing `handleQwen()` architecture does not need to become a WebSocket client.

One detail to carry forward from your own Step 0 finding: in non-streaming HTTP mode, the synthesis response returns a `url` field pointing to the generated audio (valid 24 hours), not inline audio data. This is the **same pattern your current code already handles** — you noted this yourself in Finding #2 (today's `handleQwen()` already downloads `output.audio.url` and re-encodes to base64). No new logic needed here, just confirm the field name in the actual response and adjust if it differs from today's `output.audio.url`.

**4. Voice ID format — one thing to verify empirically, not assume.**
Enrolled voices under the new model follow the pattern `qwen-audio-3.0-tts-flash-{prefix}-{suffix}`. Voices cannot be mixed across models — a voice enrolled against `target_model: "qwen-audio-3.0-tts-flash"` must be used with that exact model at synthesis time, or the API returns an `InvalidParameter` error. This should be automatic if you use the same `target_model` string in both calls, but confirm the actual voice ID returned by enrollment matches what synthesis expects, rather than assuming the format from documentation alone.

---

## Confirmed final decisions (from Dan, carried into this handoff)

1. **R2 setup:** dashboard-binding approach (not wrangler.toml). I'll walk Dan through this in the Cloudflare dashboard step by step at Step 1 below — screen by screen, not code.
2. **No new Workspace ID / API key needed** (see verified answer #1 above) — this decision point from last round is now resolved, no console work required.
3. **Migration strategy: hard cutover.** No dual old/new code paths. Delete old model references outright, don't comment them out. Rewrite `handleQwen()` and clone endpoint directly for the new model.
4. **No rollback path needed** — app is currently unused, acceptable to break things during the transition.
5. **Custom user clone JSON exports:** acceptable that these silently fail after Oct 10. No migration path needed for these.

---

## Step 1: Cloudflare R2 setup (dashboard walkthrough)

Since there's no existing `wrangler.toml` in this project (confirmed in your Step 0 findings) and the project is configured via the Cloudflare Pages dashboard, use the dashboard binding approach, not a config file.

**Claude Code:** you can't click through a dashboard — this step is primarily Dan's, with you providing the code changes that depend on it. Here's the sequence:

1. Tell Dan to go to the Cloudflare dashboard → R2 → Create bucket → name it `audioflam-voice-clone-temp`.
2. Tell Dan to go to the Pages project → Settings → Functions → R2 bucket bindings → Add binding, pointing a variable name (e.g. `VOICE_CLONE_BUCKET`) to the new bucket.
3. Once Dan confirms the binding exists, add the corresponding type declaration to `src/app.d.ts`:
   ```typescript
   declare global {
     namespace App {
       interface Platform {
         env: {
           VOICE_CLONE_BUCKET: R2Bucket;
           // ...existing env vars
         };
       }
     }
   }
   ```
4. Confirm whether the bucket needs public access enabled, or whether a presigned URL approach is cleaner. Recommend presigned URLs if not significantly more complex — this avoids leaving files publicly discoverable even briefly. Flag which approach you implement and why.

**Checkpoint 1:** Write a temporary test route that uploads a sample WAV to R2 via the binding, generates a URL, and confirms Dan can fetch that URL from a terminal `curl` command (not just from within the Worker) — proving it's genuinely publicly reachable, which is what Alibaba's servers will need. Report back before continuing.

---

## Step 2: Update `/api/tts/clone/+server.ts` (enrollment)

Based on your Step 0 finding — current code calls `qwen-voice-enrollment` at `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization` with `action: 'create'`, inline base64 audio, parsing `data.output.voice`.

New request shape (confirmed against official Alibaba documentation):

```json
POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization
{
  "model": "voice-enrollment",
  "input": {
    "action": "create_voice",
    "target_model": "qwen-audio-3.0-tts-flash",
    "prefix": "myvoice",
    "url": "https://your-public-audio-url.wav",
    "language_hints": ["en"]
  }
}
```

Changes from current code:
- Model: `qwen-voice-enrollment` → `voice-enrollment`
- Action: `"create"` → `"create_voice"`
- `preferred_name` → `prefix`
- Audio: inline base64 `data:...;base64,...` → hosted `url` (from Step 1's R2 upload)
- Add `language_hints: ["en"]`
- **Endpoint host stays the same** — `dashscope-intl.aliyuncs.com`, per the verified answer above. Do not change this to a workspace subdomain.

Sequence for the endpoint:
1. Receive audio from the frontend (as today).
2. Prepare audio via existing `audioPrep.ts` (confirmed in your Step 0 finding: already outputs 24kHz mono WAV, meets the new model's requirements, no changes needed there).
3. Upload prepared WAV to R2 (Step 1's bucket/binding), get a public/presigned URL.
4. Call the enrollment endpoint with that URL, per the shape above.
5. Parse the response for the voice ID — **check the actual field name in the response**; don't assume it's still `data.output.voice`, verify against what comes back.
6. Delete the R2 object once enrollment succeeds — it's only needed transiently.

**Checkpoint 2:** Enroll ONE test voice end-to-end through the real UI flow (VoiceClonePanel → record/select → upload to R2 → call enrollment → get back a voice ID). Don't touch the 6 production voices yet. Report back the exact response shape you got, and whether it matched this plan.

---

## Step 3: Update `/api/tts/+server.ts` — `handleQwen()` (synthesis)

Based on your Step 0 finding — current code calls `qwen3-tts-vc-2026-01-22` at `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`, receives `output.audio.url`, downloads and re-encodes as base64.

Changes:
- Model: `qwen3-tts-vc-2026-01-22` → `qwen-audio-3.0-tts-flash`
- Endpoint: **confirm whether the non-realtime HTTP synthesis endpoint is the same path** (`aigc/multimodal-generation/generation`) or different for this model family — this wasn't fully pinned down in verification and needs checking against the live API reference or a test call, not assumed.
- Voice parameter: use the voice ID returned from Step 2's enrollment (format like `qwen-audio-3.0-tts-flash-{prefix}-{suffix}`), passed as `voice` in the request.
- Response handling: confirmed the non-streaming HTTP response returns a `url` field (valid 24h) pointing to synthesized audio — this is the same "fetch-then-store" pattern your current code already implements for `output.audio.url`. Confirm the exact field name in the actual response and adjust if needed, but the download-and-reencode logic itself shouldn't need restructuring.
- Confirm `cleanForTTS()` is still called before synthesis, unchanged.

**Checkpoint 3:** Using the test voice ID from Checkpoint 2, generate real speech through the actual TTS panel UI. Confirm it plays correctly, sounds like a reasonable clone, and the response format still matches AudioFlam's `{ audioContent, format: 'wav' }` contract. Report back, including any surprises in the actual API response versus what this plan expected.

---

## Step 4: Re-clone the 6 production voices

Source audio confirmed present in `/static/voice-samples`. Transcripts confirmed present for all 6 in `/static/voice-transcripts` (Dan has completed this — the earlier plan's assumption that only 2 of 6 had transcripts was outdated).

1. Re-clone each of the 6 voices (Chisomo, Mercy, Tawanda, Precious, Ffion, Owain) one at a time via the now-working Step 2 flow.
2. If the enrollment API accepts a transcript-type parameter, pass the corresponding transcript file through for each voice (all 6 now have one available). If no such parameter exists in the confirmed request shape, this is moot — proceed without it.
3. Record the new voice IDs.
4. Update `src/lib/stores.ts` (`QWEN_VOICES` and `QWEN_WELSH_VOICES` arrays, confirmed in your Step 0 finding) — replace old hardcoded voice IDs with the new ones.

**Checkpoint 4:** Generate the same test sentence in all 6 re-cloned voices. Listen to each. Report back: all 6 working? Any that sound notably different from before?

---

## Step 5: Quality comparison

Rough side-by-side listen — new output vs. any old saved samples/exports if they exist, or just a subjective quality check against AudioFlam's design goals (natural-sounding African and Welsh-accented voices per `AGENTS.md`). Report an honest assessment — flag anything that sounds meaningfully worse, don't just confirm it "works."

---

## Step 6: Clean up and finalize

1. Remove dead code referencing `qwen-voice-enrollment` and `qwen3-tts-vc-2026-01-22` outright — per Dan's hard-cutover decision, don't comment out, delete.
2. Update `AGENTS.md`: new model names, endpoint (confirm it's unchanged — still `dashscope-intl.aliyuncs.com`), R2 dependency and bucket name, updated voice IDs, updated pricing figures if confirmed during testing.
3. Confirm `QWEN_SPEECH_KEY` works unchanged against the new model calls (should be the case per verified answer #1 — same host, same key) — flag immediately if it doesn't, since that would contradict what's been verified and needs fresh investigation.

**Checkpoint 5 (final):** Full end-to-end test in the real app UI — new user records and enrolls a fresh voice, generates speech, plays correctly. Then re-test all 6 production voices in the actual UI (not test scripts). Report a final summary: what changed, what's left open, any figures (pricing, quality) Dan should independently verify in the Alibaba console.

---

## Still open / not blockers, but flag if encountered

- Exact current billing for `qwen-audio-3.0-tts-flash` synthesis and `voice-enrollment` enrollment — check the Alibaba console directly once live calls are working, rather than relying on the retirement notice's stated figures, in case pricing has shifted since.
- The exact synthesis endpoint path for `qwen-audio-3.0-tts-flash` in non-streaming HTTP mode wasn't 100% pinned to a specific URL during verification — if Step 3 turns up a different path than `aigc/multimodal-generation/generation`, that's expected and fine, just note it in your report so `AGENTS.md` gets the accurate value.

---

*This handoff incorporates verified findings from Alibaba Cloud Model Studio's official documentation (voice cloning HTTP API reference, non-real-time speech synthesis guide, speech synthesis model comparison), cross-checked against Claude Code's Step 0 codebase findings, August 2026.*
