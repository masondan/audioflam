# AudioFlam v1.0

**Purpose:** Complete technical reference for AI agents implementing AudioFlam.
**Audience:** Code leads, developers, AI agents
**Status:** In Development
**Last Updated:** December 2025

---

## 1. Project Overview

**AudioFlam** is a minimalist, mobile-first web app for converting text/scripts into mini-podcasts.
-   **Target Audience:** Journalists in training (specifically Nigeria).
-   **Core Function:** High-quality Text-to-Speech (TTS) using Google Cloud API.
-   **Key Constraint:** Non-commercial, educational use only. No user login required (public URL but hidden/no-index).
-   **Primary Languages:** Nigerian English (`en-NG`).
    -   *Note: Hausa and Yoruba are currently unavailable in Azure Standard Tier.*

## 2. Tech Stack

-   **Framework:** SvelteKit (Typescript)
-   **Styling:** Native CSS Variables & Token System (mirrors NewsLab aesthetic).
    -   *No Tailwind* (unless explicitly requested for overrides, but core system is custom CSS).
-   **Hosting:** Cloudflare Pages adapter.
-   **API:** Azure AI Speech (via server-side API route).
-   **State Management:** Svelte Stores (`src/lib/stores.ts`).

## 3. Design System

**Aesthetic:** "Premium Minimalist" - Vibrant but clean.
**Typography:** Inter (Google Fonts).

### Color Palette
| Name | Hex | Usage |
| :--- | :--- | :--- |
| **Indigo Bloom** | `#5422b0` | Primary Brand Color, Buttons, Active States |
| **Lavender Veil** | `#f0e6f7` | Highlights, Secondary Backgrounds |
| **Text Primary** | `#333333` | Headings, Body Text |
| **Text Secondary** | `#777777` | Subtitles, Hints |
| **Modal/App Bg** | `#efefef` | App Backgrounds |
| **White** | `#ffffff` | Card Backgrounds |

### Icons
-   Stored in `static/icons/`.
-   **Logo:** `logo-audioflam-maskable.png`
-   **Splash Overlay:** `logo-audioflam-white-trans.png`

## 4. Code Structure

```text
/
├── src/
│   ├── routes/
│   │   ├── +page.svelte        # Splash Screen
│   │   ├── app/                # Main App Interface
│   │   │   └── +page.svelte
│   │   └── api/
│   │       └── tts/
│   │           └── +server.ts  # Azure Speech Proxy
│   ├── lib/
│   │   ├── components/         # UI Components
│   │   ├── server/             # Server-only logic (Google Auth)
│   │   └── stores.ts           # State
│   └── app.html
├── static/
│   ├── icons/
│   └── robots.txt              # User-agent: * Disallow: /
└── AGENTS.md                   # This file
```

## 5. Development Phases

1.  **Phase 1: Foundation** (Current)
    -   Scaffold SvelteKit.
    -   Implement Design System (CSS).
    -   Setup Azure Speech integration.
2.  **Phase 2: Core UI**
    -   Language Selector.
    -   Voice Selector.
    -   Text Input.
    -   Audio Player & Download.
3.  **Phase 3: Refinement**
    -   SSML Controls (Speed, Break, Pitch).
    -   Splash Screen & Transitions.
4.  **Phase 4: Optimization**
    -   Mobile responsiveness.
    -   PWA Manifest.

## 6. Critical Rules for Agents

1.  **Simplicity First:** Do not over-engineer. This is a single-purpose tool.
2.  **No Auth:** There is no login system.
3.  **No Indexing:** Ensure `robots.txt` blocks all crawlers.
4.  **Aesthetics:** If it looks basic, it fails. Use the color palette to create a "wow" factor.
