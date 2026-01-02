# Afro-TTS Integration Report

**Status:** Blocked on backend hosting. Recommendation: Pivot to Replicate.com

---

## Objective

Integrate **Afro-TTS (XTTS v2)** into AudioFlam to generate Nigerian English speech with authentic African accents.

**Why:** Google Cloud TTS Nigerian voices are poor quality. Afro-TTS fine-tuned for African accents provides significantly better results.

---

## What We Tried

### Attempt 1: HuggingFace Spaces (Free Tier)

**Approach:**
- Created Gradio backend at: https://huggingface.co/spaces/masondan/audioflam-tts-backend
- Deployed minimal Python app (`app.py`) using XTTS v2 model
- Expected: Free CPU-only tier sufficient for development

**Results:**
- ❌ Model failed to load: `EOF when reading a line`
- Root cause: XTTS v2 (1GB model) requires GPU to load
- Free tier was CPU-only (2 vCPU, 16GB RAM)

**Fix Applied:**
- Corrected model name in `app.py`: `"xtts_v2"` (was using invalid path)
- Restarted Space
- Still failed—model still needs GPU

### Attempt 2: HuggingFace GPU Upgrade

**Approach:**
- Investigated paid GPU tiers
- Options: Nvidia T4 small ($0.40/hr), ZeroGPU (free for Pro members)

**Results:**
- ❌ T4 and others are paid ($0.40-3.80/hr)
- ❌ ZeroGPU requires **HF Pro subscription** ($9/month)
- Not viable for non-commercial educational project

**Conclusion:** HF Spaces unaffordable for this use case.

---

## Technical Findings

### XTTS v2 Requirements
- **Model size:** ~1GB
- **Inference hardware:** GPU required (cannot run on CPU)
- **Supported speakers:** 86+ African accents (Afro-TTS fine-tuned)
- **Voice cloning:** Supports speaker reference audio (5-10 sec WAV)
- **Audio quality:** 24kHz WAV format
- **Inference time:** ~10-30 seconds per 100-word segment

### Backend Comparison

| Platform | Cost | GPU | Status | Notes |
|----------|------|-----|--------|-------|
| **HF Spaces** | Free→Pro ($9/mo) | Paid only | ❌ Blocked | Requires HF Pro |
| **Replicate** | $0.01-0.05/prediction | Included | ✅ Ready | Pay-per-use, no subscription |
| **Azure/Google Cloud** | Free tier + overage | N/A | ✅ Working | Poor Nigerian voice quality |

---

## Recommendation: Replicate.com

### Why Replicate

1. **Pay-as-you-go pricing** (no subscription)
2. **XTTS v2 already hosted** (coqui/xtts model)
3. **Cost-effective for training:** ~$0.02-0.05 per synthesis
   - 35 journalists × 1 week × ~50 generations = ~$20-50 total
4. **Simple REST API** for SvelteKit integration
5. **Fast inference** (~10 seconds per generation)

### Implementation Steps

#### 1. Prepare Replicate Account
- Go to: https://replicate.com
- Create account (free tier)
- Get API token from account settings
- Add to `.env`:
  ```
  REPLICATE_API_TOKEN=your_token_here
  ```

#### 2. Update SvelteKit API Route
File: `src/routes/api/tts/+server.ts`

```typescript
// Pseudo-code structure:
POST /api/tts
  Input:
    - text: string (required)
    - speaker_name: string (optional, for voice cloning)
    - speaker_wav_url: string (optional, reference audio for cloning)
  
  Output:
    - audioContent: base64 WAV (24kHz)
    - audioUrl: string (direct download link)
    - duration: number (seconds)
```

**Key changes:**
- Remove Azure SDK dependencies
- Call Replicate API instead
- Handle speaker reference audio if provided
- Add 90-second timeout with retry logic

#### 3. Build Speaker/Accent Selector UI

**File:** `src/lib/components/AccentSelector.svelte`

```svelte
<script>
  // Hardcoded accents (no dynamic fetching needed for poor internet)
  const accents = [
    { group: "Nigerian English", speakers: [
      { id: "default_1", name: "Grace (Female)", type: "default" },
      { id: "default_2", name: "John (Male)", type: "default" }
    ]},
    { group: "British English", speakers: [
      { id: "default_3", name: "Emma (Female)", type: "default" }
    ]}
  ];
</script>
```

