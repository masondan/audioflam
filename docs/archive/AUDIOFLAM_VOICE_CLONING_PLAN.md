# AudioFlam — Qwen3-TTS Voice Cloning Implementation Plan
**For Claude Code (VS Code / CLI agent)**  
**Project:** AudioFlam PWA — journalist training tool, non-commercial, Africa-first  
**Date:** May 2026

---

## Context & constraints
- Self-funded, minimal spend — all API costs must be near-zero
- Mobile-first PWA, medium-grade Android handsets, expensive data (cache everything)
- Backend: existing AudioFlam codebase (Cloudflare Workers or similar — read the repo first)
- Audio samples are in `static/voice-samples/`: `chisomo.wav`, `mercy.wav` (Malawi), `tawanda.wav`, `precious.wav` (Zimbabwe)
- API key is already in `.env` as `QWEN_SPEECH_KEY` and in Cloudflare environment variables
- Do NOT commit the `.env` file or any API key to git

## Voice identity map
| Key name | File | Country | Gender |
|---|---|---|---|
| `malawi_female` | `chisomo.wav` | Malawi | Female |
| `malawi_male` | `mercy.wav` | Malawi | Male |
| `zim_female` | `tawanda.wav` | Zimbabwe | Female |
| `zim_male` | `precious.wav` | Zimbabwe | Male |

> Note: Confirm gender assignment by listening before running enrollment.

## API details (read carefully before writing any code)

**Endpoint (Singapore region — use this, not Beijing):**
```
https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization
```

**Synthesis endpoint:**
```
https://dashscope-intl.aliyuncs.com/api/v1
```

**Two-step cloning workflow:**
1. **Enrollment** — upload audio → receive a permanent `voice_id` string
2. **Synthesis** — pass `voice_id` + text → receive temporary audio URL (expires 24hrs)

**Critical rule:** The `target_model` used during enrollment MUST match the `model` used for synthesis. Both must be `qwen3-tts-vc-2026-01-22`.

**Enrollment model:** `qwen-voice-enrollment` (do not change this value)  
**Synthesis model:** `qwen3-tts-vc-2026-01-22`

---

## PHASE 0 — API smoke test
**Goal:** Confirm the API key works and the account can reach the endpoint.  
**Do this before any other coding.**

### Task 0.1 — Create `scripts/test_api.py`

Write a minimal Python script that:
1. Reads `QWEN_SPEECH_KEY` from `.env` (use `python-dotenv`)
2. Makes a simple POST to the synthesis endpoint using a **system voice** (no cloning yet) — use voice `"Cherry"`, model `"qwen3-tts-flash"`, text `"Hello, this is a test."`
3. Prints the HTTP status code and whether a URL was returned
4. If successful, downloads the audio and saves it as `scripts/test_output.wav`
5. Prints the file size in KB

```python
# Target output on success:
# Status: 200
# Audio URL received: yes
# File saved: scripts/test_output.wav (47.2 KB)
```

### Task 0.2 — Run it and report
Run `python scripts/test_api.py`. If it fails, fix the error before proceeding. Common issues:
- Wrong endpoint URL (must be `-intl` for Singapore)
- Auth header format must be `"Authorization": "Bearer {key}"` 
- `language_type` must be set to `"English"`

**⛳ CHECKPOINT 0** — Stop here. Report: "API test passed, audio file is [X] KB" before continuing.

---

## PHASE 1 — Voice enrollment (clone creation)
**Goal:** Upload the 4 audio samples and store the returned voice IDs permanently.  
**Cost: $0.04 total (4 × $0.01) — requires a payment method on the Alibaba Cloud account.**

### ⚠️ Before running Phase 1 — add a payment method

Voice enrollment (`qwen-voice-enrollment`) is not covered by the free quota. The total cost for all 4 voices is $0.04, but Alibaba Cloud requires a verified payment method before any paid API calls will succeed.

**How to add your card (do this manually in the browser, not via code):**

