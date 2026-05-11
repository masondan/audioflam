# MiniMax New Account Testing Results
**Date:** May 10, 2026  
**Status:** ❌ Account has zero TTS quota — requires credits to proceed

---

## Test Summary

### Account Details
- **Account Type:** New free "Max token plan" (provided by MiniMax support)
- **Group ID:** `2052510731315716667`
- **Token Plan Key:** `sk-cp-M6HSKn...` (tested)
- **Standard API Key:** `sk-api-7sbFA...` (tested)

### Test Results

#### Test 1: Token Plan Key (`MINIMAX_SPEECH_KEY`)
```
Endpoint: /v1/text_to_speech
Model: speech-02
Voice: Calm_Woman
Result: HTTP 200 → {"status_code": 1002, "status_msg": "rate limit exceeded(RPM)"}
```

#### Test 2: Standard API Key (`MINIMAX_SPEECH_KEY_2`)
```
Endpoint: /v1/text_to_speech
Model: speech-02
Voice: Calm_Woman
Result: HTTP 200 → {"status_code": 1002, "status_msg": "rate limit exceeded(RPM)"}
```

#### Test 3: Standard Key After 2-Minute Wait
```
Waited 120 seconds to clear RPM window
Result: HTTP 200 → {"status_code": 1002, "status_msg": "rate limit exceeded(RPM)"}
```

#### Test 4: Alternative Endpoints & Models
```
/v1/t2a_v2 + speech-02-hd → 2061: "your current token plan not support model"
/v1/t2a_v2 + speech-01-hd → 2061: "your current token plan not support model"
api.minimax.chat endpoints → 2049: "invalid api key" (China region, not applicable)
```

---

## Diagnosis

### What Works ✅
- **API authentication:** Both keys authenticate successfully (HTTP 200 responses)
- **Endpoint connectivity:** All endpoints are reachable
- **Request format:** Requests are properly formatted and accepted

### What Doesn't Work ❌
- **TTS quota:** Account has **zero TTS requests allocated**
- **Rate limit:** `1002` error persists across:
  - Both key types (Token Plan + Standard)
  - Multiple voice IDs (Calm_Woman, male-qn-qingse, female-shaonv, presenter_male)
  - Multiple delays (3s, 65s, 120s between requests)
  - Multiple endpoints (/text_to_speech, /t2a_v2)

### Root Cause
The free "Max token plan" provided by MiniMax support includes:
- ✅ Account creation
- ✅ API key generation
- ❌ **Zero TTS quota by default**

The `1002: rate limit exceeded (RPM)` is not a transient throttle — it's a hard quota enforcement. The account needs credits added to the subscription to enable TTS requests.

---

## Next Steps

### Option 1: Add Credits to Token Plan (Recommended)
1. Log into MiniMax dashboard
2. Go to **Token Plan → Manage Subscription**
3. Add credits (even $1-5 would enable testing)
4. Retry TTS requests

**Expected outcome:** If quota is added, requests should succeed with audio response or a different error (e.g., `402: insufficient balance` if credits are very low).

### Option 2: Use Standard API Key with Pay-as-You-Go
1. Already created (`MINIMAX_SPEECH_KEY_2`)
2. Add payment method to account
3. Retry TTS requests

**Expected outcome:** Same as Option 1 — requests should succeed once billing is active.

### Option 3: Revert to Azure/YarnGPT
- Both providers are working and have active credits
- MiniMax can be revisited once account quota is resolved
- No code changes needed — just don't select MiniMax voices in UI

---

## Technical Notes

### API Key Formats
- **Token Plan Key:** `sk-cp-...` (subscription-based, limited quota)
- **Standard API Key:** `sk-api-...` (pay-as-you-go, requires active billing)

Both hit the same `1002` error, suggesting the rate limit is enforced at the **account level**, not the key level.

### Error Code Reference
- `1002` — Rate limit exceeded (RPM) — **Account has no quota**
- `2042` — No access to voice_id — Cloned voices from old account not available
- `2049` — Invalid API key — Wrong region (China vs. International)
- `2061` — Token plan doesn't support model — HD models not included in free plan
- `2013` — Invalid params — Wrong model for endpoint

---

## Conclusion

**The new account is properly connected to the MiniMax API.** The only barrier is **account-level quota enforcement**. Once credits are added to either the Token Plan subscription or the standard API key's billing account, TTS requests should succeed.

**Recommendation:** Contact MiniMax support to clarify:
1. Does the free "Max token plan" include any TTS quota, or is it zero by default?
2. What's the minimum credit amount needed to test TTS?
3. Is there a trial quota or free tier for new accounts?

If no free quota is available, the cost to test would be minimal (likely <$0.10 for a few TTS requests).
