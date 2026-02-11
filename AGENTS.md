# AudioFlam - AI Agent Reference

**Purpose:** Single-source-of-truth for AI agents working on AudioFlam  
**Status:** Production (Step 15 - Smart Export & UX Polish)  
**Updated:** February 2026

---

## Quick Start

**What is AudioFlam?** A mobile-first web app that converts text scripts to audio (TTS) and creates audiograms (image + audio + waveform + effects → MP4).

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (TypeScript)
- Cloudflare Pages (hosting)
- Native CSS variables (no Tailwind)
- WebCodecs API (MP4 encoding on Android)
- MediaRecorder fallback (iOS/Firefox → cloud transcoding)

**Key Constraint:** Non-commercial, educational use. No authentication. Hidden from search engines.

---

## Commands

```bash
npm run dev          # Local development
npm run build        # Production build
npm run check        # TypeScript/Svelte checks
npm run check:watch  # Watch mode
```

---

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Header + TTS/Audiogram tab
│   ├── +layout.svelte            # Root layout
│   └── api/
│       ├── tts/+server.ts        # TTS endpoint (Azure + YarnGPT)
│       └── transcode/+server.ts  # Cloud video transcoding (NEW)
├── lib/
│   ├── stores.ts                 # Voice definitions, app state
│   ├── components/
│   │   ├── VoiceDropdown.svelte  # Voice selector
│   │   ├── AudiogramPage.svelte  # Main audiogram UI
│   │   ├── CompositionCanvas.svelte # Canvas preview/export
│   │   ├── ImageCropDrawer.svelte # Image crop overlay
│   │   ├── AudioImport.svelte    # Audio upload + waveform
│   │   ├── WaveformPanel.svelte  # Waveform settings
│   │   ├── TitlePanel.svelte     # Title text/font/style
│   │   ├── LightEffectPanel.svelte # Bokeh effect controls
│   │   ├── ColorPicker.svelte    # HSB color picker
│   │   ├── TogglePanel.svelte    # Collapsible panel (reusable)
│   │   ├── SpeedSlider.svelte    # Audio speed control
│   │   ├── SpeedSilenceControls.svelte # Speed + silence trim
│   │   ├── SilenceSlider.svelte  # Silence detection
│   │   ├── SpeedBlockModal.svelte # Speed warning modal
│   │   └── [other UI components]
│   └── utils/
│       ├── waveform.ts           # Amplitude extraction + rendering
│       ├── recording.ts          # MediaRecorder wrapper
│       ├── compositor.ts         # Canvas layer composition
│       ├── video-export.ts       # Smart export orchestration
│       ├── webcodecs-export.ts   # WebCodecs + Mediabunny (H.264/MP4)
│       └── [audio utilities]
├── app.css                       # Global styles + CSS variables
└── app.html                      # HTML template

static/
├── icons/                        # SVG icons (22 for audiogram)
└── robots.txt                    # Disallow: / (no indexing)
```

---

## TTS Providers

### Azure Speech (Recommended)
- **Speed:** ~3 seconds
- **Auth:** API key via `Ocp-Apim-Subscription-Key` header
- **Critical:** Cloudflare Workers require explicit `Host` header
- **Voices:**
  - Nigerian: `en-NG-AbeoNeural` (M), `en-NG-EzinneNeural` (F)
  - British: `en-GB-RyanNeural` (M), `en-GB-BellaNeural` (F), `en-GB-HollieNeural` (F), `en-GB-OliverNeural` (M)

### YarnGPT (Native Nigerian)
- **Speed:** ~30 seconds
- **Auth:** Bearer token
- **Voices:** Idera (F), Regina (F), Tayo (M), Femi (M)
- **Endpoint:** `https://yarngpt.ai/api/v1.1/tts`
- **Format:** MP3

### API Endpoint: POST `/api/tts`

```json
Request:
{
  "text": "Hello world",
  "voiceName": "en-NG-AbeoNeural",
  "provider": "azure"
}

Response:
{
  "audioContent": "<base64-encoded MP3>",
  "format": "mp3"
}
```

---

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
AZURE_SPEECH_KEY=<84-char key>
AZURE_SPEECH_REGION=eastus
YARNGPT_API_KEY=<API key>
```

**Important:** After updating env vars, deploy to activate.

---

## MP4 Export Architecture

### The Challenge
Android Chrome claims H.264 support but fails when actually encoding. Affects 85% of users.

### The Solution: Three-Tier Strategy

```
Export Button
├─ Tier 1: WebCodecs + Mediabunny (Android, Chrome Desktop)
│  └─ H.264 encoding locally → MP4 direct download
├─ Tier 2: MediaRecorder (iOS Safari, Firefox)
│  └─ WebM locally → No cloud needed, direct download
└─ Tier 3: Cloud transcoding (if Tier 2 fails or forced)
   └─ Upload WebM to api.video → Get MP4 → Download
