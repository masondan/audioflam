# Flam Family - Core Design System

**Version**: 1.0  
**Date**: February 2026  
**Scope**: Unified design guidelines for ChartFlam, PromptFlam, AudioFlam, NewsLab, MapFlam

---

## Executive Summary

This document defines the core, reusable design elements that should be consistent across all Flam apps. It excludes app-specific layouts, features, or implementations. Each app may have variations for legitimate reasons—these should be documented as exceptions with rationale.

### CSS Variable Naming Convention

All CSS variables follow a semantic naming pattern:
```css
--[category]-[semantic]-[modifier]
```

**Examples:**
- `--color-text-primary` (category: color, semantic: text, modifier: primary)
- `--color-border-active` (category: color, semantic: border, modifier: active)
- `--spacing-lg` (category: spacing, modifier: lg)
- `--radius-md` (category: radius, modifier: md)
- `--shadow-sm` (category: shadow, modifier: sm)
- `--duration-fast` (category: duration, modifier: fast)

**Rule:** Never hard-code design values. Always use CSS variables. If you need a variable that doesn't exist, propose adding it to the design system rather than creating one-off values.

---

## 1. COLOR PALETTE

### Primary Brand Color
- **Value**: `#5422b0` (Indigo Bloom / Purple)
- **CSS Variable**: `--accent-brand` or `--color-primary`
- **Usage**: Primary buttons, active states, link color, theme accents, splash screen
- **Status**: ✓ Consistent across all 5 apps

### Neutral Colors

| Role | Value | Variable | Usage |
|------|-------|----------|-------|
| Text Primary | #1f1f1f | `--text-primary` | Body text, labels |
| Text Secondary | #777777 | `--text-secondary` | Helper text, disabled, secondary labels |
| Background Main | #efefef | `--bg-main` | Primary background (subtle grey for visual hierarchy) |
| Border Default | #e0e0e0 | `--color-border` | Dividers, input borders (inactive) |
| Border Active | #999999 | `--color-border-active` | Focus, active states |
| Icon Default | #1f1f1f | `--color-icon-default` | Default icon color (matches text-primary) |

### Status & Semantic Colors
- **Lavender/Highlight**: `#f0e6f7` — CSS Variable: `--color-highlight` — Hover states, selections, highlights
- **White**: `#ffffff` — Text on dark backgrounds, card backgrounds
- **Icon Active**: `#5422b0` — Active icons (matches brand color)

### Interactive State Colors
- **Toggle Active**: `#555555` — CSS Variable: `--bg-toggle-active` — Secondary button active state, toggle switches when active
- **Icon Active Background**: `#5422b0` — CSS Variable: `--color-icon-active-bg` — Active icon button background
- **Icon Active Text**: `#ffffff` — CSS Variable: `--color-icon-active-text` — Active icon button text/icon color

### Border State Colors (Focus & Interaction)
- **Inactive**: `#e0e0e0` — CSS Variable: `--color-border` — Unfocused inputs, dividers, panels, default state
- **Active/Focus**: `#999999` — CSS Variable: `--color-border-active` — Focused inputs, active states, emphasis
- **Note**: Border thickness also increases on focus (1px → 2px) for additional clarity. See Section 14 (Accessibility) for implementation details.

**Status**: ✓ Standardized across all apps

---

## 2. TYPOGRAPHY

### Font Family

