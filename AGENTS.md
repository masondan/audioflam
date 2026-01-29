# AudioFlam

**Purpose:** Technical reference for AI agents working on AudioFlam.  
**Status:** Production (Step 15 - Smart Export & Polish Phase)  
**Updated:** January 2026

---

## Project Overview

**AudioFlam** is a mobile-first web app combining two features:

1. **TTS Conversion:** Text scripts → audio (Nigerian/British English voices)
2. **Audiogram Creation:** Image + audio + waveform + title + effects → MP4 video

Built for journalism training in Nigeria. Non-commercial, educational use only.

- **No auth required** - public URL, hidden from search engines
- **2000 character limit** per TTS generation
- **Dual-tab interface:** Toggle between TTS and Audiogram creation

---

## Current Project Phase

**Phase:** Step 15 - Smart Export & UX Polish  
**Status:** 🎯 MP4 export working on Android and desktop. Polish and edge cases remaining.

**What's Complete:**
- ✅ TTS: Azure Speech + YarnGPT integration
- ✅ Audiogram: Full creation pipeline (image, audio, waveform, title, effects)
- ✅ MP4 Export: WebCodecs-based (native mobile support) + MediaRecorder fallback
- ✅ WebCodecs support detection with intelligent fallback strategy

**Current Focus:**
- Edge case testing and UX polish
- Ensure smooth export experience across browsers
- Potential Phase 2: iOS fallback (Cloudinary/api.video transcoding)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit 2 + Svelte 5 (TypeScript) |
| Styling | Native CSS variables (no Tailwind) |
| Hosting | Cloudflare Pages |
| TTS Providers | Azure Speech (fast ~3s), YarnGPT (native Nigerian ~30s) |

---

## Commands

```bash
npm run dev        # Local development
npm run build      # Production build
npm run check      # TypeScript/Svelte checks
```

---

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Header + TTS/Audiogram tab switching
│   ├── +layout.svelte            # Root layout
│   └── api/
│       └── tts/
│           └── +server.ts        # TTS API endpoint (Azure + YarnGPT)
├── lib/
│   ├── stores.ts                 # Voice definitions, app state, audiogram state
│   ├── components/
│   │   ├── VoiceDropdown.svelte  # Voice selector
│   │   ├── Dropdown.svelte       # Generic dropdown
│   │   ├── AudiogramPage.svelte  # Main audiogram container
│   │   ├── ImageUpload.svelte    # Image upload & display
│   │   ├── ImageCropDrawer.svelte # Full-screen image crop overlay
│   │   ├── AudioImport.svelte    # Audio upload/record + waveform
│   │   ├── CompositionCanvas.svelte # Canvas preview + export rendering
│   │   ├── TogglePanel.svelte    # Reusable collapsible panel
│   │   ├── WaveformPanel.svelte  # Waveform style/color options
│   │   ├── TitlePanel.svelte     # Title text/font/style options
│   │   ├── LightEffectPanel.svelte # Bokeh effect opacity/speed
│   │   └── ColorPicker.svelte    # HSB color picker
│   └── utils/
│       ├── waveform.ts           # Waveform amplitude extraction + rendering
│       ├── recording.ts          # MediaRecorder wrapper
│       ├── compositor.ts         # Canvas layer composition (image, waveform, title, effects)
│       └── video-export.ts       # FFmpeg.wasm wrapper, MP4 encoding
├── app.css                       # Global styles, CSS variables
└── app.html                      # HTML template

static/
├── icons/                        # App icons (22 total for audiogram)
└── robots.txt                    # Disallow: / (no indexing)
```

---

## TTS Providers

### Azure Speech (recommended)
- **Speed:** ~3 seconds
- **Auth:** Subscription key via `Ocp-Apim-Subscription-Key` header
- **Critical:** Must include `Host` header in Cloudflare Workers
- **Nigerian English Voices:**
  - `en-NG-AbeoNeural` (male)
  - `en-NG-EzinneNeural` (female)
- **British English Voices:**
  - `en-GB-OllieNeural` (male)
  - `en-GB-RyanNeural` (male)
  - `en-GB-AbbiNeural` (female)
  - `en-GB-BellaNeural` (female)
  - `en-GB-HollieNeural` (female)
  - `en-GB-OliverNeural` (male)
  - `en-GB-SoniaNeural` (female)

### YarnGPT
- **Voices:** 4 native Nigerian voices
  - Female: Idera, Regina
  - Male: Tayo, Femi
- **Speed:** ~30 seconds
- **Auth:** Bearer token
- **Endpoint:** `https://yarngpt.ai/api/v1.1/tts`
- **Format:** MP3