```

### Implementation Details

**Smart Export Function:** `smartExportVideo()` (video-export.ts)
- Checks WebCodecs support first
- Falls back to MediaRecorder if unavailable
- Triggers cloud transcoding only if needed

**WebCodecs Path** (webcodecs-export.ts):
- Uses Mediabunny library (17KB, pure JS MP4 muxer)
- Encodes frames as H.264, audio as AAC
- 24 fps, 2 Mbps video bitrate, 96 kbps audio
- Codec: `avc1.42001f` (Baseline profile, level 3.1 for max compatibility)
- **Critical Design Decision:** Audio is encoded from AudioBuffer, NOT played during export (avoids stuttering from CPU load)

**MediaRecorder Path** (video-export.ts):
- Falls back to WebM if H.264 unavailable
- Includes internal RAF loop for continuous frame delivery (tightly coupled to MediaRecorder)
- Handles audio playback during recording

**Cloud Transcoding Path** (video-export.ts + api/transcode):
- Uploads WebM to api.video
- api.video transcodes to MP4 automatically
- Cost: Free encoding, ~$0.003/video for storage/delivery (negligible for ~200 videos/year)
- Cloudflare Worker proxies requests (avoids CORS, protects API key)
- Auto-deletes video after download

### Browser Support Matrix

| Browser | Method | Output |
|---------|--------|--------|
| Chrome Android | WebCodecs | MP4 ✅ |
| Chrome Desktop | WebCodecs | MP4 ✅ |
| Safari iOS | MediaRecorder | WebM ⚠️ |
| Firefox | MediaRecorder | WebM ⚠️ |

### Performance
- WebCodecs: 10-40s for 60s video (device-dependent)
- MediaRecorder: Similar or slower
- Cloud transcode: +10-20s (upload + transcoding time)

### Key Files
- `src/lib/utils/video-export.ts` - Main orchestration
- `src/lib/utils/webcodecs-export.ts` - H.264 encoding via Mediabunny
- `src/routes/api/transcode/+server.ts` - Cloud transcoding proxy
- `src/lib/components/AudiogramPage.svelte` - Export button integration
- `src/lib/components/CompositionCanvas.svelte` - Canvas rendering

---

## Design System

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` / `--color-indigo-bloom` | `#5422b0` | Buttons, active states |
| `--color-lavender-veil` | `#f0e6f7` | Highlights |
| `--color-text-primary` | `#333333` | Body text |
| `--color-text-secondary` | `#777777` | Hints, labels |
| `--color-white` | `#ffffff` | Cards, surfaces |
| `--color-app-bg` | `#efefef` | App background |
| `--color-border` | `#e0e0e0` | Light borders |
| `--color-border-dark` | `#777777` | Dark borders |

### Typography & Spacing

| Token | Value |
|-------|-------|
| `--font-family-base` | Inter, sans-serif |
| `--font-size-base` | 1rem |
| `--spacing-md` | 16px |
| `--radius-md` | 8px |
| `--transition-normal` | 200ms ease |

All CSS variables defined in `src/app.css`.

---

## Critical Rules & Gotchas

### DO NOT Break These

1. **Simplicity first** - Single-purpose tool, don't over-engineer
2. **No auth system** - Public URL, hidden from search engines
3. **2000 character limit** - TTS generation per request
4. **Base64 encoding** - Use `btoa()` not `Buffer` (Cloudflare compatibility)
5. **XML escaping** - Always escape user text before embedding in SSML (prevents injection)
6. **Host header required** - Azure requests in Cloudflare Workers need explicit `Host` header
7. **Audio format consistency** - All responses must include `format: 'mp3'` field

### Export-Specific Gotchas

- **WebCodecs audio NOT played during export** - Rendering uses time-based animation, not live playback analysis
- **H.264 requires even dimensions** - Canvas auto-corrected in webcodecs-export.ts (lines 194-196)
- **Canvas copy needed** - Offscreen canvas required to handle dimension correction
- **Audio mono→stereo conversion** - Many mobile AAC encoders reject mono; code converts automatically
- **Mediabunny lazy-load** - Loaded dynamically to keep initial bundle small
- **Type assertions risky** - `video-export.ts:445` has unchecked type assertion; add guard if changing

### TTS Gotchas

- **YarnGPT slower but native** - Nigerian voices sound more natural but take ~30s (user education needed)
- **Azure faster but slightly accented** - 3s generation but international accent
- **Error handling loose** - If API fails, user gets generic "error" message (see Improvements below)

