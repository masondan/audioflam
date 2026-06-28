import { build, files, version } from '$service-worker';

const CACHE = `audioflam-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never intercept external requests (Hugging Face CDN, etc.)
  // The Whisper model files must be fetched and cached by the
  // transformers.js library itself via the Cache API — not by us.
  if (url.origin !== self.location.origin) return;

  // Don't cache API calls or large media/model files
  if (url.pathname.startsWith('/api') ||
      /\.(mp4|mp3|wav|webm|blob|onnx|bin)$/.test(url.pathname)) return;

  e.respondWith(
    caches.match(e.request).then(r => r ?? fetch(e.request))
  );
});