---

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
AZURE_SPEECH_KEY=<84-char Azure Speech key>
AZURE_SPEECH_REGION=eastus
YARNGPT_API_KEY=<YarnGPT API key>
```

**Important:** After updating env vars, trigger a new deployment.

---

## API Endpoint

`POST /api/tts`

**Request:**
```json
{
  "text": "Hello world",
  "voiceName": "en-NG-AbeoNeural",
  "provider": "azure"
}
```

**Response:**
```json
{
  "audioContent": "<base64-encoded MP3>",
  "format": "mp3"
}
```

---

## Design System

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` / `--color-indigo-bloom` | `#5422b0` | Buttons, active states |
| `--color-lavender-veil` | `#f0e6f7` | Highlights |
| `--color-text-primary` | `#333333` | Body text |
| `--color-text-secondary` | `#777777` | Hints, labels |
| `--color-white` / `--color-surface` | `#ffffff` | Cards, surfaces |
| `--color-app-bg` / `--color-background` | `#efefef` | App background |
| `--color-border` | `#e0e0e0` | Light borders |
| `--color-border-dark` | `#777777` | Dark borders |

### Typography & Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--font-family-base` | Inter, sans-serif | All text |
| `--font-size-xs` | 0.75rem | Small labels |
| `--font-size-sm` | 0.875rem | Helper text |
| `--font-size-base` | 1rem | Body text |
| `--font-size-lg` | 1.125rem | Headings |

### Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | 4px | Tight spacing |
| `--spacing-sm` | 8px | Compact spacing |
| `--spacing-md` | 16px | Default spacing |
| `--spacing-lg` | 24px | Generous spacing |
| `--spacing-xl` | 32px | Extra large spacing |
| `--radius-sm` | 4px | Small corners |
| `--radius-md` | 8px | Default corners |
| `--radius-lg` | 12px | Larger corners |
| `--radius-full` | 9999px | Pill shape |

### Effects

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | 0 1px 2px 0 rgb(0 0 0 / 0.05) | Subtle elevation |
| `--shadow-md` | 0 4px 6px -1px rgb(0 0 0 / 0.1) | Standard elevation |
| `--shadow-lg` | 0 10px 15px -3px rgb(0 0 0 / 0.1) | High elevation |
| `--transition-fast` | 150ms ease | UI animations |
| `--transition-normal` | 200ms ease | Standard transitions |

**Typography:** Inter (Google Fonts)

---

## Future Development: Phase 2 - iOS Fallback & TTS→Audiogram Integration

### iOS MP4 Export Fallback

**Context:** iOS Safari and Firefox don't support WebCodecs H.264 encoding natively. For Phase 2, we'll add cloud-based transcoding:

**Recommended Approach: Cloudflare Worker → api.video**
- Export WebM locally (works everywhere) → Upload to api.video via Cloudflare Worker
- Cost: Free encoding + ~$0.003/video for storage/delivery (~$0.60/year for 200 videos)
- Better than Cloudinary (cheaper, free encoding)
- Cloudflare Worker acts as proxy to avoid CORS issues

**Implementation Pattern:**
```typescript
// Browser-side: Check WebCodecs support
if (support.hasH264) {
  // Fast path: Use WebCodecs MP4
  return exportWithWebCodecs(config);
} else {
  // Fallback: Export WebM, upload to cloud
  const webmBlob = await exportCanvasVideoLegacy(config);
  return await transcodeViaWorker(webmBlob);
}
```

### TTS→Audiogram Integration (Smart Audio Import)

**Vision:** Allow users to generate TTS audio, then seamlessly push it into the Audiogram creation tab without manual download/upload.

**Current Flow:** TTS page → download MP3 → return to Audiogram → manually upload

**Future Flow:** TTS page → "Create Audiogram" button → auto-load into Audiogram tab

**Implementation Strategy:**
1. Add `createAudiogramWithTTS()` action that:
   - Takes generated audio buffer from TTS
   - Switches to Audiogram tab
   - Auto-populates audio in AudioImport component
   - Pre-generates waveform visualization
   
2. Store audio state in global store (`stores.ts`):
   - `lastGeneratedAudio: AudioBuffer | null`
   - `lastGeneratedVoice: string`
   
3. AudioImport component checks for pre-loaded audio on mount:
   ```typescript
   onMount(() => {
     const preloaded = get(generatedAudioStore);
     if (preloaded) {
       audioBuffer = preloaded;
       renderWaveform();
       clearPreloadedAudio();
     }
   });
   ```

