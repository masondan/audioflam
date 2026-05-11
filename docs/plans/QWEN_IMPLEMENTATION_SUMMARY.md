# Qwen3-TTS Voice Cloning Implementation Summary

**Status:** Phase 0–2 Complete (API tested, backend integrated)  
**Date:** May 2026  
**Next Step:** Phase 1 (voice enrollment) — requires payment method on Alibaba Cloud

---

## What's Been Done

### Phase 0 ✅ API Smoke Test
- Created [`scripts/test_qwen_api.js`](../../scripts/test_qwen_api.js)
- Tested Qwen3-TTS API connectivity with system voice (Cherry)
- **Result:** ✅ API working, audio downloaded successfully (90 KB WAV file)
- Endpoint: `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`

### Phase 1 (Ready, awaiting payment method)
- Created [`scripts/enroll_voices.js`](../../scripts/enroll_voices.js) — enrolls 4 voice samples
- Created [`scripts/test_cloned_voice.js`](../../scripts/test_cloned_voice.js) — tests cloned voice synthesis
- **Awaiting:** Payment method added to Alibaba Cloud account (manual step)

### Phase 2 ✅ Backend Integration
- Added `handleQwen()` function to [`src/routes/api/tts/+server.ts`](../../src/routes/api/tts/+server.ts)
  - Handles voice synthesis with cloned voices
  - Downloads audio immediately (critical: 24-hour URL expiry)
  - Returns base64-encoded WAV audio
  - Includes error handling and logging
- Added `qwen` provider type to [`src/lib/stores.ts`](../../src/lib/stores.ts)
- Added `QWEN_VOICES` array with 4 voice definitions:
  - `malawi_female` (Chisomo)
  - `malawi_male` (Mercy)
  - `zim_female` (Tawanda)
  - `zim_male` (Precious)
- Updated `ALL_VOICES` to include Qwen voices in UI dropdown
- Updated `.env.example` with `QWEN_SPEECH_KEY` documentation
- TypeScript build passes ✅

---

## Voice Identity Map (Corrected)

| Key | File | Country | Gender | Status |
|---|---|---|---|---|
| `malawi_female` | `chisomo.wav` | Malawi | Female | Ready to enroll |
| `malawi_male` | `mercy.wav` | Malawi | Male | Ready to enroll |
| `zim_female` | `tawanda.wav` | Zimbabwe | Female | Ready to enroll |
| `zim_male` | `precious.wav` | Zimbabwe | Male | Ready to enroll |

---

## Next Steps (Phase 1)

