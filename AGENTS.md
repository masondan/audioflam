# AudioFlam

**Purpose:** Technical reference for AI agents working on AudioFlam.  
**Status:** Production  
**Updated:** January 2026

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
│   ├── +page.svelte              # Splash screen
│   ├── +layout.svelte            # Root layout
│   ├── app/
│   │   └── +page.svelte          # Main TTS interface
│   └── api/
│       └── tts/
│           └── +server.ts        # TTS API endpoint (Azure + YarnGPT)
├── lib/
│   ├── stores.ts                 # Voice definitions, app state
│   └── components/
│       ├── VoiceDropdown.svelte  # Voice selector
│       └── Dropdown.svelte       # Generic dropdown
├── app.css                       # Global styles, CSS variables
└── app.html                      # HTML template

static/
├── icons/                        # App icons, logos
└── robots.txt                    # Disallow: / (no indexing)
```

---

## TTS Providers

### Azure Speech (recommended)
- **Voices:** `en-NG-AbeoNeural` (male), `en-NG-EzinneNeural` (female)
- **Speed:** ~3 seconds
- **Auth:** Subscription key via `Ocp-Apim-Subscription-Key` header
- **Critical:** Must include `Host` header in Cloudflare Workers

### YarnGPT
- **Voices:** 16 native Nigerian voices (Idera, Chinenye, Jude, etc.)
- **Speed:** ~30 seconds
- **Auth:** Bearer token

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

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#5422b0` | Buttons, active states |
| `--color-lavender-veil` | `#f0e6f7` | Highlights |
| `--color-text-primary` | `#333333` | Body text |
| `--color-text-secondary` | `#777777` | Hints, labels |
| `--color-white` | `#ffffff` | Cards |

**Typography:** Inter (Google Fonts)

---

## Critical Rules

1. **Simplicity first** - single-purpose tool, don't over-engineer
2. **No auth** - no login system
3. **No indexing** - `robots.txt` blocks crawlers
4. **Cloudflare Workers quirk** - Azure requests require explicit `Host` header
5. **Base64 encoding** - use `btoa()` not `Buffer` (Cloudflare compatibility)
6. **XML escaping** - always escape user text before embedding in SSML
