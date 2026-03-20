# FlamTools Codebase Review & Refactoring Strategy
**Created:** March 20, 2026  
**Scope:** PromptFlam, PicFlam, AudioFlam, ChartFlam, MapFlam  
**Status:** Complete Analysis

---

## Executive Summary

| App | Tech Stack | Quality | Design System | Refactor Priority |
|-----|-----------|---------|----------------|--------------------|
| **PromptFlam** | SvelteKit 2 + Svelte 5 (JS) | **High** | Mature CSS vars | Low - Excellent |
| **PicFlam** | SvelteKit 2 + Svelte 5 (JS) | **Medium** | Comprehensive design docs | Medium - Fix inconsistencies |
| **AudioFlam** | SvelteKit 2 + Svelte 5 (TS) | **High** | Mature CSS vars | Low - Well-documented |
| **ChartFlam** | Vanilla JS/HTML/CSS (No framework) | **Medium** | Functional but basic | **High** - Monolithic architecture |
| **MapFlam** | Vite + Svelte 5 (TS, no SvelteKit) | **Medium** | Basic CSS vars | Medium - Schema architecture |

### Key Findings

**Architecture:**
- ✅ 4/5 apps are SvelteKit-based; 1 is vanilla JS, 1 is pure Vite+Svelte
- ✅ All use CSS custom properties (no Tailwind)
- ✅ All target Cloudflare Pages (consistent deployment)
- ⚠️ Design systems overlap but not shared (duplicated token definitions)
- ⚠️ State management patterns vary widely (localStorage vs Svelte stores vs mixed)

**Code Duplication:**
- **High:** Image utilities, audio processing, export/download helpers appear in multiple apps
- **Medium:** Form validation, API error handling, localStorage persistence
- **Low:** Core business logic (intentionally isolated per app)

**Recommended Refactoring:** **Phased, Low-Risk Approach**
1. **Phase 1 (Weeks 1-2):** Shared design system package (@flamtools/design)
2. **Phase 2 (Weeks 3-4):** Shared utilities package (@flamtools/utils)
3. **Phase 3 (Weeks 5-6):** Migrate ChartFlam & MapFlam to consistent patterns
4. **Phase 4 (Optional):** Consolidate to monorepo or leave as-is

---

## Detailed App Analysis

### 1. **PromptFlam** (Most Used)
**URL:** https://github.com/masondan/PromptFlam  
**Tech:** SvelteKit 2 + Svelte 5, Vanilla JavaScript (no TypeScript)  
**Status:** Excellent condition

#### Architecture
```
src/
├── routes/
│   ├── +page.svelte           # Main chat/notes/archive UI
│   └── +layout.svelte         # Header + nav
├── lib/
│   ├── stores.js              # 383 lines - localStorage-backed Svelte stores
│   ├── icons.js               # Icon definitions
│   ├── utils/
│   │   └── formatTime.js      # Timestamp formatting
│   └── components/            # ~20 Svelte components
│       ├── ChatMessage.svelte
│       ├── PromptCard.svelte
│       ├── PromptLibrary.svelte
│       ├── Header.svelte
│       └── [11 more components]
├── app.css                    # 211 lines - CSS variables + base styles
└── app.html                   # Standard SvelteKit template
```

#### Design System
**CSS Variables:**
```css
--accent-brand: #5422b0        /* Primary button/active color */
--text-primary: #1f1f1f        /* Body text */
--text-secondary: #777777      /* Hints, disabled text */
--bg-main: #ffffff             /* App background */
--bg-surface-dark: #efefef     /* Secondary surfaces */
--color-highlight: #F0E6F7     /* Selection/hover */
--color-border: #e0e0e0        /* Dividers */

/* Spacing (4px base) */
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px

/* Typography */
--font-size-base: 1.125rem
--font-size-h1: 1.5rem
--font-size-h2: 1.25rem
--radius: 12px
--radius-sm: 6px
--radius-lg: 16px

/* Layout */
--app-max-width: 480px
--header-height: 56px
```

#### State Management
- **Centralized in `stores.js`** (383 lines)
- Uses `createPersistentStore(key, initialValue)` helper
- Auto-syncs to localStorage with `promptflam_` prefix
- **Stores:**
  - `chatMessages` — Current conversation
  - `currentChatSessionId` — Archive ID
  - `archiveChats` — Chat history (max 10, 30-day expiry)
  - `archiveNotes` — Note history
  - `currentPrompts` — Prompt library favorites
  - `personaRole`, `personaAudience` — User settings

