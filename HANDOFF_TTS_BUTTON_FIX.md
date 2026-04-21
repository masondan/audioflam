# Handoff: TTS Page Play Button Styling Fix

## What We Were Trying to Fix
Apply the new play/pause button styling from the audiogram page to the TTS page (`src/routes/+page.svelte`). The buttons should look identical:
- Purple outer circle with white border
- Purple inner button background
- White play/pause icon
- Spinner animation on outer circle during TTS generation

## Root Cause Identified
The TTS page button CSS was missing the **box-shadow** technique used by the audiogram page to create the double-ring visual effect. The audiogram uses:
```css
box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px var(--color-primary);
```
This creates:
- Inner ring: 3px white gap
- Outer ring: 6px purple border (the spinner)

## Approaches Tried & Why They Failed

### Attempt 1: Simple filter on icon
- Changed icon from SVG to `<img>` tags with `icon-play-new.svg` and `icon-pause-new.svg`
- Applied `filter: brightness(0) invert(1)` to make icon white
- **Failed:** Icon was white on white background (invisible) because button background was white, not purple

### Attempt 2: Color-based filters
- Tried `filter: brightness(0) saturate(100%) invert(25%) sepia(100%) saturate(500%) hue-rotate(250deg)` to make icon purple
- **Failed:** Icon turned magenta instead of purple, and button background still wasn't purple

### Attempt 3: Simple invert filter
- Changed to `filter: brightness(0) invert(1)` for all states
- **Failed:** Same issue - white icon on white background, no purple inner button visible

## Current State of Code

### Button Markup (lines 1438-1461 in `src/routes/+page.svelte`)
✅ Correct - uses new icon images:
```svelte
{#if isPlaying}
  <img src="/icons/icon-pause-new.svg" alt="Pause" class="play-icon" />
{:else}
  <img src="/icons/icon-play-new.svg" alt="Play" class="play-icon" />
{/if}
```

### Button CSS (lines 1893-1961 in `src/routes/+page.svelte`)
❌ **BROKEN** - Missing box-shadow and purple background:
```css
.play-btn {
  width: 50px;
  height: 50px;
  background: var(--bg-white);  /* ❌ Should be grey by default */
  border: 3px solid #777777 !important;
  /* ❌ Missing box-shadow for double-ring effect */
}

.play-btn.active {
  border-color: var(--color-primary) !important;
  background: var(--bg-white);  /* ❌ Should be var(--color-primary) */
  /* ❌ Missing box-shadow */
}

.play-btn .play-icon {
  filter: brightness(0) invert(1);  /* ❌ Makes white icon on white background */
}
```

### Correct Reference (Audiogram Page, lines 2330-2390)
✅ This is what we need to match:
```css
.play-btn {
  width: 50px;
  height: 50px;
  background: #999999;  /* Grey by default */
  border: 3px solid #999999 !important;
  box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px #999999;  /* Double ring */
}

.play-btn.active {
  border-color: var(--color-primary) !important;
  background: var(--color-primary);  /* Purple inner button */
  box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px var(--color-primary);  /* Purple outer ring */
}

.play-btn.active .play-icon {
  color: white;
  filter: brightness(0) invert(1);  /* White icon on purple background */
}

.play-icon {
  width: 24px;  /* Smaller than TTS (40px) */
  height: 24px;
  color: white;
  filter: brightness(0) invert(1);
}
```

## What To Try Next

1. **Update `.play-btn` base styles:**
   - Change `background: var(--bg-white)` → `background: #999999`
   - Change `border: 3px solid #777777` → `border: 3px solid #999999`
   - Add `box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px #999999`

2. **Update `.play-btn.active` styles:**
   - Change `background: var(--bg-white)` → `background: var(--color-primary)`
   - Add `box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px var(--color-primary)`

3. **Update `.play-btn.playing` styles:**
   - Add same box-shadow as `.play-btn.active`

4. **Update `.play-btn .play-icon`:**
   - Change `width: 40px; height: 40px` → `width: 24px; height: 24px` (match audiogram)
   - Add `color: white` (explicit)
   - Keep `filter: brightness(0) invert(1)`

5. **Update `.play-btn.loading` styles:**
   - Add `box-shadow: 0 0 0 3px var(--bg-white), 0 0 0 6px var(--color-primary)` (purple outer ring during loading)

6. **Icon size note:**
   - Audiogram uses 24x24px icons
   - TTS currently uses 40x40px
   - Need to decide: match audiogram (24x24) or keep TTS size (40x40)?
   - Recommend: **Match audiogram at 24x24px for consistency**

## Key Insight
The double-ring effect is achieved entirely through **box-shadow**, not borders. The outer ring (spinner during loading) is the outer box-shadow layer. The inner button background must be purple when active, with a white gap between inner and outer rings created by the first box-shadow layer.