#### Primary Font Implementation
- **Font**: Inter (Variable, 3 axes)
- **Source**: Self-hosted (`/public/fonts/Inter-VariableFont_opsz,wght.ttf`)
- **Loading**: `@font-face` with `font-display: swap` (renders immediately with system font, swaps to Inter when loaded)
- **Performance**: Eliminates third-party latency; faster than Google Fonts CDN
- **Fallback**: System stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`)
- **Format**: TTF or WOFF2 (WOFF2 preferred if available for smaller file size)

#### Alternate Fonts Available
- Lora, Playfair Display, Saira Condensed, Bebas Neue (from Google Fonts for display/accent purposes only)
- Load only when app specifically needs these fonts

**Implementation Notes:**
- Store font files in `/public/fonts/`
- Use `font-display: swap` in `@font-face` to prevent invisible text during load
- On first visit: system font displays briefly (~50-200ms), then swaps to Inter
- On repeat visits: Inter cached in browser, no flash

**Status**: ✓ Consistent across apps (implement self-hosted Inter for all Flam apps)

### Font Sizes (Logical Scale)

| Role | CSS Variable | Value | Px Equivalent | Usage |
|------|------|-------|---------------|-------|
| XS | `--font-size-xs` | 0.75rem | 12px | Captions, metadata |
| Small | `--font-size-sm` | 0.875rem | 14px | Small labels, helper text |
| Base | `--font-size-base` | 1rem | 16px | Body text (P, input, buttons) |
| Large | `--font-size-lg` | 1.125rem | 18px | H3, subheadings |
| Larger | `--font-size-larger` | 1.25rem | 20px | H2, section titles |
| XL | `--font-size-xl` | 1.5rem | 24px | H1, page titles |

**Status**: ✓ Consistent scale across all apps

### Font Weights
- **Regular**: 400 — Body text, default
- **Medium**: 500 — Buttons, emphasis
- **Semibold**: 600 — Subheadings, form labels
- **Bold**: 700 — Headings, strong emphasis

**Status**: ✓ Consistent across apps

### Line Heights

| Role | CSS Variable | Value | Usage |
|------|------|--------|--------|
| Tight | `--line-height-tight` | 1.2 | Headings (H1, H2, H3) |
| Default | `--line-height-normal` | 1.5 | Body text, paragraphs, inputs |
| Relaxed | `--line-height-relaxed` | 1.8 | Long-form content, descriptions |

**Status**: ✓ Consistent across apps

---

## 3. SPACING SYSTEM

All apps use the same spacing scale (base unit: 0.25rem / 4px):

| Token | CSS Variable | Value | Px Equivalent | Usage |
|-------|------|-------|-------|-------|
| xs | `--spacing-xs` | 0.375rem | 6px | Tight spacing, icon padding |
| sm | `--spacing-sm` | 0.625rem | 10px | Element padding, gaps between small items |
| md | `--spacing-md` | 1rem | 16px | Default padding, section margins |
| lg | `--spacing-lg` | 1.25rem | 20px | Vertical spacing, section separators |
| xl | `--spacing-xl` | 1.75rem | 28px | Large gaps, layout-level spacing |

**Implementation Notes:**
- Always use CSS variables, never hard-code spacing values
- All padding, margin, gap properties should reference these variables
- Consistency across all 5 Flam apps depends on adherence to this scale

**Status**: ✓ Consistent across apps; all apps use identical rem values

---

## 4. BORDER RADIUS

| Token | CSS Variable | Value | Usage |
|-------|------|-------|--------|
| Small | `--radius-sm` | 6px | Input fields, small buttons, small containers |
| Medium | `--radius-md` | 8px | Most buttons, containers, panels |
| Large | `--radius-lg` | 12px | Cards, larger containers, chart displays |
| XL | `--radius-xl` | 16px | Modals, largest containers |
| Full/Round | `--radius-round` | 9999px | Circular icons, pill buttons, toggle tracks, slider tracks |

**Implementation Notes:**
- Always use CSS variables, never hard-code border-radius values
- Use `--radius-round` for both circles and pill shapes — `9999px` is clamped to `50%` on square elements (creating perfect circles) and produces pill shapes on rectangles (toggle tracks, slider tracks, badges)
- **⚠️ Never use `50%` for `--radius-round`** — on rectangular elements (e.g., a 44×24px toggle or 300×6px slider track), `50%` creates an ellipse instead of a pill, breaking the visual design
- Use other tiers for rectangular elements based on container size and visual emphasis
- Maintain consistency across all interactive elements

**Status**: ✓ Consistent across apps; all apps use identical px values

---

## 5. BORDERS & STROKES

### Standard Border Pattern

All borders follow the same universal standard:
- **Width**: Always `1px`
- **Style**: Always `solid`
- **Transition**: Use `border-color 0.2s ease` for focus/hover state changes
- **Usage**: Form inputs, containers, dividers, separators
- **Principle**: Keep borders consistent—never vary thickness; upgrade/downgrade color only

### Border Colors

| State | Color | Variable | Usage |
|-------|-------|----------|--------|
| Inactive (default) | #e0e0e0 | `--color-border` | Form inputs (unfocused), panels, containers, dividers |
| Active/Focus | #999999 | `--color-border-active` | Form inputs (focused), active sections, emphasis states |
| Icon Container | #5422b0 | `--color-icon-border` | Icon buttons, circular icon containers |

### Border Applications

- **Form Inputs**: Inactive: `--color-border`, Focus: `--color-border-active`
- **Containers/Panels**: Default `--color-border`; upgrade to `--color-border-active` when expanded/active
- **Icon Buttons**: `--color-icon-border` (#5422b0) for visual distinction of interactive elements
- **Dividers**: `--color-border` for subtle separation

**Status**: ✓ Consistent across apps; all borders use 1px solid with semantic colors

---

## 5a. BORDER RADIUS - AUDIOFLAM EXCEPTION

**Trim Handle Bar (2px):** AudioFlam's audio silence trimmer uses `border-radius: 2px` on the `.trim-handle-bar` element (a 4px-wide indicator bar inside the trim handles). This is a micro-refinement not in the standard scale but improves visual polish and perceived quality of the trim controls. Documented as approved exception.

---

## 6. BUTTONS

### Button Types & Styles

#### Primary Action Button
- **Background**: `#5422b0` (brand color)
- **Text Color**: `#ffffff`
- **Border**: None or brand color
- **Padding**: `var(--spacing-sm) var(--spacing-md)` (10px × 16px)
- **Border Radius**: `8px` (`--radius-md`)
- **Hover**: Darken or slight lift effect
- **CSS Variable**: `--color-icon-active-bg` for background
- **Status**: ✓ Consistent across apps (Note: Only used in PromptFlam, AudioFlam, NewsLab, MapFlam; ChartFlam has no primary buttons)