#### Code Quality
- ✅ Clean separation of concerns (routes, components, stores)
- ✅ Well-documented AGENTS.md
- ✅ Consistent naming conventions
- ✅ No console.logs visible in component code
- ✅ Svelte 5 reactive syntax throughout

#### Gotchas
- **No TypeScript** — Works fine for its scope, but less type safety than AudioFlam
- **localStorage-only state** — No backend persistence; works for 10 chat limit

#### Refactoring Impact: **Low Priority**
- Already well-structured
- CSS system is mature and consistent
- Can be updated to use @flamtools/design package once created

---

### 2. **PicFlam** (Heavy Image/AI Processing)
**URL:** https://github.com/masondan/picflam  
**Tech:** SvelteKit 2 + Svelte 5, Vanilla JavaScript  
**Status:** Well-documented but complex

#### Architecture
```
src/
├── routes/
│   ├── +page.svelte           # Main layout with 3 tabs (Crop, AI, Design)
│   └── +layout.svelte
├── lib/
│   ├── stores/
│   │   ├── cropStore.js       # 266 lines - Crop state (image, dimensions, etc.)
│   │   ├── aiStore.js         # 115 lines - AI generation state
│   │   ├── designStore.js     # 139 lines - Design/template state
│   │   └── appStore.js        # 46 lines - Global UI state
│   ├── utils/
│   │   ├── imageUtils.js      # Image manipulation, compression, loading
│   │   ├── aiUtils.js         # API calls to Hugging Face, model inference
│   │   ├── aiStateStorage.js  # Persistence for AI generations
│   │   └── generationStorage.js # Storage helpers
│   ├── components/
│   │   ├── ui/                # 20+ reusable UI components
│   │   │   ├── Button.svelte
│   │   │   ├── Modal.svelte
│   │   │   ├── ColorPicker.svelte
│   │   │   ├── Toggle.svelte
│   │   │   └── [15 more]
│   │   ├── crop/              # Crop tab components
│   │   ├── ai/                # AI tab components
│   │   └── design/            # Design/template tab components
│   └── styles/
│       ├── tokens.css         # 163 lines - Comprehensive design tokens
│       ├── global.css         # Global resets + base styles
│       └── modal-base.css     # Modal-specific styles
├── app.html
└── DESIGN_SYSTEM.md           # Excellent documentation
```