4. Workflow improvements:
   - Show "Generate & Create Audiogram" button variant in TTS
   - Auto-switch tabs after TTS generation
   - Preserve audio quality through the pipeline
   - Keep MediaRecorder recording option available

**Files to Modify:**
- `src/lib/stores.ts` - Add audio preload state
- `src/routes/+page.svelte` - Tab switching logic for seamless UX
- `src/lib/components/TtsPanel.svelte` (or equivalent) - Add quick-action button
- `src/lib/components/AudioImport.svelte` - Check for preloaded audio

**Benefits:**
- Dramatically improves user experience (one-click workflow)
- Keeps both TTS and Audiogram as independent features
- Maintains flexibility (users can still record audio directly)
- No backend changes required

---

## Critical Rules

1. **Simplicity first** - single-purpose tool, don't over-engineer
2. **No auth** - no login system
3. **No indexing** - `robots.txt` blocks crawlers
4. **Cloudflare Workers quirk** - Azure requests require explicit `Host` header
5. **Base64 encoding** - use `btoa()` not `Buffer` (Cloudflare compatibility)
6. **XML escaping** - always escape user text before embedding in SSML

---

## MP4 Export Implementation

### The Challenge
Mobile browsers (especially Android Chrome) return `true` for `MediaRecorder.isTypeSupported('video/mp4')` but fail when actually trying to encode H.264. This caused black-screen exports and silent failures on devices representing ~85% of user base.

### The Solution: WebCodecs + Mediabunny (Phase 1 - COMPLETE)

Instead of relying on MediaRecorder's unreliable H.264 support, we:

1. **Detect availability** - Check if WebCodecs API + H.264 encoder available
2. **Encode directly** - Use WebCodecs `VideoEncoder` (H.264) + `AudioEncoder` (AAC)
3. **Mux to MP4** - Use Mediabunny library (17KB) to write MP4 container
4. **Fallback gracefully** - Use MediaRecorder for iOS/Firefox (produces WebM)

**Smart Export Pipeline:**
```
Export Button → checkWebCodecsSupport()
├── WebCodecs + H.264 available (85% Android, Chrome Desktop)
│   └── exportWithWebCodecs() → MP4 file direct to user
└── WebCodecs unavailable (iOS Safari, Firefox)
    └── exportCanvasVideoLegacy() → WebM (MediaRecorder fallback)
```

### Key Implementation Details

**Frame Capture Redesign (took multiple iterations to fix):**
- Problem: Initial approach had external render loop start/stop callbacks
- Solution: Moved RAF render loop **inside** `exportCanvasVideo()` 
- Result: Tight coupling ensures frames actively rendering when MediaRecorder starts
- Impact: Fixed black-screen on mobile, eliminated frame delivery gaps

**Audio Handling:**
- WebCodecs: Uses decoded AudioBuffer directly (no playback needed during export)
- Mediabunny: Mono audio converted to stereo (AAC encoder compatibility)
- Audio trimmed to match video duration exactly
- Bitrate: 96 kbps stereo AAC (good quality, widely supported)

**H.264 Configuration:**
- Uses conservative codec profile: `avc1.42001f` (Baseline profile, level 3.1)
- Tests multiple profiles for maximum device compatibility
- Canvas dimensions auto-corrected to even numbers (H.264 requirement)
- 15 fps for mobile (lower CPU load), 30 fps for desktop
- 2 Mbps video bitrate (balanced quality/file size for mobile)

**Files Involved:**
- `src/lib/utils/webcodecs-export.ts` - WebCodecs + Mediabunny encoding engine
- `src/lib/utils/video-export.ts` - Smart export orchestration + MediaRecorder fallback
- `src/lib/components/AudiogramPage.svelte` - Export button integration
- `src/lib/components/CompositionCanvas.svelte` - Canvas rendering export

**Key Functions:**
- `checkWebCodecsSupport()` - Feature detection (returns codec availability)
- `exportWithWebCodecs(config)` - MP4 encoding via Mediabunny
- `smartExportVideo()` - Intelligent method selection + fallback
- `exportCanvasVideoLegacy()` - MediaRecorder with decoupled render loop

### Browser Support
| Browser | Method | Output |
|---------|--------|--------|
| Chrome Android | WebCodecs | MP4 ✅ |
| Chrome Desktop | WebCodecs | MP4 ✅ |
| Safari iOS | MediaRecorder | WebM ⚠️ |
| Firefox | MediaRecorder | WebM ⚠️ |

### Performance
- MP4 export: 10-30 seconds for 60-second video (depends on device)
- Mobile: 15 fps encoding (low CPU burden)
- Desktop: 30 fps encoding (full quality)
- Progress feedback via onProgress callback