**Features:**
- Accent grouped by region/language
- Pre-load Nigerian English as default
- Support for custom speaker cloning (future phase)

#### 4. Update Stores
File: `src/lib/stores.ts`

```typescript
// Replace Azure voice store with:
export const selectedAccent = writable<{
  id: string;
  name: string;
  type: 'default' | 'custom';
  speaker_wav_url?: string;
}>({
  id: 'default_1',
  name: 'Grace (Female)',
  type: 'default'
});
```

#### 5. Dialogue Parsing Support

Enable users to write multi-speaker scripts:
```
John: Hello, my name is John
Grace: And I am Grace from Lagos
```

**Implementation:**
- Parse script by speaker prefix (regex: `^(\w+):\s(.+)`)
- Synthesize each speaker segment separately with appropriate accent
- Concatenate audio segments on frontend
- No backend changes needed

#### 6. Testing Accents

Once Replicate is set up:
```bash
node test-replicate-accents.js
```

Test with Nigerian place names and difficult names:
- "Osamudiamen is from Lagos. Kano is in the north."
- Multi-speaker: "John: Hello. Grace: I'm from Enugu."

---

## File Structure (After Implementation)

```
src/
├── routes/
│   ├── api/tts/
│   │   └── +server.ts          ← Replace with Replicate calls
│   └── app/
│       └── +page.svelte        ← Add accent selector
├── lib/
│   ├── components/
│   │   └── AccentSelector.svelte ← New component
│   └── stores.ts               ← Update with accent store
├── utils/
│   └── dialogueParser.ts       ← New utility for multi-speaker parsing
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "node-fetch": "^3.3.2"  // Already installed
  }
}
```

**Remove:**
```json
{
  "dependencies": {
    "microsoft-cognitiveservices-speech-sdk": "^1.47.0"  // No longer needed
  }
}
```

---

## Timeline

| Phase | Task | Effort | Notes |
|-------|------|--------|-------|
| **Phase 1** | Replicate API integration | 2-3 hrs | Replace /api/tts route |
| **Phase 2** | AccentSelector UI component | 1-2 hrs | Hardcoded accents |
| **Phase 3** | Dialogue parsing | 1 hr | Multi-speaker script support |
| **Phase 4** | Testing & QA | 1-2 hrs | Test with Nigerian names |
| **Phase 5** | Deploy to Cloudflare Pages | 30 min | Existing setup |

**Total:** ~6-8 hours for fully working MVP

---

## Cost Projection

**Scenario: 35 journalists, 1 week training**

Assumptions:
- ~50 TTS generations per person (scripts, revisions, testing)
- Average 200 words per generation
- Replicate XTTS v2 pricing: ~$0.02 per prediction

**Calculation:**
```
35 people × 50 generations = 1,750 predictions
1,750 × $0.02 = $35.00
```

**Estimate: $20-50 for entire training week** (vs. $9/month ongoing)

---

## Next Agent: Quick Start

1. **Get Replicate token:**
   - Create account at replicate.com
   - Copy API token to `.env`: `REPLICATE_API_TOKEN=...`

2. **Test Replicate XTTS v2:**
   - Verify model availability: https://replicate.com/coqui/xtts
   - Run a test prediction to confirm it works

3. **Start with Phase 1:**
   - Update `src/routes/api/tts/+server.ts` to call Replicate API
   - Test with simple text: "Hello, my name is Grace"
   - Verify audio returns correctly

4. **Then Phase 2-3:**
   - Build accent selector UI
   - Implement dialogue parser

5. **Deploy:**
   - Push to GitHub
   - Deploy to Cloudflare Pages (existing adapter configured)

---

## Key Files to Modify

- `src/routes/api/tts/+server.ts` ← Primary integration point
- `src/lib/stores.ts` ← Add accent store
- `src/routes/app/+page.svelte` ← Add accent selector
- `.env` ← Add Replicate token
- `package.json` ← Remove Azure SDK

---

## Success Criteria

✅ User selects accent from dropdown
✅ User enters text or multi-speaker dialogue
✅ Click "Generate" → audio synthesizes in 10-30 seconds
✅ Audio plays in player
✅ User can download as WAV
✅ Works on poor internet (no real-time synthesis)
✅ Cost ≤ $50 for 35 journalists, 1 week

---

**Status:** Ready for Phase 1 implementation once Replicate account is set up.
