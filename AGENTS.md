# AudioFlam - AI Agent Reference

**Purpose:** Single-source-of-truth for AI agents working on AudioFlam
**Status:** Production (TTS + Audiogram + Bulletin + Transcription + Voice Cloning)
**Updated:** August 2026

---

## Quick Start

**What is AudioFlam?** A mobile-first web app that converts text scripts to audio (TTS), creates audiograms (image + audio + waveform + effects + subtitles → MP4), transcribes audio (Whisper), and assembles news bulletins from multiple stories with intro/outro and transitions.

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (TypeScript)
- Cloudflare Pages (hosting)
- Native CSS variables (no Tailwind)
- WebCodecs API (MP4 encoding on Android)
- MediaRecorder fallback (iOS/Firefox → cloud transcoding)
- Whisper (transcription via @huggingface/transformers)
- Subtitle rendering via canvas composition

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
│   ├── +page.svelte              # Header + TTS/Audiogram/Transcribe tabs
│   ├── bulletin/+page.svelte     # Bulletin engine page
│   ├── +layout.svelte            # Root layout
│   └── api/
│       ├── bulletin-script/+server.ts # Gemini script generation (summary/explainer)
│       ├── audio/
│       │   ├── silence-removal/+server.ts # Silence removal
│       │   └── normalize/+server.ts       # Audio normalization (new path)
│       └── normalize/+server.ts   # Audio normalization (legacy/deprecated path - do not use)
├── lib/
│   ├── audioProcessing.ts        # Audio processing utilities (silence, concatenation)
│   ├── stores.ts                 # Voice definitions, app state, preloadedTTSAudio
│   ├── stores/
│   │   └── bulletin.ts           # Bulletin engine state + localStorage persistence
│   ├── components/
│   │   ├── VoiceDropdown.svelte  # Voice selector
│   │   ├── AudiogramPage.svelte  # Main audiogram UI (with subtitles)
│   │   ├── CompositionCanvas.svelte # Canvas preview/export
│   │   ├── ImageCropDrawer.svelte # Image crop overlay
│   │   ├── AudioImport.svelte    # Audio upload + waveform
│   │   ├── Dropdown.svelte       # Reusable dropdown component
│   │   ├── WaveformPanel.svelte  # Waveform settings
│   │   ├── TitlePanel.svelte     # Title text/font/style
│   │   ├── SubtitlePanel.svelte  # Subtitle transcription + styling (audiogram)
│   │   ├── LightEffectPanel.svelte # Bokeh effect controls
│   │   ├── ColorPicker.svelte    # HSB color picker
│   │   ├── TogglePanel.svelte    # Collapsible panel (reusable)
│   │   ├── SpeedSlider.svelte    # Audio speed control
│   │   ├── SpeedSilenceControls.svelte # Speed + silence trim
│   │   ├── SilenceSlider.svelte  # Silence detection
│   │   ├── SpeedBlockModal.svelte # Speed warning modal
│   │   ├── TranscribePage.svelte # Transcription UI (Whisper)
│   │   ├── PlayButton.svelte     # Reusable play/pause button
│   │   └── bulletin/
│   │       ├── BulletinStoryCard.svelte # Story preview card
│   │       ├── BulletinStoryDrawer.svelte # Story editor (text + script generation + TTS)
│   │       ├── BulletinIntroOutroCard.svelte # Intro/outro editor
│   │       ├── BulletinSoundsCard.svelte # Sound selection (intro/outro + transitions)
│   │       └── BulletinAdjustVoiceCard.svelte # Voice speed/silence controls
│   ├── utils/
│   │   ├── compositor.ts         # Canvas layer composition
│   │   ├── recording.ts          # MediaRecorder wrapper
│   │   ├── timestretch.ts        # Audio speed adjustment (SoundTouchJS)
│   │   ├── waveform.ts           # FFT preprocessing + rendering (precomputeFrequencyFrames)
│   │   ├── webcodecs-export.ts   # WebCodecs + Mediabunny (H.264/MP4)
│   │   ├── video-export.ts       # Export orchestration (smartExportVideo)
│   │   ├── subtitles.ts          # Subtitle rendering + word-level composition
│   │   ├── transcription-worker.ts # Whisper worker (off-main-thread)
│   │   └── transcription.ts      # Transcription utilities (Hugging Face)
│   └── server/                   # Server-side utilities
│       ├── audioNormalize.ts     # Audio normalization
│       ├── silenceRemoval.ts     # Silence removal logic
│       └── bulletinPrompts.ts    # Gemini prompt templates (summary/explainer)
├── app.css                       # Global styles + CSS variables
└── app.html                      # HTML template