1. Log into [alibabacloud.com](https://alibabacloud.com) → click your avatar (top right) → **Expenses and Costs**
2. Go to **Billing Account** in the left sidebar
3. Scroll to **Third-Party Payment Method** → click **Add Payment Method**
4. Enter your Visa/Mastercard/AMEX/JCB card details
5. Alibaba Cloud will charge a USD $1.00 pre-authorisation to verify — this is refunded within 1–5 business days, not a real charge
6. Once the card status shows **Active**, you're ready

**Notes:**
- No minimum deposit required — it's pure pay-as-you-go
- PayPal is also accepted as an alternative to a card
- Prepaid, virtual, or gift cards are not accepted
- There is no minimum spend — your first real charge will be $0.04

**⛳ CHECKPOINT 1-PRE** — Stop here. Confirm: "Payment method added to Alibaba Cloud account and showing as Active." Do not run enrollment until this is confirmed.

### Task 1.1 — Create `scripts/enroll_voices.py`

Write a Python script that:
1. Reads `QWEN_SPEECH_KEY` from `.env`
2. Defines the 4 voice files with their key names (see Voice identity map above)
3. For each voice:
   - Reads the WAV file from `static/voice-samples/`
   - Base64-encodes it
   - POSTs to the enrollment endpoint
   - Extracts the `voice_id` from `response["output"]["voice"]`
   - Prints: `malawi_female: qwen-tts-vc-chisomo-voice-XXXXXXXX`
4. After all 4 succeed, writes the IDs to `scripts/voice_ids.json`
5. Also appends them to `.env` in this format:
   ```
   VOICE_MALAWI_FEMALE=qwen-tts-vc-chisomo-voice-...
   VOICE_MALAWI_MALE=qwen-tts-vc-mercy-voice-...
   VOICE_ZIM_FEMALE=qwen-tts-vc-tawanda-voice-...
   VOICE_ZIM_MALE=qwen-tts-vc-precious-voice-...
   ```

**Enrollment payload structure:**
```python
{
    "model": "qwen-voice-enrollment",  # never change this
    "input": {
        "action": "create",
        "target_model": "qwen3-tts-vc-2026-01-22",
        "preferred_name": "chisomo",   # short, no spaces
        "audio": {
            "data": f"data:audio/wav;base64,{base64_string}"
        }
    }
}
```

**Error handling:**
- If any enrollment fails with a non-200 response, print the full error and skip that voice (don't crash)
- If `voice_ids.json` already exists and a voice ID is present, skip re-enrolling that voice (idempotent)

### Task 1.2 — Run enrollment
Run `python scripts/enroll_voices.py`. All 4 should return voice IDs.

### Task 1.3 — Verify with a synthesis test
Create `scripts/test_cloned_voice.py` that:
1. Reads voice IDs from `scripts/voice_ids.json`
2. Synthesises `"Good morning. Today we will practice interviewing a government official."` using `malawi_female`
3. Downloads and saves as `scripts/test_clone_output.wav`
4. Prints file size

**⛳ CHECKPOINT 1** — Stop here. Confirm: "4 voice IDs enrolled, test synthesis sounds correct." Share the contents of `voice_ids.json`.

---

## PHASE 2 — Backend synthesis service
**Goal:** Wire the cloned voices into the AudioFlam backend so the PWA can request audio by voice key.

### Task 2.1 — Read the existing codebase first
Before writing any new code:
- List all files in the repo
- Find where TTS is currently called (search for existing MiniMax or TTS references)
- Find the placeholder voice names already in place
- Understand the backend framework (Cloudflare Workers? Node? Python?)
- Report what you find before writing anything

### Task 2.2 — Create the synthesis module

Create a new file (location TBD after Task 2.1 — match existing code conventions) called `tts_service` or equivalent. It must:

**Voice ID lookup:**
```
VOICE_MAP = {
    "malawi_female": env("VOICE_MALAWI_FEMALE"),
    "malawi_male":   env("VOICE_MALAWI_MALE"),
    "zim_female":    env("VOICE_ZIM_FEMALE"),
    "zim_male":      env("VOICE_ZIM_MALE"),
}
```

**Synthesis function:**
```
function synthesise(text, voice_key):
    1. Look up voice_id from VOICE_MAP
    2. Check cache: has hash(text + voice_key) been generated before?
       → YES: return cached audio immediately (no API call)
       → NO: continue
    3. POST to Qwen3-TTS-VC synthesis API
    4. Receive temporary URL (valid 24hrs only)
    5. IMMEDIATELY download the audio bytes from that URL
    6. Store audio bytes in cache with key = hash(text + voice_key)
    7. Return audio bytes to caller
```

**Synthesis API call structure:**
```python
POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
Authorization: Bearer {QWEN_SPEECH_KEY}
Content-Type: application/json

{
    "model": "qwen3-tts-vc-2026-01-22",
    "input": {
        "text": "...",
        "voice": "qwen-tts-vc-chisomo-voice-..."
    }
}
```

Response: `response["output"]["audio"]["url"]` → download this immediately.

**Cache implementation:**
- For Cloudflare Workers: use Cloudflare R2 or KV store
- For Node/Python backend: use filesystem cache in `cache/audio/`
- Cache key: `sha256(voice_key + ":" + text)` → filename `{hash}.wav`
- Never delete cache entries (audio doesn't change)

### Task 2.3 — Replace existing TTS call
Find the existing TTS placeholder/MiniMax call. Replace it with a call to the new synthesis module. The interface the PWA uses should not change — only the backend implementation changes.

### Task 2.4 — Handle the 24-hour URL expiry
Add a comment in the code at the download step:
```
# CRITICAL: Qwen3-TTS returns a temporary URL that expires after 24 hours.
# Audio MUST be downloaded and stored immediately in this request cycle.
# Never store the URL itself — always store the audio bytes/file.
```

**⛳ CHECKPOINT 2** — Stop here. Confirm: "Synthesis module written and wired into existing TTS call. Cache is working."

---

## PHASE 3 — Integration test end-to-end
**Goal:** Confirm the full flow works from PWA request to audio playback.

### Task 3.1 — End-to-end test script
Create `scripts/test_e2e.py` that simulates a PWA request:
1. Calls the synthesis function with `voice_key="malawi_female"` and a 50-word test script
2. Confirms audio is returned
3. Calls it again with the same inputs — confirms it returns from cache (should be faster)
4. Prints timing for both calls

### Task 3.2 — Confirm audio format
The PWA plays audio on mobile browsers. Confirm the returned format:
- Check if the API returns WAV or MP3
- If WAV: confirm it plays in mobile Chrome (it should)
- If conversion is needed, use `ffmpeg` or note it as a follow-up task

### Task 3.3 — Check Cloudflare environment variables
Confirm that the 4 `VOICE_*` environment variables are set in Cloudflare (in addition to `.env` for local dev). If not, add instructions for how to set them via `wrangler secret put` or the Cloudflare dashboard.

**⛳ CHECKPOINT 3 — FINAL** — Stop here. Confirm: "Full flow tested. Audio plays on mobile browser. Cloudflare env vars set."

---

## PHASE 4 (future) — Journalist self-cloning
**Do not implement this now. Plan only.**

When ready, this phase adds:
- A "Record your voice" screen in the PWA (15-second recording)
- The recording is sent as a blob to a new backend endpoint `/api/enroll-voice`
- Backend calls `qwen-voice-enrollment` with the blob ($0.01 per journalist)
- Returns a `voice_id` stored against the journalist's user record
- All subsequent synthesis for that journalist uses their personal voice_id
- UI shows: record → preview synthesis → confirm or re-record

---

## Notes for the agent

- **Do not hallucinate voice IDs** — they must come from actual API responses
- **Do not hardcode the API key** — always read from environment
- **Match existing code style** — read the codebase before writing new files
- **Minimise dependencies** — this is a lean, self-funded project
- **Audio caching is not optional** — it directly reduces data costs for journalists on expensive mobile plans
- **The enrollment script is a one-time local tool** — it does not need to be part of the deployed app
- If you are unsure about the existing codebase structure, ask before writing Phase 2 code

---

## Quick reference — API endpoints

| Action | Endpoint |
|---|---|
| Voice enrollment | `POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization` |
| Speech synthesis | `POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` |

**Auth header for both:** `Authorization: Bearer {QWEN_SPEECH_KEY}`

## Quick reference — Free quota status (as of May 2026)
- `qwen3-tts-vc-realtime-2026-01-15`: 10,000 chars remaining, expires 2026-08-09 — FREE, enable toggle
- `qwen-voice-enrollment`: **NOT on free quota — requires paid account ($0.04 total for 4 voices)**
- All synthesis quotas valid until 2026-08-09 — well within pilot timeline
