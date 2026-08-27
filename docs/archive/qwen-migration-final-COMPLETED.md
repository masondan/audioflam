# Qwen TTS Voice Cloning Migration Plan (Final)

**Status:** Ready for implementation  
**Deadline:** October 10, 2026 (cutoff date for old models)  
**Hard Cutover:** Yes — delete old code paths, no dual support  
**Verified By:** Direct API documentation + Qwen AI agent confirmation  
**Last Updated:** August 18, 2026

---

## Executive Summary

AudioFlam's Qwen voice cloning system must migrate from retiring models (`qwen-voice-enrollment` + `qwen3-tts-vc-2026-01-22`) to new models (`voice-enrollment` + `qwen-audio-3.0-tts-flash`) before October 10, 2026.

**Key Changes:**
- Voice enrollment uses HTTP API (unchanged endpoint, new model + request shape)
- TTS synthesis moves from HTTP to **WebSocket-based** (breaking change)
- Audio files hosted on Cloudflare R2 instead of inline base64 (enrollment only)
- All 6 existing custom voices must be re-cloned under new model
- Existing `QWEN_SPEECH_KEY` remains valid (no new key needed)
- No workspace ID needed (use existing `dashscope-intl.aliyuncs.com` endpoint)

**Implementation Time:** ~4–6 hours (including voice re-cloning)

---

## Section 1: Verified API Changes

### Voice Enrollment (HTTP)

**Endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice/enrollments`  
**Method:** POST  
**Auth:** Bearer token via `Authorization` header (existing `QWEN_SPEECH_KEY`)

**Old Model (retiring):**
```json
{
  "model": "qwen-voice-enrollment",
  "input": {
    "action": "create",
    "target_model": "qwen3-tts-vc-2026-01-22",
    "audio_base64": "<base64-encoded WAV>",
    "language_hints": ["en"]
  }
}
```

**Response:** `{ "output": { "voice": "voice-id-string" } }`

---

**New Model (target):**
```json
{
  "model": "voice-enrollment",
  "input": {
    "action": "create_voice",
    "target_model": "qwen-audio-3.0-tts-flash",
    "prefix": "chisomo",
    "url": "https://r2-bucket-url/chisomo.wav",
    "language_hints": ["en"]
  }
}
```

**Response:** `{ "output": { "voice_id": "voice-id-string" } }`

**Breaking Changes in Request:**
| Old | New | Impact |
|-----|-----|--------|
| `action: "create"` | `action: "create_voice"` | Must update action name |
| `audio_base64` (inline) | `url` (public URL) | Must upload to R2 first |
| Response: `voice` | Response: `voice_id` | Must parse new field |
| No `prefix` | `prefix` required | Must derive from voice name |

---

### TTS Synthesis (WebSocket)

**Endpoint:** `wss://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice-api/text-to-speech`  
**Protocol:** WebSocket (persistent connection, event-driven)  
**Auth:** Bearer token via query param `?token=<QWEN_SPEECH_KEY>`

**Interaction Workflow:**

1. **Client sends task initiation:**
```json
{
  "task_id": "<unique-uuid>",
  "task_type": "run_task",
  "model": "qwen-audio-3.0-tts-flash",
  "input": {
    "text": "Hello world",
    "voice_id": "<cloned-voice-id>",
    "sample_rate": 24000,
    "volume": 100
  }
}
```

2. **Server responds with task started:**
```json
{
  "event": "task-started"
}
```

3. **Client sends continuation:**
```json
{
  "task_id": "<same-uuid>",
  "task_type": "continue_task"
}
```

4. **Server sends result chunks** (streaming audio):
```json
{
  "event": "result-generated",
  "output": {
    "status": "ongoing" | "done",
    "audio": {
      "data": "<base64-chunk>"
    }
  }
}
```

5. **Server sends task completion:**
```json
{
  "event": "task-finished",
  "status_code": 200
}
```

**Old HTTP Flow (retiring):**
```
POST /api/v1/services/aigc/multimodal-generation/generation
→ Receive `output.audio.url` (MP3 file on server)
→ Download and transcode to base64
→ Return audio to client
```

**New WebSocket Flow (target):**
```
Connect wss://...?token=<key>
→ Send JSON task_id + text + voice_id
→ Receive streaming audio chunks
→ Accumulate into single audio blob
→ Return to client
```

**Critical Difference:** Old flow gives you a download URL; new flow streams audio chunks directly.