static/
  ├── icons/                        # SVG icons (includes icon-bulletin.svg)
  ├── fonts/                        # Self-hosted fonts (Inter, Lora, Playfair, Roboto Slab, Saira, Bebas, Oswald)
  ├── voices/                       # Sample voice files (for preview)
  ├── voice-samples/                # Qwen voice clone training samples (Malawi + Zimbabwe)
  ├── sounds/                       # Bulletin intro/outro/transition MP3s
  ├── robots.txt                    # Disallow: / (no indexing)
  └── manifest.json                 # PWA manifest
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
- **Voices:** Adaora (F), Idera (F), Regina (F), Tayo (M), Femi (M)
- **Endpoint:** `https://yarngpt.ai/api/v1.1/tts`
- **Format:** MP3

### Qwen-Audio-TTS Voice Cloning (Africa-First + Welsh) — Migrated August 2026
- **Status:** Migrated from retiring `qwen3-tts-vc-2026-01-22` (HTTP) to `qwen-audio-3.0-tts-flash` (WebSocket). Old models retire October 10, 2026.
- **Speed:** ~5-10 seconds
- **Auth:** Bearer token via `QWEN_SPEECH_KEY` (unchanged — same key works with new models, no new credentials needed)
- **Enrollment model:** `voice-enrollment` (HTTP) — requires a publicly fetchable audio URL, not inline base64
- **Synthesis model:** `qwen-audio-3.0-tts-flash` (WebSocket) — HTTP synthesis is no longer supported for this model family
- **Voices (re-enrolled August 27, 2026):**
  - Malawi: Chisomo (F), Mercy (M)
  - Zimbabwe: Precious (F), Tawanda (M)
  - Wales: Ffion (F), Owain (M)
- **Enrollment endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization` (unchanged host; `model: "voice-enrollment"`, `action: "create_voice"`, response field `output.voice_id`)
- **Synthesis endpoint:** `wss://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference` (WebSocket, not HTTP) — must use workspace-specific domain, not generic dashscope-intl endpoint
- **Synthesis protocol (verified empirically against live API):** `header`/`payload` envelope — client sends `run-task` → server sends `task-started` → client sends `continue-task` (with text) → server streams `result-generated` events (JSON sentence metadata) interleaved with **binary WAV audio frames** → client sends `finish-task` → server sends `task-finished`. Audio is NOT base64-embedded in JSON; it arrives as raw binary WebSocket frames that must be concatenated in order.
- **R2 dependency:** Enrollment requires uploading the prepared WAV to a public URL first. AudioFlam uses a Cloudflare R2 bucket (`audioflam-voice-prep`) with Public Development URL enabled, accessed via S3-compatible API (`aws4fetch` package). Object is deleted immediately after successful enrollment (transient use only).
- **Format:** WAV
- **Text Cleaning:** `cleanForTTS()` preprocesses text before synthesis (em-dashes → commas, ensures sentence punctuation, adds commas after long clauses for natural pacing) — unchanged, still called before synthesis
- **Implementation:** `src/routes/api/tts/+server.ts:handleQwen()` + `synthesizeViaWebSocket()` + `connectQwenWebSocket()` + `cleanForTTS()` utility
- **Cloudflare Workers note:** The global `WebSocket` constructor in Workers doesn't accept custom headers (needed for Bearer auth). `connectQwenWebSocket()` detects the Workers runtime (via `WebSocketPair` presence) and uses the `fetch()` + `Upgrade: websocket` handshake pattern instead; falls back to the standard `WebSocket(url, { headers })` constructor on Node (local dev). **WebSocket quirk:** The `open` event may not fire when using the fetch-based upgrade mechanism. Code detects Cloudflare Workers runtime and sends the initial `run-task` payload immediately after connection acceptance, rather than waiting for an event that may never fire.
- **Old voice IDs cannot be reused:** Voices enrolled under `qwen3-tts-vc-2026-01-22` do NOT work with `qwen-audio-3.0-tts-flash`. All 6 production voices were re-enrolled via `node --env-file=.env scripts/reclone_production_voices.js`.
- **Voice Preparation:** `src/lib/utils/audioPrep.ts` prepares recorded audio for cloning (resampling to 24kHz mono, validation, WAV encoding)

### User Voice Cloning

- **Max clones:** 4 (enforced in UI and stored in localStorage)
- **Storage:** `localStorage` key: `audioflam_custom_voices` (array of CustomVoice)
- **Clone registration:** POST `/api/tts/clone` → DashScope `qwen-voice-enrollment` model
- **Preview script:** `CLONE_PREVIEW_SCRIPT` constant in `src/lib/stores.ts`
- **Preview audio:** Generated at clone time, transcoded to MP3, stored as base64 in localStorage
- **Storage footprint:** ~240–480KB for 4 voices (MP3 format)
- **Dropdown position:** Top of voice list, above all built-in voices
- **Identifier:** Purple ★ (U+2605) in place of country flag
- **Export format:** JSON: `{ voiceName, country, cloneId }`
- **Filename:** `{voicename-lowercase}-voice-clone.json`
- **Import:** File picker → parse JSON → generate preview → transcode to MP3 → add to store
- **Recording duration:** 10–20s required. Auto-stops at 20s. Resets if under 10s.
- **Upload validation:** Reject < 10s. Warn (allow) > 20s.
- **Audio format:** MediaRecorder produces WebM/Opus (or MP4 on iOS), not WAV. Format field must reflect actual blob MIME type.
- **Key files:**
   - [`src/lib/components/VoiceClonePanel.svelte`](src/lib/components/VoiceClonePanel.svelte) — Clone UI
   - [`src/routes/api/tts/clone/+server.ts`](src/routes/api/tts/clone/+server.ts) — Registration + deletion API
   - [`src/lib/stores.ts`](src/lib/stores.ts) — CustomVoice type, customVoices store, MAX_CUSTOM_VOICES, CLONE_PREVIEW_SCRIPT, CLONE_RECORDING_SCRIPT, customVoiceToVoiceOption()
   - [`src/lib/utils/audioPrep.ts`](src/lib/utils/audioPrep.ts) — Audio preparation (resampling, validation, WAV encoding for Qwen)

