# AudioFlam PWA Configuration

**Status:** ✅ Complete (May 2026)

## Overview

AudioFlam is configured as a Progressive Web App (PWA) that:
- ✅ Suppresses the install prompt (sub-app in flamtools.com suite)
- ✅ Behaves like a PWA when accessed (standalone display, no browser chrome)
- ✅ Provides offline caching via service worker
- ✅ Includes splash screen, theme colors, and icons

## Configuration Checklist

### Manifest (`static/manifest.json`)
- ✅ `display: "standalone"` — removes browser chrome
- ✅ `name` & `short_name` — "AudioFlam"
- ✅ `start_url: "/"` — entry point
- ✅ `scope: "/"` — PWA scope
- ✅ `theme_color` & `background_color` — both `#5422b0`
- ✅ Icons: 512x512 (any) + 192x192 (maskable)
- ✅ Screenshots: 1200x630 (wide form factor)

### HTML Meta Tags (`src/app.html`)
- ✅ `<link rel="manifest" href="/manifest.json">` — manifest linked
- ✅ `<meta name="theme-color" content="#5422b0">` — theme color
- ✅ `<meta name="mobile-web-app-capable" content="yes">` — iOS PWA support
- ✅ `<meta name="apple-mobile-web-app-capable" content="yes">` — iOS home screen
- ✅ `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` — iOS status bar
- ✅ `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` — iOS icon
- ✅ `<meta name="robots" content="noindex, nofollow">` — educational use only

### Install Prompt Suppression (`src/app.html`, lines 54-60)
```javascript
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  // Suppress install prompt — app behaves as PWA without install UI
});
```

This prevents the "Install App?" prompt while maintaining all PWA features.

### Service Worker (`src/service-worker.js`)
- ✅ Created and integrated
- ✅ Caches app assets on install
- ✅ Serves from cache on fetch (offline support)
- ✅ Excludes API calls (`/api/*`) from caching
- ✅ Excludes media files (`.mp4`, `.mp3`, `.wav`, `.webm`) from caching
- ✅ Cache name: `audioflam-{version}` (auto-versioned)

**Build Output:** `.svelte-kit/output/client/service-worker.js` (3.79 KB minified)

## How It Works

### On First Visit
1. Browser downloads app assets
2. Service worker installs and caches all static assets
3. `beforeinstallprompt` event is suppressed (no install UI shown)
4. App displays with standalone chrome (no URL bar, etc.)

### On Subsequent Visits
1. Service worker serves cached assets (fast load)
2. Network requests for API/media bypass cache (always fresh)
3. App works offline for cached content

### On iOS Safari
- App can be added to home screen via "Share → Add to Home Screen"
- Displays with standalone chrome (no browser UI)
- Uses theme color and icon from manifest
- Status bar styled per `apple-mobile-web-app-status-bar-style`

### On Android Chrome
- App can be installed via "Install app" menu (if user chooses)
- Displays with standalone chrome
- Uses theme color and icon from manifest
- Service worker provides offline support

## Key Design Decisions

### Why Suppress Install Prompt?
AudioFlam is part of the flamtools.com suite. Suppressing the prompt:
- Prevents confusion (users don't expect to "install" a sub-app)
- Maintains clean UX (no popup interruptions)
- Still provides full PWA features (offline, standalone, splash screen)

### Why Exclude Media from Cache?
- Audio/video files are large (100MB+)
- Users expect fresh media (not stale cached versions)
- API calls are excluded for the same reason (always fetch fresh data)

### Why Use Service Worker?
- Enables offline support for app shell
- Improves load performance (cached assets load instantly)
- Provides better UX on slow networks
- Standard PWA pattern (works across all modern browsers)

## Testing

### Desktop Chrome
1. Open DevTools → Application → Service Workers
2. Verify service worker is registered and active
3. Check "Offline" checkbox
4. Reload page — app should load from cache
5. Try accessing `/api/*` — should fail (not cached)

### Mobile Chrome (Android)
1. Open app in Chrome
2. Menu → "Install app" (may appear)
3. If installed, app opens in standalone mode (no URL bar)
4. DevTools → Application → Service Workers (same as desktop)

### iOS Safari
1. Open app in Safari
2. Share → "Add to Home Screen"
3. App opens in standalone mode (no Safari chrome)
4. Service worker works (offline support)

### Offline Testing
1. Register service worker (first visit)
2. Go offline (DevTools → Network → Offline)
3. Reload page — app shell loads from cache
4. Try TTS/Transcription — fails gracefully (API unavailable)

## Deployment

### Cloudflare Pages
- Service worker is automatically deployed with the app
- No additional configuration needed
- Cache headers are managed by Cloudflare

### Environment Variables
- No PWA-specific env vars needed
- All configuration is in manifest.json and app.html

## Future Enhancements

- [ ] Add offline indicator (show when service worker is active)
- [ ] Add "Update available" prompt (when new version deployed)
- [ ] Implement background sync (queue TTS requests when offline)
- [ ] Add install prompt for standalone app (if needed in future)

## References

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev: PWA Checklist](https://web.dev/pwa-checklist/)
- [SvelteKit: Service Workers](https://kit.svelte.dev/docs/service-workers)
- [Cloudflare Pages: PWA Support](https://developers.cloudflare.com/pages/)

---

**Last Updated:** May 2026
**Maintainer:** AudioFlam Team
