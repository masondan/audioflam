# AudioFlam

**Purpose:** Technical reference for AI agents working on AudioFlam.  
**Status:** Production (UI/UX Improvement Phase)  
**Updated:** January 2026

---

## Project Phase

**Current:** UI/UX Improvement - Enhancing user experience and visual polish after Cloudflare Pages deployment.

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
- **Endpoint:** `https://yarngpt.ai/api/v1/tts`
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