### API Endpoint: POST `/api/tts`

```json
Request:
{
  "text": "Hello world",
  "voiceName": "qwen-tts-vc-malawi-voice-...",
  "provider": "qwen"
}

Response:
{
  "audioContent": "<base64-encoded WAV>",
  "format": "wav"
}
```

---

## MiniMax Voice Cloning (⚠️ Dead Code - Removal Pending)

**Status:** Non-functional, hidden from UI. Awaiting removal in next development cycle. Location: `src/lib/stores.ts:74-81`, `src/routes/api/tts/+server.ts:20`, `scripts/minimax-*.js`. **Use Qwen3-TTS instead** (working, Africa-first, lower cost).

---

## Audio Processing

### Silence Removal
- **Endpoint:** POST `/api/audio/silence-removal`
- **Levels:** `default`, `trim`, `tight`
- **Input:** Base64-encoded audio
- **Output:** Base64-encoded MP3 + duration metrics
- **File:** `src/lib/server/silenceRemoval.ts`

### Audio Normalization
- **Endpoint:** POST `/api/normalize`
- **Purpose:** Normalize audio levels before export
- **File:** `src/lib/server/audioNormalize.ts`

### Time-Stretching (Speed Control)
- **Library:** SoundTouchJS
- **Function:** `timeStretch(buffer, tempo)` in `src/lib/utils/timestretch.ts`
- **Range:** 0.5x to 2.0x speed
- **Used in:** TTS speed controls, two-speaker mode

---

## Transcription

### Whisper (Primary - Audiogram Subtitles)
- **Model:** OpenAI Whisper (via @huggingface/transformers)
- **Execution:** Web Worker (off-main-thread)
- **Languages:** 99+ (multilingual mode) or English-only (quantized)
- **Quantization:** Optional (smaller model, faster on mobile)
- **Used in:** TranscribePage tab, AudiogramPage subtitle generation

### API
```typescript
// Load model (one-time)
await loadWhisperModel({ multilingualEnabled: true, quantized: true });

// Transcribe audio
const result = await transcribeAudio(audioBlob, {
  multilingualEnabled: true,
  quantized: true,
  language: 'auto' // or ISO 639-1 code
});

// Result includes segments with timestamps
result.segments.forEach(seg => console.log(`[${seg.start}s] ${seg.text}`));

// Release model from memory
await releaseModel();
```

### Files
- `src/lib/components/TranscribePage.svelte` - UI
- `src/lib/utils/transcription.ts` - Main API
- `src/lib/utils/transcription-worker.ts` - Worker thread
- `src/lib/utils/transcription.ts:SUPPORTED_LANGUAGES` - Language list

### Performance
- **First load:** 50-200MB download (model cache)
- **Quantized:** ~100MB, faster on mobile
- **Full:** ~350MB, more accurate
- **Transcription:** 30-120s per minute of audio (device-dependent)

### Deepgram Nova-3 (Alternative - Subtitle Transcription)
- **Speed:** Faster than Whisper for subtitle generation
- **Auth:** API key via `DEEPGRAM_VTT_KEY` env var
- **Endpoint:** POST `/api/transcribe-deepgram`
- **Input:** Audio file (multipart/form-data)
- **Output:** Word-level subtitle segments with timestamps
- **Used in:** SubtitlePanel (audiogram subtitles) as faster alternative to Whisper
- **Features:** Smart formatting, punctuation, sentence-case capitalization, pause detection
- **File:** `src/routes/api/transcribe-deepgram/+server.ts`

---

## Two-Speaker Mode

### Overview
- Compose TTS from two different voices
- Per-speaker speed and silence controls
- Audio merging pipeline
- Works with all three TTS providers (Azure, YarnGPT, Qwen3-TTS)

### Implementation
- **File:** `src/routes/+page.svelte` (lines 88-90, 200+)
- **State:** `twoSpeakerMode`, `speaker1`, `speaker2`, `speaker1Speed`, `speaker2Speed`
- **Audio merge:** `concatenateAudioSegments()` in `src/lib/audioProcessing.ts`
- **UI:** Speaker dropdowns, speed sliders, silence controls