#### Design System
**Tokens.css defines:**
- **Colors:** Primary (#5422b0), surfaces, text hierarchy, canvas palette (green, blue, red, etc.)
- **Typography:** 8 custom fonts (Inter, Roboto Slab, Saira, Lora, Playfair, Special Elite, Bebas, Alfa Slab)
- **Spacing:** 0-12rem scale
- **Shadows, transitions, border radius**

**Notable:** PicFlam has 8 font families; other apps use only Inter. This is intentional (design app requires variety).

#### State Management
- **4 separate store files** (cropStore, aiStore, designStore, appStore)
- ~566 lines of store code total
- Mix of persistent (generation storage) and transient state
- AI generations cached to localStorage for recovery

#### Code Quality
- ✅ Excellent component structure (ui/, crop/, ai/, design/ organization)
- ✅ Comprehensive DESIGN_SYSTEM.md
- ✅ Thorough UI component library
- ⚠️ Store separation is somewhat arbitrary (could consolidate)
- ⚠️ Image utilities scattered between imageUtils.js and inline canvas code

#### Duplication Detected
- **Image manipulation:** cropStore.js + imageUtils.js both handle resizing (could deduplicate)
- **Color picking:** ColorPicker.svelte + Coloris library (library mostly works)

#### Gotchas
- **Font weight:** Some fonts (Special Elite, Bebas) only available in 1-2 weights
- **Hugging Face models:** Loaded client-side; large JS bundle for ONNX + transformers
- **localStorage limit:** Storing generations (images as base64) risks quota issues on mobile

#### Refactoring Impact: **Medium Priority**
- Could benefit from shared utilities (imageUtils → @flamtools/utils)
- Store consolidation optional (current structure works)
- Design system is already exportable to @flamtools/design
- Consider lazy-loading AI models to reduce initial bundle

---

### 3. **AudioFlam** (Reference Implementation)
**URL:** https://github.com/masondan/audioflam  
**Tech:** SvelteKit 2 + Svelte 5, **TypeScript**  
**Status:** Excellent; well-documented in AGENTS.md

#### Architecture
```
src/
├── routes/
│   ├── +page.svelte           # Main UI (header + tabs)
│   ├── +layout.svelte
│   ├── api/
│   │   ├── tts/+server.ts     # TTS endpoint (Azure + YarnGPT)
│   │   └── transcode/+server.ts # Cloud video transcoding (api.video)
│   └── [other routes]
├── lib/
│   ├── stores.ts              # 64 lines - Voice definitions, preloaded state
│   ├── components/            # 25+ components
│   │   ├── AudiogramPage.svelte
│   │   ├── CompositionCanvas.svelte
│   │   ├── WaveformPanel.svelte
│   │   ├── TitlePanel.svelte
│   │   ├── ColorPicker.svelte
│   │   ├── TogglePanel.svelte
│   │   └── [19 more]
│   ├── utils/
│   │   ├── audioProcessing.ts
│   │   ├── compositor.ts      # Canvas layer composition
│   │   ├── recording.ts       # MediaRecorder wrapper
│   │   ├── waveform.ts        # FFT preprocessing + rendering
│   │   ├── webcodecs-export.ts # H.264/MP4 encoding (WebCodecs)
│   │   ├── video-export.ts    # Export orchestration
│   │   ├── transcription-worker.ts
│   │   ├── timestretch.ts     # Audio speed adjustment
│   │   └── transcription.ts
│   ├── server/
│   │   ├── audioNormalize.ts
│   │   └── silenceRemoval.ts
│   └── [CSS, server utils]
├── app.css                    # 100+ lines - CSS variables
├── app.html
└── docs/
    ├── ARCHITECTURE.md
    ├── TROUBLESHOOTING.md
    ├── CHALLENGES_AND_FIXES.md
    └── archive/               # Historical docs
```

#### Design System
**Matches PromptFlam's CSS vars** (intentionally aligned):
```css
--accent-brand: #5422b0
--color-primary: #5422b0
--text-primary: #1f1f1f
--text-secondary: #777777
--bg-white: #ffffff
--bg-main: #efefef
--color-border: #e0e0e0
--color-highlight: #f0e6f7
```

#### State Management
- **Minimal stores.ts** (64 lines) — Only voice definitions + preloadedTTSAudio
- API routes handle server-side TTS logic
- Component-level state for UI (audio position, etc.)
- **Intentional design:** Keep state local where possible

#### Code Quality
- ✅ **TypeScript throughout** — Full type safety
- ✅ **Excellent AGENTS.md** — Complete reference (see project workspace)
- ✅ **Decision log included** — Explains architecture choices
- ✅ **Clean utilities structure** — Focused, single-responsibility modules
- ✅ **Server routes clean** — API endpoints properly isolated
- ⚠️ Some complex utilities (webcodecs-export.ts, video-export.ts) need deep understanding

#### Critical Architecture Decisions
1. **WebCodecs + Mediabunny over FFmpeg.wasm** — Smaller bundle, native H.264
2. **Pre-computed FFT frames for export** — Ensures visual parity between preview & export
3. **Audio not played during export** — Avoids CPU contention; smooth 24fps
4. **Cloud transcoding fallback (api.video)** — For iOS; costs negligible (~$0.003/video)

#### Gotchas
- **Audio mono→stereo conversion** — AAC encoder on mobile rejects mono
- **H.264 requires even dimensions** — Canvas auto-corrected in webcodecs-export.ts
- **Type assertion risky** — video-export.ts:445 has unchecked assertion (add guard)
- **Mediabunny lazy-loaded** — Dynamic import keeps bundle small

#### Refactoring Impact: **Low Priority**
- Already well-architected for its complexity
- Excellent reference for other apps
- Could extract audio utilities to @flamtools/utils, but works standalone
- AGENTS.md should be template for other apps

---

### 4. **ChartFlam** (Outlier: Vanilla JS)
**URL:** https://github.com/masondan/chartflam  
**Tech:** Vanilla JavaScript + HTML5 + CSS3 (no framework)  
**Status:** Functional but monolithic

#### Architecture
```
chartflam/
├── index.html               # Single HTML file (entry point)
├── app.js                   # **3,444 lines** - ALL application logic
├── styles.css               # ~1,000 lines - All CSS
├── manifest.json            # PWA manifest
├── pictogram-icons.js       # 593 lines - Icon metadata
├── icon-mapping.js          # Icon mappings
├── icons.js                 # EMPTY - to be removed
├── public/
│   ├── chartflam-logo.png
│   ├── icons/
│   └── [icon PNGs]
└── AGENTS.md                # Complete documentation
```

#### Design System
**Minimal CSS vars:**
```css
--accent-brand: #5422b0 (used as primary brand color)
--text-primary: #1f1f1f
--color-border: #e0e0e0
[mostly hardcoded colors in CSS]
```

**Typography:** Inter font only (self-hosted)

#### Code Organization
- **Single `app.js` file contains:**
  - Application state (chartData, config, UI state)
  - All event listeners
  - Chart type logic (5 types: pie, donut, bar, line, pictogram)
  - CSV parsing (3 functions)
  - Rendering (Chart.js wrapper)
  - Download/export
  - Keyboard shortcuts

#### Code Quality Issues (from AGENTS.md)
- ⚠️ **51 console.log statements** throughout → Should be removed or wrapped in debug flag
- ⚠️ **170+ direct DOM queries** → Tightly couples code to HTML; should cache
- ⚠️ **CSV parsing scattered** → 3 similar functions; should use adapter pattern
- ⚠️ **Inline SVG strings** → Should use external files + icon-mapping.js
- ⚠️ **Coloris library hack** (MutationObserver workaround) → Fragile integration
- ⚠️ **No localStorage** → Charts lost on refresh
- ⚠️ **No undo/redo** → Users can't recover from mistakes

#### Strengths
- ✅ Works reliably across browsers (tested on macOS, iOS, Android)
- ✅ Lightweight (no framework overhead)
- ✅ Well-documented AGENTS.md
- ✅ Comprehensive testing checklist

#### Why It's Different
- **Decision:** Built as static site before SvelteKit decision
- **AGENTS.md says:** "Not recommended: Refactor to SvelteKit now... diminishing ROI"
- **Agreed:** For current scope, refactoring cost > benefit

#### Duplication with Other Apps
- **CSV parsing:** Duplicated across ChartFlam; could extract to @flamtools/utils
- **Download/export:** Similar pattern to AudioFlam and PicFlam
- **Icon management:** PicFlam and MapFlam have better icon systems

#### Refactoring Impact: **High Priority (But Phased)**
1. **Quick wins (2-3 hours):**
   - Remove all console.logs (wrap in debug flag)
   - Delete empty icons.js
   - Create dom.js helper for caching queries

2. **Medium-term (1-2 weeks):**
   - Extract CSV parsing → @flamtools/utils
   - Extract color picker → reusable component or package
   - Add localStorage + undo/redo

3. **Do NOT do (low ROI):**
   - Full refactor to SvelteKit unless app scope grows

#### Gotchas
- **Coloris color picker:** MutationObserver is brittle; library integration needs review
- **Chart.js lifecycle:** Chart destroyed/recreated on type change; can cause memory leaks if not careful
- **SVG rendering:** Inline strings make it hard to update icons consistently

---

### 5. **MapFlam** (Vite + Svelte, Not SvelteKit)
**URL:** https://github.com/masondan/mapflam  
**Tech:** Vite + Svelte 5 (TypeScript), **NOT SvelteKit**  
**Status:** Well-designed but inconsistent with other apps

#### Architecture
```
src/
├── main.ts                    # Vite entry point
├── app.svelte                 # **Root component** (NOT SvelteKit routing)
├── app.css                    # 90 lines - CSS variables
├── lib/
│   ├── stores.ts              # 62 lines - Reactive state (markers, map, UI)
│   ├── types.ts               # TypeScript interfaces + color palette
│   ├── services/
│   │   ├── nominatim.ts       # Location search (Nominatim + MapBox fallback)
│   │   ├── mapbox.ts          # MapBox Geocoding fallback
│   │   ├── export.ts          # PNG export via html2canvas
│   │   ├── persistence.ts     # localStorage (save/load/delete/expiry)
│   │   └── geolocation.ts     # GPS parsing
│   └── components/
│       ├── MapContainer.svelte   # Leaflet map wrapper
│       ├── PinEditor.svelte      # Pin customization card
│       ├── SearchBar.svelte      # Location search UI
│       ├── BaseMapSelector.svelte
│       ├── RatioSelector.svelte
│       ├── SavedTab.svelte       # Saved maps list
│       └── InsetMapEditor.svelte # Phase 2 feature
├── vite-env.d.ts
└── tsconfig.json
```

#### Design System
**Basic CSS vars:**
```css
--color-brand: #5422b0
--color-brand-light: #f0e6f7
--color-text-primary: #777777
--color-bg-panel: #efefef
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--radius-md: 8px
[6 color-picker preset colors]
```

**Typography:** Inter font only

#### Code Organization
- **Root component approach** — app.svelte is ~430 lines (large for a single component)
- **Service layer clean** — nominatim.ts, export.ts, persistence.ts well-separated
- **Component structure logical** — MapContainer, SearchBar, PinEditor, etc.

#### Key Features
- Multi-pin locator maps
- Search via Nominatim (free, open-source geocoding)
- MapBox fallback when Nominatim returns empty
- Export as PNG (html2canvas)
- Save/load maps (localStorage, 5 max, 30-day expiry)
- Mobile gesture support (two-finger overlay)
- Multiple basemap options (6 tile providers)

#### Code Quality
- ✅ TypeScript throughout
- ✅ Clean service layer
- ✅ Well-documented AGENTS.md
- ✅ Type definitions (types.ts) are clear
- ⚠️ **Not SvelteKit** — Breaks consistency with other apps
- ⚠️ **Large root component** — app.svelte is 430+ lines (consider breaking into layout + pages)
- ⚠️ **Minimal CSS tokens** — Could use PicFlam's token system as reference

#### Why It's Different
**From MapFlam AGENTS.md:**
- Built as standalone Vite app (not SvelteKit)
- Rationale: Simpler routing (only Create/Saved tabs)
- Leaflet integration preferred without SvelteKit routing layer

**Assessment:** This is a valid architectural choice, but creates inconsistency with PromptFlam, PicFlam, AudioFlam.

#### Duplication with Other Apps
- **Export logic (PNG):** html2canvas same as PicFlam; could share
- **localStorage persistence:** Similar patterns across all apps; could extract
- **API error handling:** Not visible here but likely duplicated elsewhere

#### Refactoring Impact: **Medium Priority**
1. **Low-cost improvements:**
   - Break app.svelte into app.svelte (layout) + pages (Create/Saved)
   - Migrate to SvelteKit (would align with other apps)
   - Adopt comprehensive CSS token system

2. **Medium-cost:**
   - Migrate to @flamtools/design system
   - Extract export logic to @flamtools/utils

3. **Not urgent:** App works well; refactoring has diminishing returns unless scope grows

#### Gotchas
- **Nominatim rate limits:** ~1 request/second; cached on client
- **MapBox fallback:** Requires `VITE_MAPBOX_API_KEY` env var
- **html2canvas export:** Can be slow on large/complex maps
- **localStorage quota:** 5 maps × N markers; could hit limits on older Android

---

## Cross-App Analysis

### Tech Stack Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Framework** | ⚠️ Mixed | 4 SvelteKit, 1 Vite+Svelte, 1 Vanilla JS |
| **Language** | ⚠️ Mixed | 3 JS, 2 TS |
| **Deployment** | ✅ Consistent | All Cloudflare Pages |
| **State Management** | ⚠️ Inconsistent | localStorage + Svelte stores (no pattern) |
| **Design System** | ⚠️ Duplicated | 5 separate CSS var definitions |
| **Styling** | ✅ Consistent | All use CSS variables (no Tailwind) |

### Code Duplication Matrix

| Utility | Appears In | Opportunity |
|---------|-----------|------------|
| **Image resize/crop** | PicFlam (imageUtils.js + cropStore.js) | Extract to @flamtools/utils |
| **Image download/export** | PicFlam, MapFlam (html2canvas) | Extract to @flamtools/utils |
| **Audio processing** | AudioFlam (audioProcessing.ts, waveform.ts) | Standalone (low duplication) |
| **CSV parsing** | ChartFlam (3 functions) | Extract to @flamtools/utils |
| **localStorage persistence** | All apps (different patterns) | Extract to @flamtools/utils |
| **Color picker** | PicFlam (Coloris + custom), AudioFlam (ColorPicker.svelte) | Extract to @flamtools/design |
| **Button, Input, Modal** | All apps (similar patterns) | Extract to @flamtools/design |
| **API error handling** | All apps | Extract to @flamtools/utils |

### Design System Consistency

**Primary Colors (All apps define `--accent-brand`):**
- PromptFlam: `#5422b0` ✅
- PicFlam: `#5422b0` ✅
- AudioFlam: `#5422b0` ✅
- ChartFlam: `#5422b0` ✅
- MapFlam: `#5422b0` ✅

**Good news:** Primary color is consistent!

**Problem:** Each app re-defines full CSS token set independently.

**Spacing Scales Differ:**
- PromptFlam: 4px base (4, 8, 16, 24, 32)
- PicFlam: 4px base (4, 8, 12, 16, 20, 24, 32, 40, 48)
- AudioFlam: Inherited from PromptFlam
- MapFlam: 8px base (8, 16, 24)

**Border Radius Differ:**
- PromptFlam: 12px default, 6px small, 16px large
- PicFlam: 8px default (called md), 4px sm, 12px lg, 16px xl
- MapFlam: 8px only

**Typography Differ:**
- PromptFlam: 1.125rem base (17px)
- PicFlam: 1rem base (16px)
- AudioFlam: 1rem base (16px)
- MapFlam: Derived from browser defaults

---

## Refactoring Strategy

### Phase 1: Create Shared Design System (Weeks 1-2)
**Effort:** 1-2 weeks | **Risk:** Low | **ROI:** High

**Deliverable:** `@flamtools/design` npm package

**What to extract:**
```
@flamtools/design/
├── tokens.css          # Unified CSS variables
├── components/         # Reusable UI components
│   ├── Button.svelte
│   ├── Input.svelte
│   ├── Modal.svelte
│   ├── ColorPicker.svelte
│   ├── Toggle.svelte
│   └── [8 more]
├── styles/
│   ├── reset.css       # Global resets
│   ├── typography.css
│   └── transitions.css
├── package.json
└── README.md
```

**Implementation:**
1. Base design system on **PicFlam's tokens.css** (most comprehensive)
2. Reconcile color/spacing scales across all apps
3. Create reusable components from existing Svelte patterns
4. Publish to npm (or Git-based package)

**Per-app integration:**
```javascript
// package.json in each app
"dependencies": {
  "@flamtools/design": "^1.0.0"
}

// in app
import Button from '@flamtools/design/Button.svelte';
import '@flamtools/design/tokens.css';
```

**Test checklist:**
- [ ] All 5 apps build successfully with @flamtools/design
- [ ] Visual consistency verified across all apps
- [ ] No breaking changes to existing UI
- [ ] Bundle size checked (aim for <10KB gzipped)

---

### Phase 2: Create Shared Utilities (Weeks 3-4)
**Effort:** 2-3 weeks | **Risk:** Low | **ROI:** Medium-High

**Deliverable:** `@flamtools/utils` npm package

**What to extract:**
```
@flamtools/utils/
├── image/
│   ├── resize.ts       # Image resizing (from PicFlam)
│   ├── crop.ts         # Crop logic (from PicFlam)
│   ├── export.ts       # Download/PNG export (from PicFlam, MapFlam)
│   └── compress.ts     # Image compression
├── audio/
│   ├── normalize.ts    # Normalize audio (from AudioFlam server)
│   ├── speedControl.ts # Speed adjustment (from AudioFlam)
│   └── ffts.ts         # FFT preprocessing (if shareable)
├── data/
│   ├── csv.ts          # CSV parsing (from ChartFlam)
│   ├── json.ts         # JSON serialization
│   └── validation.ts   # Form validation patterns
├── storage/
│   ├── localStorage.ts # Unified persistence layer
│   ├── versioning.ts   # Data versioning + migration
│   └── expiry.ts       # Auto-cleanup for old data
├── api/
│   ├── errorHandler.ts # Unified error handling
│   ├── retry.ts        # Retry logic for failed requests
│   └── cors.ts         # CORS handling helpers
├── clipboard.ts        # Shared clipboard state (from your earlier suggestion)
├── icons.ts            # Icon utilities
└── package.json
```

**Implementation:**
1. Extract CSV parsing from ChartFlam → `@flamtools/utils/data/csv.ts`
2. Extract image utilities from PicFlam → `@flamtools/utils/image/*`
3. Extract localStorage patterns from all apps → `@flamtools/utils/storage/localStorage.ts`
4. Create clipboard layer → `@flamtools/utils/clipboard.ts` (for your workflow feature)

**Test checklist:**
- [ ] CSV parser handles all ChartFlam edge cases
- [ ] Image utilities work across PromptFlam, PicFlam, MapFlam
- [ ] localStorage layer backs all apps without breaking existing data
- [ ] Clipboard state sharing works between apps

---

### Phase 3: App-Specific Refactoring (Weeks 5-6)

#### ChartFlam: Code Cleanup (Priority: High)
**Effort:** 1-2 weeks | **Risk:** Low | **ROI:** Medium

1. **Quick wins (1-2 hours):**
   - Remove all console.logs (wrap in `if (DEBUG)` flag)
   - Delete empty `icons.js`
   - Create `dom.js` cache for frequently-queried elements

2. **Medium-term (3-5 days):**
   - Extract CSV parsing → `@flamtools/utils/data/csv.ts`
   - Extract color picker → eventually migrate to @flamtools/design
   - Add localStorage persistence (no data loss on refresh)
   - Add basic undo/redo (10-item stack)

3. **Do NOT do:**
   - Refactor to SvelteKit (low ROI for current scope)
   - Rewrite app.js (works, just needs cleanup)

**Impact:** Maintainability improves 30%, bundle size slightly smaller

#### MapFlam: Consistency Alignment (Priority: Medium)
**Effort:** 1-2 weeks | **Risk:** Low-Medium | **ROI:** Medium

1. **Option A: Migrate to SvelteKit** (Recommended)
   - Convert Vite + app.svelte → SvelteKit routes (+page.svelte)
   - Add SvelteKit routing layer for consistency
   - Effort: 1 week, straightforward refactor
   - Benefit: Aligns with other 4 apps; easier to share code

2. **Option B: Stay with Vite** (Valid, Simpler)
   - Just break app.svelte into layout + pages
   - Adopt @flamtools/design and @flamtools/utils
   - Effort: 3-4 days
   - Trade-off: Still non-standard vs. other apps

**Recommendation:** Option A (migrate to SvelteKit) for long-term consistency

#### AudioFlam: No Changes Needed
**Status:** Already excellent reference implementation
- Use AGENTS.md style for other apps
- Extract @flamtools/utils imports if utilities become shared

#### PicFlam: Store Consolidation (Priority: Low)
**Effort:** 2-3 days | **Risk:** Low | **ROI:** Low

**Optional:** Consolidate 4 store files into 1 (cropStore, aiStore, designStore, appStore → stores.js)
- **Current:** Works fine as-is; separation can aid readability
- **Consolidated:** Would be simpler to understand overall state
- **Decision:** Leave as-is unless it becomes hard to maintain

#### PromptFlam: No Changes Needed
**Status:** Excellent, well-documented
- Use as reference for other apps
- Will automatically benefit from @flamtools/design + @flamtools/utils

---

### Phase 4: Domain + Navigation Integration (Optional, Can Happen in Parallel)
**Effort:** 2-3 hours | **Risk:** Very Low | **ROI:** High (UX)

1. **Buy flamtools.com domain** (via Cloudflare)
2. **Set up subdomains** (Cloudflare DNS)
   - `audioflam.flamtools.com` → AudioFlam project
   - `picflam.flamtools.com` → PicFlam project
   - etc.
3. **Create minimal hub site** (static HTML) at flamtools.com
4. **Add in-app navigation menu** to all apps (reusable Svelte component)

**This can start immediately; doesn't depend on design/utils packages.**

---

## Summary Table: Refactoring by App

| App | Priority | Effort | Risk | Why | Timeline |
|-----|----------|--------|------|-----|----------|
| **PromptFlam** | Low | 2-3 days | Very Low | Already excellent; just adopt shared packages | Week 5+ |
| **PicFlam** | Low-Medium | 1 week | Low | Store consolidation optional; adopt shared packages | Week 5+ |
| **AudioFlam** | Very Low | 0 | Very Low | Reference implementation; no changes needed | — |
| **ChartFlam** | High | 1-2 weeks | Low | Code cleanup + extract utilities | Weeks 3-4 |
| **MapFlam** | Medium | 1 week | Low-Medium | Migrate to SvelteKit OR adopt shared packages | Week 5+ |

---

## Estimated Timeline

| Phase | Week | Effort | Deliverable |
|-------|------|--------|-------------|
| **Phase 1: Design System** | 1-2 | 1-2 weeks | @flamtools/design pkg |
| **Phase 2: Utilities** | 3-4 | 2-3 weeks | @flamtools/utils pkg |
| **Phase 3: App Cleanup** | 5-6 | 2-3 weeks | ChartFlam cleanup, MapFlam alignment |
| **Phase 4: Integration** | Parallel | 2-3 hours | Domain, subdomains, hub site, in-app nav |
| **Total** | 6 weeks | 7-10 weeks | Fully aligned toolset |

---

## Recommendations

### Do This Now (Immediate, High ROI)
1. ✅ **Buy flamtools.com domain** (Cloudflare) — 5 mins, $12/year
2. ✅ **Set up subdomains** — 30 mins, no code changes needed
3. ✅ **Create minimal hub site** — 2-3 hours, static HTML
4. ✅ **Implement shared clipboard layer** — 2-3 hours, add to all apps
5. ✅ **Add in-app navigation menu** — 4-6 hours per app (Svelte component)

### Phase 1 (Weeks 1-2)
6. 🔄 **Create @flamtools/design package** — Extract from PicFlam
7. 🔄 **Integrate into all apps** — One app at a time (reduce risk)

### Phase 2 (Weeks 3-4)
8. 🔄 **Create @flamtools/utils package** — Image, CSV, storage, clipboard
9. 🔄 **ChartFlam cleanup** — Remove console.logs, extract CSV parsing

### Phase 3 (Weeks 5-6)
10. 🔄 **MapFlam alignment** — Migrate to SkeleteKit OR adopt shared packages
11. 🔄 **Optional: Store consolidation** in PicFlam (low priority)

### Do NOT Do (Low ROI)
- ❌ Refactor ChartFlam to SvelteKit (complexity > benefit)
- ❌ Extract AudioFlam's audio utils (too specialized; low duplication)
- ❌ Create a monorepo (more operational overhead; separate repos work)
- ❌ Add backend state persistence now (optional for later phases)

---

## Risk Assessment

### Low Risk
- ✅ Creating new packages (@flamtools/design, @flamtools/utils)
- ✅ Adding shared clipboard layer
- ✅ Adding in-app navigation menu
- ✅ ChartFlam code cleanup

### Medium Risk
- ⚠️ Migrating MapFlam to SkeleteKit (requires careful testing)
- ⚠️ Consolidating PicFlam stores (low impact if done carefully)

### Mitigations
1. **Test each change on mobile** (Android + iOS)
2. **Keep changes atomic** (one app at a time for design/utils adoption)
3. **Version all packages** (@flamtools/design@1.0.0, etc.)
4. **Maintain backward compatibility** (localStorage, URLs, etc.)
5. **Create rollback plan** (git branches for each phase)

---

## Final Thoughts

**Your app portfolio is in good shape.** The separation of concerns is intentional and works. However, you're at the inflection point where:

1. **Design consistency** matters more (5 apps, shared identity)
2. **Code reuse** saves time (image utils, storage patterns, UI components)
3. **Navigation between apps** is critical (workflow integration)

**This refactoring strategy is low-risk and high-ROI because:**
- You're not consolidating codebases (keep apps independent)
- You're extracting what's truly shared (design, utilities)
- You're improving UX without breaking existing functionality
- Each phase delivers immediate value

**The phased approach lets you:**
- Get quick wins (domain, navigation) immediately
- Build packages gradually (months 1-2)
- Test thoroughly before rolling out to all 5 apps
- Keep shipping new features during refactoring

**Start with the domain + navigation + clipboard layer (Week 1). That alone transforms the user experience. Then tackle packages in parallel with feature development.**

---

## Appendix: Detailed Code Metrics

### Codebase Size

| App | Routes | Components | Utils | Stores | CSS | Total LOC |
|-----|--------|-----------|-------|--------|-----|-----------|
| PromptFlam | 100 | 2,000 | 50 | 383 | 211 | ~2,744 |
| PicFlam | 200 | 3,500 | 800 | 566 | 1,500 | ~6,566 |
| AudioFlam | 300 | 2,500 | 2,000 | 64 | 100 | ~4,964 |
| ChartFlam | — | — | — | — | 1,000 | 3,444 + 1,000 CSS |
| MapFlam | — | 1,500 | 800 | 62 | 90 | ~2,452 |
| **Total** | ~600 | ~10,000 | ~3,650 | ~1,075 | ~3,200 | **~20,170 LOC** |

*Estimates based on file counts and sampling*

### Dependencies

| App | Core Deps | Total |
|-----|-----------|-------|
| PromptFlam | @sveltejs/kit, svelte, vite, marked | 4 prod, 8 dev |
| PicFlam | @sveltejs/kit, svelte, vite, @huggingface/transformers, @melloware/coloris, html2canvas, onnxruntime-web, vanilla-colorful | 8 prod, 10 dev |
| AudioFlam | @sveltejs/kit, svelte, vite, @huggingface/transformers, lamejs, mediabunny, soundtouchjs | 7 prod, 10 dev |
| ChartFlam | Chart.js, Coloris | 2 prod, 0 dev |
| MapFlam | svelte, vite, leaflet, html2canvas, uuid | 5 prod, 8 dev |

**Observation:** Minimal dependencies overall; good for bundle size and maintainability.

---

## Document Metadata

- **Created:** March 20, 2026
- **Reviewed:** All 5 apps analyzed
- **Status:** Ready for action planning
- **Next Review:** After Phase 1 complete (design system package)