#### Secondary/Toggle Button
- **Background**: `#f8f8f8` (light grey) or transparent
- **Text Color**: `#1f1f1f`
- **Border**: `1px solid var(--color-border)` (#e0e0e0)
- **Padding**: `var(--spacing-sm) var(--spacing-md)`
- **Border Radius**: `8px` (`--radius-md`)
- **Active State**: 
  - Background: `var(--bg-toggle-active)` (#555555)
  - Text: `#ffffff`
  - Border: `var(--bg-toggle-active)` (#555555)
- **Hover**: Light background change (upgrade to `--bg-medium`)
- **Status**: ✓ Consistent across apps; all apps use semantic variables

#### Icon-Only Button
- **Size**: 36×36 px (header nav, toggles)
- **Background**: Transparent (default) or `var(--bg-toggle-active)` (active)
- **Border**: `1px solid var(--color-border)` (default) or `var(--bg-toggle-active)` (active)
- **Icon Color**: 
  - Default: `var(--text-dark)` (#1f1f1f)
  - Active: `#ffffff` (white on dark background)
- **Hover**: Light background change
- **Status**: ✓ Consistent across apps; uses semantic colors

#### Text-Only Button
- **No background**, no border
- **Color**: Brand color or text color
- **Hover**: Underline or slight color change
- **Status**: ✓ Consistent

### Button States
- **Disabled**: Opacity 0.5, cursor not-allowed
- **Hover**: Slight background color change or lift
- **Active**: Darker/inverted colors
- **Status**: ✓ Consistent

---

## 7. FORM CONTROLS

### Text Inputs & Textareas

**Universal Standards:**
- **Border**: `1px solid var(--color-border)` (#e0e0e0) default → `1px solid var(--color-border-active)` (#999999) focus
- **Border Radius**: `8px` (`--radius-md`)
- **Background**: `#ffffff`
- **Font**: Inherit from body
- **Transition**: `border-color 0.2s ease`
- **Placeholder Color**: `var(--text-secondary)` (#777777)

**Padding Strategy:**
- **Single-line inputs** (text, email, select, color, number): `var(--spacing-sm)` (10px)
  - Usage: Compact layout, tight vertical spacing, standard data entry
- **Textareas** (multi-line content): `var(--spacing-md)` (16px)
  - Usage: Better scannability for large content blocks (CSV paste, descriptions)
- **Rationale**: Different input types serve different purposes. Single-line inputs benefit from compact spacing; multi-line inputs benefit from generous spacing for readability and review.

**Status**: ✓ Consistent across apps with intentional variation

### Dropdowns & Selects
- **Styling**: Same as text inputs
- **Padding**: `var(--spacing-sm)` (10px)
- **Border Radius**: `8px` (`--radius-md`)
- **Min Height**: 48px (touch-friendly)
- **Focus State**: `border-color: var(--color-border-active)`, `outline: none`
- **Status**: ✓ Consistent

### Checkboxes & Radio Buttons
- **Size**: 20px (standardized across all apps)
- **Border**: `1px solid var(--color-border-active)` (#999999) unchecked
- **Checked State**: Filled with brand color (`#5422b0`)
- **Cursor**: `pointer`
- **Status**: ✓ Standardized

### Sliders & Range Inputs
- **Track Height**: 5px
- **Track Color**: `var(--color-border)` (#e0e0e0)
- **Thumb Size**: 18px diameter
- **Thumb Color**: `var(--bg-toggle-active)` (#555555)
- **Thumb Hover**: `transform: scale(1.15)`
- **Status**: ✓ Standardized across all apps

### Focus & Accessibility
- **Focus Visible Outline**: `2px solid var(--color-border-active)` with `outline-offset: 2px`
- **Error State**: `border-color: var(--favourite-active)` (red); `background-color: rgba(220, 20, 60, 0.05)`
- **Disabled State**: `opacity: 0.5; cursor: not-allowed`
- **Status**: ✓ Consistent keyboard navigation and screen reader support

---

## 8. HEADER & NAVIGATION

### App Header
- **Height**: 56px (desktop and mobile)
- **Padding**: `var(--spacing-md)` (16px all sides)
- **Background**: `#ffffff`
- **Border Bottom**: `1px solid var(--color-border-active)` (#999999)
- **Flex Layout**: Space-between (logo left, nav right)

### Header Logo
- **Height**: 32px (desktop and mobile—consistent, no scaling)
- **Aspect Ratio**: Maintain natural (usually ~4:1)
- **Transition**: `opacity 0.2s ease`
- **Status**: ✓ Standardized

### Navigation Icons (Chart Type Selector)

**Container (Circle Button):**
- **Size Desktop**: 38px × 38px circle
- **Size Mobile**: 36px × 36px circle
- **Border**: `1px solid var(--color-icon-border)` (#5422b0)
- **Border Radius**: `50%` (perfect circle)
- **Background**: Transparent (default), `var(--color-icon-active-bg)` (#5422b0) when active

**Icon Inside:**
- **Size Desktop**: 20px × 20px
- **Size Mobile**: 19px × 19px
- **Rationale**: Responsive scaling maintains 52% proportion on desktop, 50% on mobile

**States:**
- **Inactive**: `var(--text-secondary)` (#777777) icon, transparent background
- **Inactive Hover**: `var(--color-icon-border)` (#5422b0) icon (color shift), transparent background, `scale(1.05)`
- **Active**: `#ffffff` icon, `var(--color-icon-active-bg)` (#5422b0) background, inverted appearance
- **Transition**: `all 0.3s ease`

**Status**: ✓ Standardized with responsive proportions

---

## 9. LAYOUT & CONTAINERS

### App Container (Mobile Shell)
- **Max Width**: 480px (mobile width constraint on desktop)
- **Margin**: 0 auto (centered)
- **Background**: `#ffffff`
- **Box Shadow** (desktop): `0 2px 8px rgba(0, 0, 0, 0.08)`
- **Status**: ✓ Consistent

### Content Padding
- **Default**: `var(--spacing-md)` (16px)
- **Status**: ✓ Mostly consistent

### Panels & Dropdowns

All interactive panels, dropdowns, and disclosure sections use:
- **Background**: `#ffffff` (white)
- **Padding**: `var(--spacing-md)` (16px) for standard panels; `var(--spacing-sm) var(--spacing-md)` for compact disclosure sections
- **Border**: `1px solid var(--color-border)` (#e0e0e0)
- **Border Radius**: `var(--radius-lg)` (12px)

**Note**: A light gray background (`#f8f8f8`) is available as `--bg-surface` if future apps need to visually separate card-based layouts (e.g., product grids, article lists). Currently unused across all Flam apps.

**Status**: ✓ Consistent across all apps (all use white)

---

## 10. SHADOWS & ELEVATION

### Shadow Tiers

| Level | CSS Variable | Shadow | Usage |
|-------|------|--------|-------|
| sm | `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Subtle elevation, inline controls, buttons |
| md | `--shadow-md` | `0 4px 6px rgba(0, 0, 0, 0.07)` | Dropdowns, popovers, desktop app container |
| lg | `--shadow-lg` | `0 10px 15px rgba(0, 0, 0, 0.1)` | Floating actions, tooltips, emphasis elements |

### Implementation Notes
- **Always use CSS variables** (`--shadow-sm`, `--shadow-md`, `--shadow-lg`), never hard-code shadow values
- Apply shadows sparingly; rely on borders and background color for visual hierarchy first
- **No custom shadows**: Do not create one-off shadow values; use tiers above only
- If a new use case needs a shadow not covered by these tiers, propose adding a tier to the design system

**Status**: ✓ Standardized across all apps (CSS variables implemented)

---

## 11. ICONS

### Icon Sizing (Semantic Tiers)

All icon sizes use semantic CSS variables to ensure consistency and portability across all Flam apps.

| Tier | CSS Variable | Size | Usage | Examples |
|------|------|-------|-------|----------|
| **sm** | `--icon-sm` | 18px | Compact toggles, helper icons, inline accessories | Bold/italic buttons, legend size indicators, badges |
| **base** | `--icon-base` | 20px | Standard inline icons, navigation | Header nav icons (chart type selector), dropdown indicators, form icons, alignment controls |
| **lg** | `--icon-lg` | 32px | Action buttons, prominent CTAs | Add/remove row buttons, floating action buttons, prominent control icons |
| **xl** | `--icon-xl` | 36px | Selectable grids, large interactive surfaces | Icon pickers (pictogram, emoji, stickers), large grid selections |

### Implementation Notes
- **Always use CSS variables** (`--icon-sm`, `--icon-base`, `--icon-lg`, `--icon-xl`), never hard-code pixel values
- **Responsive adjustments**: Mobile versions may use slightly smaller sizes (e.g., icon-base: 20px desktop → 19px mobile); document these as responsive scaling, not semantic tier changes
- **Container ratios**: Icon containers (buttons, grid items) maintain proportional sizing to accommodate icons (e.g., header nav: 38px desktop / 36px mobile container for 20px / 19px icon = ~52% ratio)

### Icon Colors - Contextual

**Default**: `#1f1f1f` (primary text color)
**Disabled**: `#999999` (muted, 50% opacity)

**Active**: Context-dependent
| Context | Icon Color | Background | Notes |
|---------|-----------|-----------|-------|
| Toggle buttons | `#ffffff` | `#555555` | Lighter bg, clear contrast |
| Primary actions | `#ffffff` | `#5422b0` | Brand bg, strong action signal |
| Navigation | `#ffffff` | `#5422b0` | Brand bg, consistent with primary |

**Rationale**: Icon colors follow text hierarchy. Active states invert icon color and change background for strong visual signal. #555555 used for secondary toggles (softer than pure black), #5422b0 for primary actions (brand emphasis).

### Icon Implementation
- **Preferred**: SVG (scalable, colorable, reusable via `--icon-*` variables)
- **Fallback**: PNG for fixed sizes (legacy or special cases)
- **Status**: ✓ Standardized with semantic CSS variables across all apps

---

## 11. TRANSITIONS & ANIMATIONS

### Standard Durations (CSS Variables)

All transition and animation durations must use semantic CSS variables, never hard-code values.

| Tier | CSS Variable | Duration | Usage |
|------|------|----------|-------|
| Fast | `--duration-fast` | 200ms | Button hover, small toggles, quick feedback, input focus |
| Normal | `--duration-normal` | 300ms | Modal open, drawer open/close, panel transitions, dropdown animations |
| Slow | `--duration-slow` | 500ms | Page transitions, page load animations (for future use) |
| Spinner | `--duration-spinner` | 600ms | Infinite loading spinners, continuous animations |

### Easing Functions (CSS Variables)

| Name | CSS Variable | Value | Usage |
|------|------|-------|-------|
| Default | `--ease-default` | ease | Standard transitions (most interactive elements) |
| Out | `--ease-out` | ease-out | Entrance animations (modals, drawers opening) |
| In-Out | `--ease-in-out` | ease-in-out | Multi-phase animations (optional) |

### Implementation Notes
- **Always use CSS variables** (`--duration-fast`, `--duration-normal`, etc.) — never hard-code duration values
- **Always use CSS variables for easing** (`--ease-default`, `--ease-out`, etc.) — never hard-code easing values
- **Fast (200ms)** is ChartFlam's actual "fast" tier (slightly longer than 150ms for better perceived feedback)
- **Normal (300ms)** matches design system standard for panel/modal transitions
- **Spinner (600ms)** is specifically for infinite loops (slower spin = less jarring for extended loading states)
- **Respect `prefers-reduced-motion`** via media query to support accessibility

**Status**: ✓ Standardized with CSS variables across all apps

---

## 12. Z-INDEX LAYERS

Standard stacking order (always use CSS variables, never hard-code z-index values):

| Layer | CSS Variable | Value | Purpose |
|-------|------|-------|---------|
| Default | — | auto | Normal content (no z-index needed) |
| Dropdown | `--z-dropdown` | 50 | Dropdowns, menus, font selectors |
| Header | `--z-header` | 100 | App header, sticky section headers (stays above content on scroll) |
| Modal Overlay | `--z-modal-overlay` | 200 | Semi-transparent overlay behind modal (currently unused in Flam apps) |
| Modal/Drawer | `--z-modal` | 210 | Modal dialog, slide-out drawer, full-screen overlays |
| Tooltip | `--z-tooltip` | 220 | Tooltips, popovers, floating notifications (above all other layers) |

### Implementation Notes
- **Always use CSS variables** (`--z-dropdown`, `--z-header`, `--z-modal`, `--z-tooltip`) — never hard-code z-index values
- **Never invent new z-index values** — if your use case doesn't fit these tiers, propose a new tier to the design system
- **Stacking order is cumulative**: Higher values appear on top of lower values
- **Example**: A tooltip (220) will always appear above a modal (210) and dropdown (50)

**Status**: ✓ Standardized with CSS variables across all apps

---

## 13. MOBILE-FIRST APPROACH

All apps use **mobile-first design**:
- Default styles for mobile (< 480px)
- Responsive breakpoints at 768px+ (desktop/tablet)
- Constrain app width to 480px on desktop for consistency
- Touch-friendly targets (min 48px for interactive elements)

**Status**: ✓ Consistent across all apps

---

## 14. ACCESSIBILITY

### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Tab order must be logical
- Focus states must be visible (border thickening + color change)

**Focus State Implementation:**
- **Border thickness**: 1px (default) → 2px (focused)
- **Border color**: `var(--color-border)` (#e0e0e0) → `var(--color-border-active)` (#999999)
- **Transition**: Use `border-color 0.2s ease` for smooth color feedback
- **Rationale**: Combined thickness increase + color darkening provides clear visual feedback without outline
- **Applies to**: Text inputs, textareas, selects, color pickers, dropdowns
- **Color Variables**: See Section 1 (Color Palette → Border State Colors) for context
- **Status**: ✓ Implemented in ChartFlam; should apply to all apps

### Screen Reader Support
- Semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- ARIA attributes where needed (`aria-label`, `aria-expanded`, `aria-selected`, etc.)
- Alt text for images
- **Status**: Strong in ChartFlam; varies in others

### Color Contrast
- Text: Minimum WCAG AA (4.5:1 for normal, 3:1 for large)
- **Status**: Generally ✓ across apps

### Touch Targets
- Minimum 44–48px (Apple/Google standard)
- **Status**: Generally ✓; buttons/nav icons are 36–38px (slightly small but acceptable)

---

## 15. EXCEPTIONS & VARIATIONS

Currently, all Flam apps follow the core design system. If an app requires a deviation (custom color palette, different button style, etc.), document it below with rationale.

| App | Element | Difference | Rationale |
|-----|---------|-----------|-----------|
| AudioFlam | App Background Color | Uses `#efefef` (subtle grey) instead of pure white | Provides better visual hierarchy for nested panels and interactive elements; preference-based design decision approved for visual polish |
| AudioFlam | Trim Handle Bar Radius | Uses `2px` instead of standard scale | Micro-refinement on 4px-wide indicator bar in silence trimmer; improves perceived quality of trim controls without breaking standard scale |

---

## 17. ROADMAP & FUTURE WORK

1. **Icon System**: Create centralized SVG icon library (all icons in `/public/icons/`)
2. **Component Library**: Extract reusable components (Button, Input, Card, Header, etc.)
3. **Dark Mode** (Future): If needed, define dark color palette tokens
4. **Storybook/Design Tool**: Once stable, document in Figma or Storybook for visual reference
5. **Accessibility Audit**: Run full WCAG 2.1 AA audit across all apps

---

**Document Version**: 1.0  
**Last Updated**: February 2026  
**Maintained By**: Design & Development Team