### Workflow
1. Select two voices (speaker1, speaker2) from any provider
2. Generate TTS for each voice separately
3. Apply speed/silence adjustments per speaker
4. Merge audio segments
5. Export as single audiogram

---

## Bulletin Engine

### Overview
- Assemble news bulletins from multiple stories with intro/outro
- Per-story TTS generation with Gemini script generation (summary/explainer)
- Sound selection for intro/outro and transitions between stories
- Full bulletin assembly with audio normalization
- Download as MP3 or add to Audiogram tab

### Implementation
- **Main page:** `src/routes/bulletin/+page.svelte` (1172 lines)
- **Store:** `src/lib/stores/bulletin.ts` (localStorage persistence)
- **API:** `src/routes/api/bulletin-script/+server.ts` (Gemini script generation)
- **Components:**
  - `BulletinStoryCard.svelte` - Story preview with reorder chevrons
  - `BulletinStoryDrawer.svelte` - Story editor (text + script generation + TTS)
  - `BulletinIntroOutroCard.svelte` - Intro/outro text + voice + speed/silence controls
  - `BulletinSoundsCard.svelte` - Sound selection (intro/outro + transitions)
  - `BulletinAdjustVoiceCard.svelte` - Global voice speed/silence controls

### Data Model
```typescript
interface BulletinStory {
  id: string;
  originalText: string;
  script: string;
  scriptActive: boolean;
  scriptLength: 20 | 30 | 60 | 90;
  scriptType: 'summary' | 'explainer';
  ttsAudio: string | null;  // base64 MP3
}

interface BulletinState {
  stories: BulletinStory[];
  selectedVoice: string | null;
  introScript: string;
  outroScript: string;
  introOutroVoice: string;
  introOutroEnabled: boolean;
  introOutroSpeed: number;
  introOutroSilence: 'default' | 'trim' | 'tight';
  soundsEnabled: boolean;
  selectedIntroOutroSound: string | null;
  selectedTransitionSound: string | null;
  introTtsAudio: string | null;
  outroTtsAudio: string | null;
  bulletinAudio: string | null;
  mainVoiceSpeed: number;
  mainVoiceSilence: 'default' | 'trim' | 'tight';
}
```

### Bulletin Assembly Order
```
[intro sound MP3 if selected]
[intro TTS if enabled]
[transition sound if selected]
[story 1 TTS]
[transition sound if selected]
[story 2 TTS]
[transition sound if selected]
[story N TTS]
[transition sound if selected]  ← after last story
[outro TTS if enabled]
[outro sound MP3 if selected]
```

### Key Features
- **Script generation:** Gemini API generates summary or explainer scripts (20/30/60/90 seconds)
- **Story import:** Fetch story text from URL via `/api/fetch-story` (uses Gemini 2.5 Flash to extract article body from HTML)
- **Per-story TTS:** Each story generates audio independently, stored in story object
- **Sound library:** 3 intro/outro sounds + 3 transition sounds (MP3 files in `/sounds/`)
- **Speed/silence controls:** Global controls for all story segments + separate controls for intro/outro
- **Reordering:** Drag chevrons to reorder stories; changes invalidate assembled audio
- **Download:** Save final bulletin as `bulletin.mp3`
- **Add to Audiogram:** Pre-load bulletin audio into Audiogram tab via `preloadedTTSAudio` store

### Key Files
- `src/routes/bulletin/+page.svelte` - Main page + assembly logic
- `src/lib/stores/bulletin.ts` - State + localStorage persistence
- `src/routes/api/bulletin-script/+server.ts` - Gemini script generation
- `src/routes/api/fetch-story/+server.ts` - URL story import (HTML extraction + Gemini parsing)
- `src/lib/server/bulletinPrompts.ts` - Prompt templates
- `src/lib/components/bulletin/*` - UI components

### Status
✅ Fully implemented and working (April 2026)
✅ All checkpoints complete: routing, UI, drawer, script generation, intro/outro, sounds, assembly

---

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
AZURE_SPEECH_KEY=<84-char key>
AZURE_SPEECH_REGION=eastus
YARNGPT_API_KEY=<API key>
QWEN_SPEECH_KEY=<Bearer token for Qwen-Audio-TTS voice cloning>
DEEPGRAM_VTT_KEY=<API key for Deepgram Nova-3 transcription>
R2_ACCOUNT_ID=<Cloudflare account ID for R2>
R2_ACCESS_KEY_ID=<R2 S3-compatible API access key>
R2_SECRET_ACCESS_KEY=<R2 S3-compatible API secret key>
R2_BUCKET_NAME=audioflam-voice-prep
R2_PUBLIC_URL=<R2 Public Development URL, e.g. https://pub-xxxx.r2.dev>
GEMINI_API_KEY=<API key for Gemini 2.5 Flash (bulletin story import + script generation)>
APIVIDEO_API_KEY=<API key for cloud transcoding>
```

**Important:** After updating env vars, deploy to activate.

### Optional (Development)
- Create `.env.local` in project root for local testing
- Never commit `.env.local` to git

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
| `--accent-brand` / `--color-primary` | `#5422b0` | Buttons, active states, brand color |
| `--color-highlight` | `#f0e6f7` | Highlights, hover states |
| `--text-primary` | `#1f1f1f` | Body text, labels |
| `--text-secondary` | `#777777` | Hints, helper text, disabled states |
| `--bg-white` | `#ffffff` | Card backgrounds, surfaces |
| `--bg-main` | `#efefef` | App background |
| `--color-border` | `#e0e0e0` | Dividers, inactive borders |
| `--color-border-active` | `#999999` | Active/focus borders |