---

## Current Phase Focus

**Step 15 - Smart Export & UX Polish**

✅ **Complete:**
- TTS with Azure + YarnGPT
- Full Audiogram creation (image, audio, waveform, title, effects)
- MP4 export via WebCodecs (Android)
- MediaRecorder fallback (iOS/Firefox)
- Cloud transcoding via api.video

**In Progress:**
- Edge case testing
- UX polish (error messages, loading states)
- Mobile device compatibility

**Next Phase (Phase 2 - Future):**
- TTS→Audiogram one-click integration (store exists, UI not wired)
- Enhanced iOS fallback with better error guidance
- Performance optimization (OffscreenCanvas for preview)

---

## Architecture Decision Log

### Why WebCodecs + Mediabunny Instead of MediaRecorder?

**Context:** August 2025 - Android Chrome was producing black-screen videos with MediaRecorder H.264

**Options Considered:**
1. MediaRecorder only → Doesn't work reliably on Android
2. FFmpeg.wasm → Heavy (~5MB), slow, overkill for simple MP4
3. WebCodecs + Mediabunny → Lightweight, native H.264 support, Mediabunny is 17KB pure JS

**Decision:** Go with #3 (WebCodecs + Mediabunny)

**Why:** Direct H.264 encoding bypasses MediaRecorder's browser implementation bugs. Mediabunny proved more reliable than larger alternatives in testing.

**Document:** See `docs/archive/EXPORT_TECH_PLAN.md` for full analysis.

### Why Cloud Transcoding Instead of Browser WebM Only?

**Context:** iOS Safari doesn't support WebCodecs. Users want MP4, not WebM.

**Options:**
1. WebM only for all browsers → Users unhappy with non-standard format
2. Cloud transcoding via Cloudinary → Already used for images, but expensive (~$0.06/video)
3. Cloud transcoding via api.video → Cheap (~$0.003/video), free encoding

**Decision:** api.video with Cloudflare Worker proxy

**Why:** Free encoding + negligible storage cost. Cloudflare Worker avoids CORS issues and keeps API key server-side.

**Limitation:** Requires internet connection for iOS users (unavoidable architectural constraint).

### Why NOT Play Audio During WebCodecs Export?

**Context:** WebCodecs encoding is CPU-intensive. Playing audio during export causes stuttering.

**Decision:** Encode audio from AudioBuffer (no playback), use time-based frame rendering

**Why:** Guarantees smooth 24fps export without competing for CPU with Web Audio playback

**Trade-off:** Waveform animation must be time-synchronized, not frequency-analyzed from live playback

**Implementation:** `renderFrame(currentTime)` callback passes time to animation logic, not live audio data.

---

## Common Pitfalls for Agents

### 1. Assuming MediaRecorder H.264 Works on All Android
**Reality:** It claims support but fails in practice. Always check WebCodecs first.

### 2. Forgetting Audio MIME Type Field
**Reality:** Both TTS providers must return `{ audioContent, format: 'mp3' }`. YarnGPT was fixed to match Azure response format.

**File:** `src/routes/api/tts/+server.ts`

### 3. Not Handling Mono Audio in WebCodecs
**Reality:** AAC encoder on mobile browsers rejects mono. Code auto-converts mono→stereo.

**File:** `src/lib/utils/webcodecs-export.ts:277-294`

### 4. Type Assertions Without Guards
**Reality:** `video-export.ts:445` does unchecked type assertion on Mediabunny target. Could fail silently if target changes.

**Fix:** Add runtime check before assertion.

### 5. Forgetting Cloudflare Workers Host Header
**Reality:** Azure Speech API requires explicit `Host` header in Cloudflare environment.

**File:** `src/routes/api/tts/+server.ts` - Header correctly set.

### 6. Breaking XML Escaping in SSML
**Reality:** User text embedded in SSML XML without escaping = potential injection. Function exists to fix this.

**File:** Check TTS handler for `escapeXml()` or equivalent.

---

## Testing Checklist

### TTS Pipeline
- [ ] Azure Nigerian voice: fast (~3s), clear
- [ ] YarnGPT voice: slow (~30s), natural
- [ ] Error handling: Invalid API key shows helpful message
- [ ] Base64 decoding: Audio plays without skips/artifacts
- [ ] 2000 char limit: Enforced UI-side, rejected server-side if exceeded

### Audiogram Export
- [ ] Image upload: Accepts JPG, PNG; auto-resizes
- [ ] Audio import: Accepts MP3, WAV; waveform renders
- [ ] Composition: Image + audio + waveform sync visually
- [ ] Export Android: MP4 downloads via WebCodecs (no cloud needed)
- [ ] Export iOS: WebM downloads locally (acceptable fallback)
- [ ] Export desktop Chrome: MP4 via WebCodecs
- [ ] Export desktop Firefox: WebM locally