---

## Section 2: Pre-Implementation Verification

### ✅ Current State (confirmed)

| Item | Status | Evidence |
|------|--------|----------|
| `QWEN_SPEECH_KEY` valid for new models | ✅ Confirmed | Existing key works with both old + new models |
| Workspace ID needed | ❌ Not needed | Keep using `dashscope-intl.aliyuncs.com` (old endpoint remains active) |
| Audio prep compatible with new model | ✅ Compatible | Output is 24kHz mono 16-bit WAV; meets `qwen-audio-3.0-tts-flash` requirements (no changes needed to `src/lib/utils/audioPrep.ts`) |
| R2 bucket available | ⚠️ Pending | Requires dashboard setup (Step 1) |
| Old custom voice IDs usable with new model | ❌ Cannot reuse | Must re-enroll all 6 voices under new model |

---

## Section 3: Implementation Steps with Checkpoints

### Step 1: Cloudflare R2 Bucket Setup (Checkpoint A)

**Goal:** Create R2 bucket for temporary audio file hosting during enrollment.

**Why:** New enrollment API requires `url` parameter (public file URL) instead of inline base64.

**Duration:** 5 minutes (manual dashboard click)

**Actions:**

1. Open Cloudflare dashboard → **R2** → **Create bucket**
2. **Bucket name:** `audioflam-voice-prep` (or preferred name)
3. **Region:** Automatic (default)
4. **Settings:** 
   - Public access: ✅ Enable (needed for Qwen to fetch files)
   - CORS: Not needed (Qwen fetches server-side, not from browser)
5. **Generate API token:**
   - Dashboard → **R2** → **API Tokens** → **Create API Token**
   - Permissions: `Object.list`, `Object.read`, `Object.write` (for audioflam-voice-prep bucket only)
   - Copy token details: Account ID, Access Key ID, Secret Access Key
6. **Add to `.env`:**
   ```
   R2_ACCOUNT_ID=<account-id>
   R2_ACCESS_KEY_ID=<access-key>
   R2_SECRET_ACCESS_KEY=<secret-key>
   R2_BUCKET_NAME=audioflam-voice-prep
   ```
7. **Bind in `wrangler.toml`:** (Optional — can also use direct S3 API calls)
   ```toml
   [[r2_buckets]]
   binding = "VOICE_BUCKET"
   bucket_name = "audioflam-voice-prep"
   ```

**Verification (Checkpoint A):**
- [ ] R2 bucket created and named `audioflam-voice-prep`
- [ ] Public access enabled
- [ ] API token generated with correct permissions
- [ ] `.env` updated with R2 credentials
- [ ] Can successfully list bucket via API (`aws s3 ls` or direct curl test)

---

### Step 2: Update Enrollment Endpoint `/api/tts/clone/+server.ts` (Checkpoint B)

**Goal:** Rewrite enrollment handler to use HTTP API with R2 + new request/response shapes.

**File:** `src/routes/api/tts/clone/+server.ts`

**Current Flow (lines 6–71):**
1. Receive audio blob
2. Convert to base64
3. POST to `qwen-voice-enrollment` with `action: "create"` + inline audio
4. Parse response field `data.output.voice`
5. Store in localStorage

**New Flow (required):**
1. Receive audio blob
2. Upload to R2 bucket → get public URL
3. POST to `voice-enrollment` with `action: "create_voice"` + URL
4. Parse response field `data.output.voice_id`
5. Store in localStorage

**Code Changes Required:**

```typescript
// At top of POST handler:
import { env } from '$env/dynamic/private';

// New helper: Upload audio to R2
async function uploadToR2(audioBlob: Blob, voiceName: string): Promise<string> {
  const filename = `${voiceName.toLowerCase()}-${Date.now()}.wav`;
  const formData = new FormData();
  formData.append('file', audioBlob, filename);

  // Use Cloudflare R2 S3-compatible API
  const response = await fetch(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${filename}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 ...`, // AWS SigV4 signing
      },
      body: audioBlob,
    }
  );

  if (!response.ok) throw new Error(`R2 upload failed: ${response.status}`);
  
  // Return public URL
  return `https://${env.R2_BUCKET_NAME}.r2.dev/${filename}`;
}