### Typography & Spacing

#### Font Family (Self-hosted)
| Token | Value |
|-------|-------|
| `--font-family-base` | Inter (self-hosted), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif |

#### Font Sizes
| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-xs` | 0.75rem (12px) | Captions, metadata |
| `--font-size-sm` | 0.875rem (14px) | Small labels, helper text |
| `--font-size-base` | 1rem (16px) | Body text, inputs, buttons |
| `--font-size-lg` | 1.125rem (18px) | H3, subheadings |
| `--font-size-larger` | 1.25rem (20px) | H2, section titles |
| `--font-size-xl` | 1.5rem (24px) | H1, page titles |

#### Font Weights
| Token | Value | Usage |
|-------|-------|-------|
| `--font-weight-regular` | 400 | Body text, default |
| `--font-weight-medium` | 500 | Buttons, emphasis |
| `--font-weight-semibold` | 600 | Subheadings, form labels |
| `--font-weight-bold` | 700 | Headings, strong emphasis |

#### Line Heights
| Token | Value | Usage |
|-------|-------|-------|
| `--line-height-tight` | 1.2 | Headings (H1, H2, H3) |
| `--line-height-normal` | 1.5 | Body text, paragraphs, inputs |
| `--line-height-relaxed` | 1.8 | Long-form content, descriptions |

#### Spacing (Design System Scale)
| Token | Value | Px Equivalent | Usage |
|-------|-------|--------|-------|
| `--spacing-xs` | 0.375rem | 6px | Tight spacing, icon padding |
| `--spacing-sm` | 0.625rem | 10px | Element padding, gaps between small items |
| `--spacing-md` | 1rem | 16px | Default padding, section margins |
| `--spacing-lg` | 1.25rem | 20px | Vertical spacing, section separators |
| `--spacing-xl` | 1.75rem | 28px | Large gaps, layout-level spacing |

#### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Input fields, small buttons, small containers |
| `--radius-md` | 8px | Most buttons, containers, panels |
| `--radius-lg` | 12px | Cards, larger containers |
| `--radius-xl` | 16px | Modals, largest containers |
| `--radius-round` | 50% | Circular icons, pill buttons, circles |

**Note:** Trim Handle Bar (2px) is an approved exception for visual refinement.

#### Transitions
| Token | Value |
|-------|-------|
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
7. **Audio format consistency** - All responses must include `format: 'mp3'` or `'wav'` field
8. **Robots.txt noindex** - Must remain in `static/robots.txt` (educational use only)
9. **Manifest.json display** - Currently set to `"display": "standalone"`
10. **Text cleaning for Qwen** - Always call `cleanForTTS()` before Qwen synthesis (improves naturalness, preserves author intent)

### Export-Specific Gotchas

- **WebCodecs audio NOT played during export** - Rendering uses pre-computed FFT frames, not live playback
- **Pre-computed frames critical for parity** - `precomputeFrequencyFrames()` must be called before export; determines visual output
- **H.264 requires even dimensions** - Canvas auto-corrected in webcodecs-export.ts (lines 194-196)
- **Canvas copy needed** - Offscreen canvas required to handle dimension correction
- **Audio mono→stereo conversion** - Many mobile AAC encoders reject mono; code converts automatically
- **Mediabunny lazy-load** - Loaded dynamically to keep initial bundle small
- **Type assertions risky** - `webcodecs-export.ts:445` has unchecked type assertion; add guard if changing (KNOWN ISSUE)

### TTS Gotchas

- **YarnGPT slower but native** - Nigerian voices sound more natural but take ~30s (user education needed)
- **Azure faster but slightly accented** - 3s generation but international accent
- **Qwen3-TTS voice cloning** - Africa-first + Welsh voices, 5-10s generation. Text cleaning via `cleanForTTS()` improves naturalness (em-dashes → commas, ensures punctuation, adds pauses for long clauses)
- **Error handling loose** - If API fails, user gets generic "error" message (KNOWN ISSUE)
- **No request throttling** - Users can spam TTS API (KNOWN ISSUE)

### Transcription Gotchas

- **Worker thread isolation** - Transcription runs off-main-thread; UI stays responsive but model loading is slow
- **Model caching** - First transcription downloads 100-350MB; subsequent calls use cache
- **Language detection** - `language: 'auto'` works but may misidentify mixed-language audio
- **Quantized vs full** - Quantized is faster but less accurate; full is slower but better quality

### Audiogram Subtitle Gotchas

- **SubtitlePanel integration** - SubtitlePanel is now part of AudiogramPage only. It transcribes uploaded audio and generates word-level subtitle segments.
- **Subtitle rendering in canvas** - `drawSubtitle()` in `subtitles.ts` renders active subtitle segment based on current playback time.
- **Word-level timing** - Whisper provides word-level timestamps; subtitle composition uses these for frame-accurate rendering.
- **Subtitle styling** - SubtitlePanel controls font, size, color, background, and positioning; changes update canvas preview in real-time.
- **Export with subtitles** - Subtitles are burned into the MP4 during export via canvas composition; no separate subtitle track.

---

## Current Phase Focus

✅ **Completed:**
- TTS with Azure + YarnGPT + Qwen3-TTS voice cloning (single + two-speaker modes)
- Full Audiogram creation (image, audio, waveform, title, effects)
- **Waveform visual parity:** Preview and export waveforms match exactly via pre-computed FFT frames
- MP4 export via WebCodecs (Android)
- MediaRecorder fallback (iOS/Firefox)
- Cloud transcoding via api.video
- **Transcription:** Whisper model (multilingual + quantized options)
- **Audio processing:** Silence removal, normalization, time-stretching
- **Two-speaker mode:** Multi-voice TTS composition with per-speaker controls (all three providers)
- **Subtitles (audiogram):** Whisper-generated word-level subtitles burned into audiogram canvas + export
- **Qwen-Audio-TTS voice cloning:** Malawi (Chisomo F, Mercy M) + Zimbabwe (Precious F, Tawanda M) + Wales (Ffion F, Owain M) voices cloned and integrated ✅ Migrated to qwen-audio-3.0-tts-flash (WebSocket) August 2026, working with text cleaning for naturalness

**Voice Naturalness Improvement (May 2026):**
- `cleanForTTS()` function preprocesses text before Qwen synthesis
- Replaces em-dashes with commas for natural pacing
- Ensures sentence punctuation (`.` `?` `!`)
- Adds commas after unpunctuated clauses ≥8 words for breath points
- Preserves author intent: existing punctuation, CAPS emphasis, ellipsis

**Known Issues:**
- 🔴 Type assertion in `webcodecs-export.ts:445` without runtime guard (HIGH priority)
- 🔴 TTS error handling gaps - generic "error" messages (HIGH priority)
- 🟡 Audio encoding inconsistency between WebCodecs/MediaRecorder paths (MEDIUM)
- 🟡 Missing request throttling for TTS API (MEDIUM)
- 🟡 Canvas export validation gaps (MEDIUM)

**Future Development:**
- TTS→Audiogram one-click integration (store exists, UI not wired)
- Enhanced iOS fallback with better error guidance
- Performance optimization (OffscreenCanvas for preview)
- Fix known issues from QUALITY_REPORT.md

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

**Decision:** Encode audio from AudioBuffer (no playback), use time-based frame rendering with pre-computed FFT data

**Why:** Guarantees smooth 24fps export without competing for CPU with Web Audio playback

**Implementation:** 
- `precomputeFrequencyFrames()` pre-computes FFT for entire audio before export starts
- `renderFrame(currentTime)` callback retrieves pre-computed frame by index instead of generating synthetic data
- Eliminates visual mismatch: export now uses same frequency data as live preview (AnalyserNode-compatible format)
- Uses Cooley-Tukey FFT with Blackman windowing for spectral accuracy

---

## Common Pitfalls for Agents

1. **MediaRecorder H.264 on Android** - Claims support but fails. Always check WebCodecs first.

2. **Audio MIME type field** - All TTS responses must include `format: 'mp3'` or `'wav'`. (`src/routes/api/tts/+server.ts`)

3. **Mono audio in WebCodecs** - AAC rejects mono; code auto-converts to stereo. (`webcodecs-export.ts:277-294`)

4. **Type assertions without guards** - `webcodecs-export.ts:445` has unchecked assertion. (KNOWN ISSUE)

5. **Azure Host header** - Cloudflare Workers need explicit `Host` header. (`src/routes/api/tts/+server.ts`)

6. **XML escaping in SSML** - User text must be escaped to prevent injection. Check `escapeXml()` function.

7. **Blocking main thread** - Transcription must run in Web Worker. Use `getWorker()` + `workerRequest<T>()`. (`src/lib/utils/transcription.ts`)

8. **Forgetting to release model** - Call `releaseModel()` when done to free 100-350MB RAM.

9. **Waveform animation sync** - WebCodecs (no playback) and MediaRecorder (with playback) need different timing. Use `currentTime` parameter in `renderFrame()`. (`src/lib/utils/compositor.ts`)

10. **Two-speaker audio merge** - Must explicitly call `concatenateAudioSegments()` after generating both voices. (`src/lib/audioProcessing.ts`)

11. **Bulletin story audio** - TTS audio stored as base64 in `BulletinStory.ttsAudio`. Must include in save logic. (`BulletinStoryDrawer.svelte:saveStory()`)

12. **Bulletin assembly order** - Intro/outro/transition sounds must concatenate in exact order. Reordering stories invalidates audio. (`src/routes/bulletin/+page.svelte:generateBulletin()`)

13. **Gemini rate limits** - Script generation has no throttling. Users spamming requests will fail. (`src/routes/api/bulletin-script/+server.ts`)

14. **Subtitle styling not persisted** - SubtitlePanel styling lost on reload (only segments saved). (`src/lib/components/SubtitlePanel.svelte`)

---

## Testing Checklist

**TTS Pipeline**
- Azure voice: ~3s, clear
- YarnGPT voice: ~30s, natural Nigerian
- Qwen3-TTS voice: 5-10s, Malawi/Zimbabwe/Wales
- Text cleaning: em-dashes→commas, punctuation, long clause breaks
- Error handling: Helpful message on invalid API key
- Base64 decoding: No skips/artifacts
- 2000 char limit: UI + server enforced

**Audiogram Export**
- Image upload: JPG/PNG, auto-resize
- Audio import: MP3/WAV, waveform renders
- Image + audio + waveform: Visual sync in preview
- Android: MP4 via WebCodecs
- iOS: WebM locally
- Desktop Chrome: MP4 via WebCodecs
- Desktop Firefox: WebM

**Edge Cases**
- Long audio (5+ min): Export doesn't timeout
- Large image (10MB+): Handles gracefully
- Slow network: Cloud transcode retries
- Rapid exports: No race conditions

---

## Navigating the Codebase by Task

### Getting Started
1. Read AGENTS.md for complete overview
2. Review "Critical Rules & Gotchas"
3. Review "Common Pitfalls for Agents"
4. Check "Known Issues" under "Current Phase Focus"

### TTS Changes
- Handler: `src/routes/api/tts/+server.ts`
- Voice definitions: `src/lib/stores.ts`
- UI: `src/routes/+page.svelte`
- **Important:** Call `cleanForTTS()` before Qwen synthesis

### Audiogram Changes
- Main: `src/lib/components/AudiogramPage.svelte`
- Canvas: `src/lib/components/CompositionCanvas.svelte`
- Composition: `src/lib/utils/compositor.ts`
- Subtitles: `src/lib/utils/subtitles.ts`

### Bulletin Engine
- Page: `src/routes/bulletin/+page.svelte` (1172 lines)
- Store: `src/lib/stores/bulletin.ts`
- Story editor: `src/lib/components/bulletin/BulletinStoryDrawer.svelte`
- Script API: `src/routes/api/bulletin-script/+server.ts`

### Export Pipeline
- Entry: `src/lib/utils/video-export.ts:smartExportVideo()`
- WebCodecs: `src/lib/utils/webcodecs-export.ts`
- MediaRecorder: `src/lib/utils/video-export.ts:exportCanvasVideoLegacy()`
- Cloud: `src/routes/api/transcode/+server.ts`

### Transcription
- UI: `src/lib/components/TranscribePage.svelte`
- API: `src/lib/utils/transcription.ts`
- Worker: `src/lib/utils/transcription-worker.ts`
- Model: `@huggingface/transformers` (Whisper)

### Audio Processing
- Silence removal: `src/lib/server/silenceRemoval.ts`
- Normalization: `src/lib/server/audioNormalize.ts`
- Time-stretching: `src/lib/utils/timestretch.ts`
- Utilities: `src/lib/audioProcessing.ts`

### Design/CSS
- Variables: `src/app.css`
- Icons: `static/icons/`
- Fonts: `static/fonts/`

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
3. Check `waveform.ts:precomputeFrequencyFrames()` generates data (FFT computation)
4. Verify container has dimensions
5. Check preview vs export mismatch: are pre-computed frames being passed to export pipeline?

### Video Subtitle Export Issues
1. Check console for `[VideoExport]` or `[WebCodecs]` logs
2. Verify video upload succeeded: `videoBlob !== null` and dimensions set
3. Check canvas context available and dimensions match video
4. If frame render fails: verify `ctx.drawImage(videoElement)` supported on device
5. If subtitle not appearing: check `subtitleSegments` populated and `subtitlesEnabled === true`
6. If trim not working: verify trim handles dragging updates `trimStart`/`trimEnd` ratios
7. If export black screen: check if iOS Safari—fallback to MediaRecorder/cloud transcode automatic

---

## Reference Documents

### For Historical Context & Design Decisions
- **`/docs/archive/bulletin-plan.md`** - Bulletin engine implementation checkpoints
- **`/docs/archive/EXPORT_TECH_PLAN.md`** - Why WebCodecs + Mediabunny architecture
- **`/docs/archive/EXPORT_FIX_IMPLEMENTATION.md`** - RAF loop decoupling for export stuttering fix

---

## Agent Guidance

**This file (AGENTS.md) is your primary reference. It should answer 90% of questions:**

- **How does AudioFlam work?** → Read relevant section above
- **How do I implement X?** → See "Navigating the Codebase by Task" section
- **I'm stuck on an issue** → Check "Debugging Tips" above, then "Known Issues" under "Current Phase Focus"
- **Why was decision Y made?** → Check "Architecture Decision Log" above, then `/docs/archive/` for historical context

**For code tracing:** Grep for log prefixes: `[WebCodecs]`, `[VideoExport]`, `[TTS]`, `[Transcription]`

---

## Future Development: TTS→Audiogram Integration

**Vision:** Users generate TTS audio, then one-click to create audiogram without manual download/upload cycle.

**Current State:** `preloadedTTSAudio` store exists in `src/lib/stores.ts`, but UI logic not wired up.

**Implementation:** When user clicks "Generate & Create Audiogram" button (future):
1. TTS generates audio, stores in `preloadedTTSAudio` store
2. Auto-switch to Audiogram tab
3. AudioImport component detects preloaded audio on mount
4. Pre-populate waveform visualization

**Files to Modify:** `src/lib/components/AudiogramPage.svelte`, TTS panel component (not yet named)

---

## When Stuck

1. Check console for log prefixes: `[WebCodecs]`, `[VideoExport]`, `[TTS]`, `[Transcription]`
2. Review "Debugging Tips" section above
3. Review "Common Pitfalls for Agents" section for similar issues
4. Check "Known Issues" under "Current Phase Focus"
5. Search `/docs/archive/` for historical context on design decisions

---

## Manifest & PWA Configuration Brief

Objectives:
- Remove unwanted "Install App?" prompts when launching sub-apps from FlamTools
- Remove browser chrome (header/close button/URL bar) when app is open
- Ensure proper sharing metadata (OG tags) for social media & messaging apps

### Manifest.json Checklist

Manifest location: `static/manifest.json` (served at `/manifest.json` via SvelteKit static folder)

Each app must have static/manifest.json with:

```json
{
  "name": "[AppName]",
  "short_name": "[AppName]",
  "description": "[Brief description]",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#5422B0",
  "theme_color": "#5422B0",
  "scope": "/",
  "icons": [
    {
      "src": "/[icons-or-logos]/[app-icon].png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/[icons-or-logos]/[app-maskable].png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Key settings:**
- `"display": "standalone"` — removes browser chrome when installed
- `"scope": "/"` — ensures proper PWA scope
- `"theme_color"` & `"background_color"` — both should be `#5422B0`
- `maskable` icon — for adaptive icon support on Android

### Meta Tags (in `<head>` or `app.html`)

Verify these exist:

```html
<meta name="theme-color" content="#5422B0" />
<meta name="description" content="[Description]" />

<!-- Open Graph (for sharing) -->
<meta property="og:title" content="[AppName]" />
<meta property="og:description" content="[Description]" />
<meta property="og:image" content="https://[app].flamtools.com/[icons-or-logos]/[og-image].png" />
<meta property="og:type" content="website" />

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:title" content="[AppName]" />
<meta property="twitter:image" content="https://[app].flamtools.com/[icons-or-logos]/[og-image].png" />

<!-- Search engines (training/non-commercial apps) -->
<meta name="robots" content="noindex, nofollow" />
```

### Deployment Checklist

- [ ] Manifest.json located at `static/manifest.json`
- [ ] Manifest.json has `"display": "standalone"`
- [ ] Manifest.json has `"scope": "/"`
- [ ] Both `theme_color` & `background_color` set to `#5422B0`
- [ ] Icons referenced exist and are correct paths (check icon folder structure—may be `/icons/` or `/logos/`)
- [ ] Meta tags in head include `theme-color`, OG tags, Twitter tags
- [ ] `<meta name="robots" content="noindex, nofollow" />` present in `<head>` (required for all training/non-commercial apps)

### After Completion

**Update AGENTS.md:** Add notes about any app-specific icon paths or manifest peculiarities to the "Manifest & PWA Configuration" section for future reference.

---

**Last Updated:** September 2026
**Maintainer Notes:** Keep this document concise and current. Move outdated docs to archive. Update .clinerules when AGENTS.md changes significantly.

---

## Orphaned Components (Not Used in AudioFlam)

### VideoSubtitlePage.svelte
- **Status:** 1420-line component for video subtitle overlay + export
- **Location:** `src/lib/components/VideoSubtitlePage.svelte`
- **Usage:** Not imported anywhere in AudioFlam routing
- **Context:** Built for VideoFlam (separate app), left in AudioFlam codebase
- **Action:** Flag for removal or migration to VideoFlam repo

### Unused API Endpoints
- **`/api/audio/extract`** — Server-side video audio extraction (returns 501 "not implemented"). Recommends client-side MP4 extraction or MP3/WAV upload instead.
- **`/api/gemini-test`** — Development/test endpoint, not used in production