### Edge Cases
- [ ] Very long audio (5+ min): Export doesn't timeout
- [ ] Very large image (10MB+): Upload handles gracefully
- [ ] Slow network: Cloud transcode retries on 404 (api.video timing)
- [ ] Rapid successive exports: No race conditions
- [ ] Browser back button: State preserved (or gracefully cleared)

---

## How to Navigate This Codebase

### For TTS Changes
1. Start: `src/routes/api/tts/+server.ts` (handler)
2. Test: `src/routes/+page.svelte` (UI)
3. Reference: `src/lib/stores.ts` (voice definitions)

### For Audiogram Changes
1. Start: `src/lib/components/AudiogramPage.svelte` (main container)
2. UI logic: Individual panel components (WaveformPanel, TitlePanel, etc.)
3. Rendering: `src/lib/components/CompositionCanvas.svelte` (canvas logic)
4. Composition: `src/lib/utils/compositor.ts` (layer stacking)

### For Export Changes
1. Entry point: `src/lib/utils/video-export.ts:smartExportVideo()`
2. Branch A (WebCodecs): `src/lib/utils/webcodecs-export.ts`
3. Branch B (MediaRecorder): `src/lib/utils/video-export.ts:exportCanvasVideoLegacy()`
4. Branch C (Cloud): `src/routes/api/transcode/+server.ts`

### For Design Changes
1. Colors/spacing: `src/app.css` (CSS variables)
2. Icons: `static/icons/` (SVG files)
3. Components: Individual `.svelte` files (use design tokens)

---

## Debugging Tips

### Export Black Screen
1. Check console for `[WebCodecs]` or `[VideoExport]` logs
2. Verify image is rendering in preview canvas
3. If WebCodecs fails, check `checkWebCodecsSupport()` output
4. On mobile, ensure MediaRecorder fallback triggers

### Audio Not Playing After TTS Generation
1. Check Base64 decoding in `src/routes/+page.svelte:554-560`
2. Verify MIME type is `audio/mp3`
3. Check audio element `loadedmetadata` event fires
4. Check browser console for CORS errors

### Waveform Not Rendering
1. Check audio decode success (AudioContext.decodeAudioData)
2. Verify canvas context available
3. Check `waveform.ts:extractAmplitude()` returns data
4. Verify container has dimensions

---

## Useful References

**Most Helpful:**
- **`docs/CHALLENGES_AND_FIXES.md`** - Consolidated reference for known issues, root causes, and fixes applied (audio pipeline, export reliability, mobile compatibility)

**Deep Dives:**
- **`docs/ARCHITECTURE.md`** - Visual diagrams and data flow
- **`docs/TROUBLESHOOTING.md`** - Quick reference for debugging (TTS, export, mobile-specific issues)

**Historical Context** (see `docs/archive/MANIFEST.md` for full index):
- `EXPORT_TECH_PLAN.md` - Why WebCodecs + Mediabunny was chosen
- `MOBILE_EXPORT_FIX.md` - Diagnostic approach for black-screen issue
- `EXPORT_FIX_IMPLEMENTATION.md` - How the RAF loop fix works
- `AUDIT_REPORT.md` - Performance issues that were fixed
- `ROADMAP.md` - Original implementation roadmap

---

## Phase 2 Future: TTS→Audiogram Integration

**Vision:** Users generate TTS audio, then one-click to create audiogram without manual download/upload cycle.

**Current State:** `preloadedTTSAudio` store exists in `src/lib/stores.ts`, but UI logic not wired up.

**Implementation:** When user clicks "Generate & Create Audiogram" button (future):
1. TTS generates audio, stores in `preloadedTTSAudio` store
2. Auto-switch to Audiogram tab
3. AudioImport component detects preloaded audio on mount
4. Pre-populate waveform visualization

**Files to Modify:** `src/lib/components/AudiogramPage.svelte`, TTS panel component (not yet named)

---

## Questions? Need Clarification?

This document should answer 90% of questions. If not, check:
1. **Architecture**: `docs/ARCHITECTURE.md`
2. **Troubleshooting**: `docs/TROUBLESHOOTING.md`
3. **History**: `docs/archive/` (for why decisions were made)
4. **Code**: Grep for `[WebCodecs]`, `[VideoExport]`, `[TTS]` log prefixes to trace execution

---

**Last Updated:** February 2026  
**Maintainer Notes:** Keep this document updated as new phases complete. Move old docs to archive, don't delete.