// Update enrollment request:
const requestBody = {
  model: 'voice-enrollment',  // Changed from 'qwen-voice-enrollment'
  input: {
    action: 'create_voice',   // Changed from 'create'
    target_model: 'qwen-audio-3.0-tts-flash',
    prefix: voiceName.toLowerCase(),  // New required field
    url: audioUrl,  // Changed from audio_base64
    language_hints: ['en'],
  },
};

// Update response parsing:
const voiceId = data.output.voice_id;  // Changed from data.output.voice
```

**Implementation Notes:**
- Use AWS SigV4 signing for R2 (Cloudflare Workers compatible) OR use direct AWS SDK
- Store R2 public URL format: `https://<bucket>.r2.dev/<filename>`
- Add cleanup: Delete uploaded WAV from R2 after enrollment succeeds (optional but recommended for storage)

**Verification (Checkpoint B):**
- [ ] POST handler updated to use new model + action
- [ ] Audio upload to R2 working (test with dummy audio)
- [ ] Enrollment request sends correct JSON shape
- [ ] Response parser looks for `voice_id` instead of `voice`
- [ ] New voice successfully enrolled and stored in localStorage
- [ ] Voice ID is long UUID-like string (e.g., `voice-12345...`)

---

### Step 3: Rewrite Synthesis Endpoint `/api/tts/+server.ts` `handleQwen()` (Checkpoint C)

**Goal:** Replace HTTP POST synthesis with WebSocket-based streaming synthesis.

**File:** `src/routes/api/tts/+server.ts` (lines 261–373)

**Current Flow (retiring):**
```typescript
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
  model: "qwen3-tts-vc-2026-01-22"
  → Receive output.audio.url (MP3 download link)
  → Fetch MP3 from URL
  → Encode as base64
  → Return to client
```

**New Flow (required):**
```typescript
WebSocket wss://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice-api/text-to-speech?token=<key>
  Send: { task_id, task_type: "run_task", model: "qwen-audio-3.0-tts-flash", input: { text, voice_id, ... } }
  Receive: { event: "task-started" }
  Send: { task_id, task_type: "continue_task" }
  Receive: { event: "result-generated", output: { audio: { data: "<base64-chunk>" }, status } } (multiple times)
  Receive: { event: "task-finished" }
  → Accumulate audio chunks
  → Return to client
```

**Code Changes Required:**