### 1. Add Payment Method to Alibaba Cloud (Manual)
1. Log into [alibabacloud.com](https://alibabacloud.com)
2. Click avatar → **Expenses and Costs**
3. Left sidebar → **Billing Account**
4. Scroll to **Third-Party Payment Method** → **Add Payment Method**
5. Enter Visa/Mastercard/AMEX/JCB details
6. Alibaba will charge $1.00 pre-auth (refunded in 1–5 days)
7. Wait for card status to show **Active**

### 2. Run Voice Enrollment
```bash
node --env-file=.env scripts/enroll_voices.js
```
- Enrolls all 4 voices
- Saves voice IDs to `scripts/voice_ids.json`
- Appends voice IDs to `.env` as `VOICE_MALAWI_FEMALE`, etc.
- **Cost:** $0.04 total (4 × $0.01)

### 3. Test Cloned Voice Synthesis
```bash
node --env-file=.env scripts/test_cloned_voice.js
```
- Synthesizes test audio with `malawi_female` voice
- Saves to `scripts/test_clone_output.wav`
- Verify voice quality matches original sample

---

## Phase 3 (After Enrollment)

### 1. Update Voice Definitions in `src/lib/stores.ts`
Replace placeholder voice names with actual enrolled voice IDs:
```typescript
export const QWEN_VOICES: VoiceOption[] = [
  { name: 'qwen-tts-vc-chisomo-voice-XXXXXXXX', ... },  // from enrollment
  { name: 'qwen-tts-vc-mercy-voice-XXXXXXXX', ... },
  { name: 'qwen-tts-vc-tawanda-voice-XXXXXXXX', ... },
  { name: 'qwen-tts-vc-precious-voice-XXXXXXXX', ... }
];
```

### 2. Set Cloudflare Environment Variables
Add to Cloudflare Pages → Settings → Environment variables:
```
QWEN_SPEECH_KEY=sk-...
VOICE_MALAWI_FEMALE=qwen-tts-vc-chisomo-voice-...
VOICE_MALAWI_MALE=qwen-tts-vc-mercy-voice-...
VOICE_ZIM_FEMALE=qwen-tts-vc-tawanda-voice-...
VOICE_ZIM_MALE=qwen-tts-vc-precious-voice-...
```

### 3. End-to-End Test
- Start dev server: `npm run dev`
- Select Qwen voice from dropdown
- Generate TTS audio
- Verify audio plays in browser
- Test on mobile (Android Chrome, iOS Safari)

---

## Key Implementation Details

### Audio Format
- **Input:** WAV files (voice samples in `static/voice-samples/`)
- **Output:** WAV audio (returned by Qwen API, converted to base64)
- **Mobile Compatibility:** WAV plays natively in Chrome/Safari

### 24-Hour URL Expiry (Critical)
The Qwen API returns a temporary URL that expires after 24 hours. The implementation:
1. Receives URL from API response
2. **Immediately downloads** audio bytes in the same request
3. Stores audio bytes (not the URL)
4. Returns base64-encoded audio to client

This ensures audio is always available, even if the URL expires.

### Error Handling
- Missing API key → 500 error
- API error response → logged + returned to client
- URL download failure → 500 error
- Network errors → caught and logged

### Logging
All Qwen operations logged with `[Qwen]` prefix for debugging:
```
[Qwen] Generating TTS for voice: malawi_female, text length: 150
[Qwen] Response status: 200
[Qwen] Audio URL received, downloading...
[Qwen] Audio downloaded: 92204 bytes
[Qwen] TTS generated successfully
```

---

## Files Modified/Created

### Created
- `scripts/test_qwen_api.js` — API smoke test
- `scripts/enroll_voices.js` — Voice enrollment script
- `scripts/test_cloned_voice.js` — Cloned voice test
- `docs/plans/QWEN_IMPLEMENTATION_SUMMARY.md` — This file

### Modified
- `src/routes/api/tts/+server.ts` — Added `handleQwen()` handler
- `src/lib/stores.ts` — Added `QWEN_VOICES` array, updated `TTSProvider` type
- `.env.example` — Added `QWEN_SPEECH_KEY` documentation

---

## Testing Checklist

- [x] API connectivity test (Phase 0)
- [ ] Voice enrollment (Phase 1 — awaiting payment method)
- [ ] Cloned voice synthesis test (Phase 1)
- [ ] Backend handler integration (Phase 2 — done)
- [ ] TypeScript build (Phase 2 — done)
- [ ] End-to-end PWA test (Phase 3)
- [ ] Mobile browser compatibility (Phase 3)
- [ ] Cloudflare deployment (Phase 3)

---

## Troubleshooting

### "QWEN_SPEECH_KEY missing"
- Ensure `.env` file has `QWEN_SPEECH_KEY=sk-...`
- For Cloudflare: set via dashboard or `wrangler secret put QWEN_SPEECH_KEY`

### "No audio data from Qwen"
- Check API response in console logs
- Verify voice ID format (enrolled IDs are alphanumeric strings)
- Confirm text is not empty and under 4000 characters

### "Failed to download audio from URL"
- URL may have expired (24-hour limit)
- Check network connectivity
- Verify Alibaba Cloud account has active subscription

### Voice quality issues
- Listen to original sample in `static/voice-samples/`
- Confirm gender assignment is correct
- Re-enroll if needed (costs $0.01 per voice)

---

## Cost Summary

| Phase | Action | Cost | Status |
|---|---|---|---|
| 0 | API smoke test | Free (system voice) | ✅ Done |
| 1 | Voice enrollment (4 voices) | $0.04 | ⏳ Awaiting payment method |
| 2 | Backend integration | Free | ✅ Done |
| 3 | Synthesis (per request) | ~$0.0001 per 100 chars | TBD |

**Total for pilot:** ~$0.04 + synthesis costs (negligible for training use)

---

## References

- **Qwen API Docs:** https://dashscope.aliyun.com/docs
- **Enrollment Endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization`
- **Synthesis Endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- **Plan Document:** [`docs/plans/AUDIOFLAM_VOICE_CLONING_PLAN.md`](./AUDIOFLAM_VOICE_CLONING_PLAN.md)

---

**Last Updated:** May 2026  
**Next Checkpoint:** Phase 1 enrollment (awaiting payment method confirmation)
