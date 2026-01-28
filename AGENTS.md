# AudioFlam

**Purpose:** Technical reference for AI agents working on AudioFlam.  
**Status:** Production (UI/UX Improvement Phase)  
**Updated:** January 2026

---

## Project Phase

**Current:** Step 14 - Polish & Edge Case Testing - All core features complete. MP4 export working on both desktop and mobile. Final phase focuses on edge cases and UX polish.

**Previous Phases:** ✅ Steps 1-13 Complete - Audiogram creation feature with image, audio, waveform, title, and effects fully implemented.

---

## Overview

**AudioFlam** is a mobile-first web app that converts text scripts into audio using Nigerian TTS voices. Built for journalism training in Nigeria.

- **No auth required** - public URL, hidden from search engines
- **Non-commercial, educational use only**
- **2000 character limit** per generation

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

## Critical Rules

1. **Simplicity first** - single-purpose tool, don't over-engineer
2. **No auth** - no login system
3. **No indexing** - `robots.txt` blocks crawlers
4. **Cloudflare Workers quirk** - Azure requests require explicit `Host` header
5. **Base64 encoding** - use `btoa()` not `Buffer` (Cloudflare compatibility)
6. **XML escaping** - always escape user text before embedding in SSML

---

## Current Development Mission

### Step 14 - Polish & Edge Case Testing

**Status:** ✅ **MP4 EXPORT FIXED** - Ready to move to final polish phase.

**What Was Fixed:**
MediaRecorder on mobile was failing due to tracks not being settled before recording started. Added a 50ms delay before `mediaRecorder.start()` to allow tracks to stabilize. Also implemented mobile-first codec selection (WebM VP8+Opus prioritized over H.264).

**Mobile Test Results (Verified):**
- ✅ Device detection working (correctly identified as Mobile)
- ✅ Canvas stream created with live video track
- ✅ Audio track captured and added successfully
- ✅ WebM codec selected for mobile
- ✅ MediaRecorder started successfully
- ✅ 36-51 chunks captured (5-134KB each)
- ✅ Final blob size: 410KB-1.5MB
- ✅ Export to file works without errors

**Key Implementation:**
- Canvas stream validation with detailed logging
- Track state checking (must be 'live')
- 50ms delay before recording start (critical for mobile)
- Mobile-first codec priority (WebM → H.264)
- Audio element load timeout (5s)
- Comprehensive error logging

**Next Phase:**
1. Clean up diagnostic logs (optional)
2. Test edge cases: very short audio, very long audio, different image ratios
3. Test on desktop browsers
4. Polish UI/UX: loading states, error messages
5. Performance optimization if needed

**Files Modified:**
- `src/lib/utils/video-export.ts` ✅
- `src/lib/components/AudiogramPage.svelte` ✅
- `src/lib/components/CompositionCanvas.svelte` ✅
- `AGENTS.md` ✅
- `MOBILE_EXPORT_FIX.md` (created for reference) ✅