```typescript
async function handleQwen(text: string, voiceId: string) {
  const QWEN_ENDPOINT = 'wss://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice-api/text-to-speech';
  const taskId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${QWEN_ENDPOINT}?token=${env.QWEN_SPEECH_KEY}`);
    const audioChunks: Uint8Array[] = [];

    ws.onopen = () => {
      // Step 1: Send task initiation
      ws.send(JSON.stringify({
        task_id: taskId,
        task_type: 'run_task',
        model: 'qwen-audio-3.0-tts-flash',
        input: {
          text: cleanForTTS(text),
          voice_id: voiceId,
          sample_rate: 24000,
          volume: 100,
        },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'task-started') {
          // Step 2: Send continuation request
          ws.send(JSON.stringify({
            task_id: taskId,
            task_type: 'continue_task',
          }));
        } else if (data.event === 'result-generated') {
          // Step 3: Accumulate audio chunks
          if (data.output?.audio?.data) {
            const chunk = Buffer.from(data.output.audio.data, 'base64');
            audioChunks.push(new Uint8Array(chunk));
          }
        } else if (data.event === 'task-finished') {
          // Step 4: Combine chunks and return
          const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const combined = new Uint8Array(totalSize);
          let offset = 0;
          audioChunks.forEach(chunk => {
            combined.set(chunk, offset);
            offset += chunk.length;
          });

          const audioBase64 = Buffer.from(combined).toString('base64');
          ws.close();
          resolve({
            audioContent: audioBase64,
            format: 'wav', // New model outputs WAV, not MP3
          });
        }
      } catch (err) {
        console.error('[TTS] WebSocket message parse error:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[TTS] WebSocket error:', error);
      reject(new Error(`Qwen WebSocket error: ${error}`));
    };

    ws.onclose = () => {
      if (audioChunks.length === 0) {
        reject(new Error('No audio data received from Qwen'));
      }
    };

    // Timeout: close after 60s
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
        reject(new Error('Qwen synthesis timeout'));
      }
    }, 60000);
  });
}
```

**Implementation Notes:**
- New model outputs **WAV format**, not MP3 (verify in response handling)
- WebSocket must close cleanly to avoid resource leaks
- Add request timeout (60s recommended)
- Audio chunks arrive in base64; decode and accumulate as binary
- No more `output.audio.url` field (direct streaming instead)

**Verification (Checkpoint C):**
- [ ] WebSocket connection establishes without errors
- [ ] `task-started` event received after task initiation
- [ ] `result-generated` chunks received (status: "ongoing")
- [ ] `task-finished` event received and connection closes
- [ ] Audio chunks accumulated into single blob
- [ ] Output format is WAV (verify with audio player test)
- [ ] Synthesis completes without timeout for 2000-char text

---

### Step 4: Re-Clone the 6 Production Voices (Checkpoint D)

**Goal:** Register all custom voices under new model, capture new voice IDs.

**Voices to re-clone:**
- Malawi: Chisomo (F), Mercy (M)
- Zimbabwe: Precious (F), Tawanda (M)
- Wales: Ffion (F), Owain (M)

**Duration:** ~30 minutes (6 voices × 5 min each, running sequentially)

**Process:**

1. **Prepare voice samples** (already available):
   - Location: `static/voice-samples/*.wav`
   - Format: 24kHz mono 16-bit WAV (verified compatible)
   - Duration: 10–20 seconds per voice ✅ Already meets requirements

2. **Upload each sample to R2:**
   ```bash
   # For each voice:
   aws s3 cp static/voice-samples/chisomo.wav s3://audioflam-voice-prep/chisomo.wav
   # Get public URL: https://audioflam-voice-prep.r2.dev/chisomo.wav
   ```

3. **Enroll each voice via HTTP:**
   ```bash
   curl -X POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice/enrollments \
     -H "Authorization: Bearer $QWEN_SPEECH_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "voice-enrollment",
       "input": {
         "action": "create_voice",
         "target_model": "qwen-audio-3.0-tts-flash",
         "prefix": "chisomo",
         "url": "https://audioflam-voice-prep.r2.dev/chisomo.wav",
         "language_hints": ["en"]
       }
     }' | jq '.output.voice_id'
   ```

4. **Record new voice IDs:**
   ```json
   {
     "chisomo": "voice-<new-id-1>",
     "mercy": "voice-<new-id-2>",
     "precious": "voice-<new-id-3>",
     "tawanda": "voice-<new-id-4>",
     "ffion": "voice-<new-id-5>",
     "owain": "voice-<new-id-6>"
   }
   ```

5. **Update `src/lib/stores.ts`:**
   - Lines 87–103: Update `QWEN_VOICES` and `QWEN_WELSH_VOICES` with new voice IDs
   - Keep voice names, descriptions, country flags unchanged
   - Only replace the `voiceId` field

   **Example:**
   ```typescript
   // Before:
   { voiceId: 'qwen-tts-vc-malawi-voice-chisomo-cloned-20260511', voiceName: 'Chisomo', country: '🇲🇼', ... }
   
   // After:
   { voiceId: 'voice-<new-long-id>', voiceName: 'Chisomo', country: '🇲🇼', ... }
   ```

6. **Test each voice:**
   - Generate 10–20 second TTS for each voice
   - Verify audio quality (compare against preview samples)
   - No clipping, natural pacing, voice recognizable

**Verification (Checkpoint D):**
- [ ] All 6 voices successfully enrolled (new voice IDs obtained)
- [ ] `src/lib/stores.ts` updated with new voice IDs
- [ ] All voice IDs follow format: `voice-<uuid>`
- [ ] Synthesis works for each voice
- [ ] Audio quality acceptable (matches or exceeds old voices)
- [ ] No error messages in console during enrollment/synthesis

---

### Step 5: Quality Comparison & Testing (Checkpoint E)

**Goal:** Verify new voice clones meet acceptable quality standards.

**Duration:** 15 minutes

**Test Script:**
```typescript
// Test each voice with standard text
const testTexts = [
  'This is a test of the new voice cloning system.',
  'The quick brown fox jumps over the lazy dog.',
  'Testing audio quality and naturalness of synthesis.',
];

for (const voiceId of newVoiceIds) {
  for (const text of testTexts) {
    const audio = await generateTTS(text, voiceId);
    // Listen for:
    // - No artifacts or clipping
    // - Natural pacing
    // - Clear articulation
    // - Voice similarity to original sample
  }
}
```

**Comparison Criteria:**

| Criterion | Pass | Fail |
|-----------|------|------|
| No clipping/distortion | Audio plays cleanly | Audible crackling, peaks |
| Natural pacing | Speech flows naturally | Robotic, unnatural breaks |
| Clarity | Words clear and distinct | Mumbled, unclear syllables |
| Voice consistency | Recognizable as original voice | Sounds like different person |
| Duration accuracy | ~5 seconds for ~25-word text | Way off (< 3s or > 10s) |

**Failure Handling:**
- If audio quality is **unacceptable:** Re-enroll voice (voice sample may be corrupt or insufficient)
- If audio quality is **acceptable but degraded:** Document in `AGENTS.md` as known limitation; proceed to finalization
- If synthesis times out: Check WebSocket implementation (timeout logic)

**Verification (Checkpoint E):**
- [ ] All 6 voices synthesize without errors
- [ ] No clipping or distortion in audio
- [ ] Voices sound natural and recognizable
- [ ] Duration is reasonable (~5-10s for standard test text)
- [ ] Quality comparison notes recorded (if comparing to old voices)

---

### Step 6: Clean Up & Finalize (Checkpoint F)

**Goal:** Remove old code paths, update documentation, verify deployment.

**Duration:** 10 minutes

**Actions:**

1. **Delete old Qwen code paths:**
   - `src/routes/api/tts/+server.ts`: Remove old `handleQwen()` function (backup old code to `docs/archive/` first)
   - Keep: `cleanForTTS()` function (works with new model too)
   - Keep: `escapeXml()` function (needed for other providers)

2. **Update old voice IDs:**
   - Delete: Old cloned voice reference variables (if any)
   - Delete: `scripts/enroll_voices.js` and `scripts/enroll_welsh_voices.js` (no longer needed)
   - Keep: `scripts/voice_ids.json` in archive (historical record only)

3. **Update AGENTS.md:**
   ```markdown
   ### Qwen3-TTS Voice Cloning (updated October 2026)
   - **Status:** Migrated to qwen-audio-3.0-tts-flash + voice-enrollment
   - **Models:** voice-enrollment (HTTP) + qwen-audio-3.0-tts-flash (WebSocket synthesis)
   - **Voices:** Malawi (Chisomo F, Mercy M), Zimbabwe (Precious F, Tawanda M), Wales (Ffion F, Owain M)
   - **Voice IDs:** Updated August 2026, all voices re-cloned
   - **Migration Date:** Completed August 2026; old models (qwen3-tts-vc-2026-01-22) retired
   ```

4. **Update environment variable docs:**
   - Confirm: `QWEN_SPEECH_KEY` is still valid (no changes needed)
   - Remove: Any references to workspace ID (not needed)
   - Remove: References to old model names

5. **Final deployment test:**
   - [ ] `npm run build` completes without errors
   - [ ] `npm run check` passes (TypeScript strict mode)
   - [ ] All TTS endpoints responding (Azure, YarnGPT, Qwen)
   - [ ] Custom voice cloning UI still works (new voices selectable)
   - [ ] No console errors in browser DevTools

6. **Commit & deploy:**
   ```bash
   git add -A
   git commit -m "Migration: Qwen TTS moved to qwen-audio-3.0-tts-flash + WebSocket synthesis"
   npm run build
   # Deploy to Cloudflare Pages (automatic or manual)
   ```

**Verification (Checkpoint F):**
- [ ] Old Qwen code paths completely removed
- [ ] No references to old models in codebase
- [ ] AGENTS.md updated with migration notes
- [ ] Environment variables documented
- [ ] Build completes without errors
- [ ] TypeScript checks pass
- [ ] All voices selectable in UI
- [ ] No runtime errors in browser
- [ ] Deployed to production successfully

---

## Section 4: Rollback Plan (If Needed)

If migration fails catastrophically:

1. **Immediate:** Disable Qwen voice cloning in UI (remove from voice dropdown)
2. **Keep:** Azure Speech and YarnGPT as fallback providers
3. **Restore:** Deploy previous commit (Git rollback)
4. **Investigate:** Review WebSocket error logs, check Qwen API status
5. **Contact:** Alibaba support if API endpoint is unavailable

**Recovery Window:** Can stay on Azure + YarnGPT indefinitely (no retirement deadline for those models)

---

## Section 5: Troubleshooting Reference

### Enrollment Fails with "Invalid Audio"
- **Cause:** Audio format not exactly 24kHz mono 16-bit WAV
- **Fix:** Re-run `prepareAudioForCloning()` on new voice sample, verify output format

### WebSocket Connection Times Out
- **Cause:** Qwen API endpoint unreachable or slow network
- **Fix:** Check API status page, verify token is valid, increase timeout to 90s temporarily

### `voice_id` Not Found in Response
- **Cause:** API returned old response shape (using old model by mistake)
- **Fix:** Verify enrollment request has `model: "voice-enrollment"` (not `qwen-voice-enrollment`)

### Audio Output is Silent or Noise
- **Cause:** Voice ID invalid or Qwen service experiencing issues
- **Fix:** Re-enroll voice; test with different text; check if other voices work

### R2 Upload Fails with 403
- **Cause:** API credentials invalid or bucket permissions wrong
- **Fix:** Verify `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.env`; check bucket public access enabled

---

## Section 6: Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Enrollment endpoint uses new API | Pending | Code review of `clone/+server.ts` |
| Synthesis uses WebSocket | Pending | Code review of `handleQwen()` in `+server.ts` |
| All 6 voices re-enrolled | Pending | New voice IDs recorded + stored in `src/lib/stores.ts` |
| Synthesis produces WAV output | Pending | Audio blob format verified |
| No old code paths remain | Pending | Grep confirms no references to `qwen3-tts-vc-2026-01-22` |
| Build & tests pass | Pending | `npm run build && npm run check` |
| Voices selectable in UI | Pending | Manual test in browser |
| Deployment to production | Pending | Cloudflare Pages live |

---

## Section 7: Timeline & Responsibilities

| Phase | Duration | Owner | Checkpoint |
|-------|----------|-------|------------|
| R2 Setup | 5 min | Dan (UI) | A |
| Enrollment Rewrite | 45 min | Coder | B |
| Synthesis Rewrite | 60 min | Coder | C |
| Voice Re-Cloning | 30 min | Dan (curl/API calls) | D |
| Quality Testing | 15 min | Dan (listen test) | E |
| Cleanup & Deploy | 10 min | Coder | F |
| **Total** | **~2.5 hours** | — | — |

---

## Section 8: Files to Modify

| File | Type | Change |
|------|------|--------|
| `src/routes/api/tts/clone/+server.ts` | 🔴 Major | POST handler: R2 upload + new request shape + new response parse |
| `src/routes/api/tts/+server.ts` | 🔴 Major | `handleQwen()`: HTTP → WebSocket, streaming audio accumulation |
| `src/lib/stores.ts` | 🟡 Minor | Voice ID updates (lines 87–103) |
| `.env` | 🟡 Minor | Add R2 credentials (temporary, for enrollment only) |
| `AGENTS.md` | 🟢 Docs | Update Qwen section with migration notes |
| `docs/plans/` | 🟢 Docs | Archive old migration plans to `docs/archive/` |

**Files NOT changed:**
- `src/lib/utils/audioPrep.ts` (output already compatible)
- `src/routes/+page.svelte` (UI unchanged, same voice dropdown)
- `src/lib/components/VoiceClonePanel.svelte` (UI unchanged)

---

## Section 9: API Documentation Reference

**Enrollment API:**
- Endpoint: `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice/enrollments`
- Request: `{ model: "voice-enrollment", input: { action: "create_voice", target_model: "qwen-audio-3.0-tts-flash", prefix, url, language_hints } }`
- Response: `{ output: { voice_id: "..." } }`
- Full spec: `docs/info/http-api-ref.txt`

**Synthesis API:**
- Endpoint: `wss://dashscope-intl.aliyuncs.com/api/v1/services/aigc/voice-api/text-to-speech?token=<key>`
- Protocol: WebSocket (persistent connection)
- Workflow: run_task → task-started → continue_task → result-generated (streaming) → task-finished
- Full spec: `docs/info/qwen-websocket-ref.txt`

---

## Ready to Implement?

**Checklist before starting:**
- [ ] R2 bucket name and location decided
- [ ] Understood WebSocket workflow (read Section 1 carefully)
- [ ] Existing voice samples verified (24kHz WAV, 10–20s)
- [ ] Comfortable with base64 audio handling
- [ ] Ready to test synthesis quality (ears ready!)

**Next Step:** After approval, switch to Code mode to implement Steps 1–6 as outlined above.

---

**Document Version:** 1.0  
**Created:** August 18, 2026  
**Ready for:** Implementation phase
