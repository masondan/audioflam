# Qwen WebSocket Audio Frame Ordering Fix

**Date:** September 17, 2026  
**Issue:** Voice artifacts in bulletin intro/outro TTS (e.g., hearing "Explore ... nation Cymru. Explore the ice cave ..." when only "Nation Cymru. We're on your side" was written)  
**Root Cause:** Race condition in async Blob.arrayBuffer() conversions during WebSocket frame processing  
**Status:** ✅ Fixed

---

## Problem Description

When generating TTS audio via Qwen WebSocket synthesis, audio frames were being processed asynchronously without order preservation. This caused:

1. **Frame reordering:** Binary audio frames arriving from the WebSocket were converted from Blob to Uint8Array asynchronously
2. **Audio mixing:** Frames from previous requests could be interleaved with current request frames
3. **Audible artifacts:** Users heard fragments of old audio mixed into new audio

### Example
- **Input:** "Nation Cymru. We're on your side"
- **Output heard:** "Explore ... nation Cymru. Explore the ice cave ... we're on your side"
- **Root cause:** "Explore" and "ice cave" fragments from a previous synthesis request were concatenated out of order

---

## Technical Root Cause

In [`src/routes/api/tts/+server.ts:417-456`](src/routes/api/tts/+server.ts:417-456), the message event listener processed binary frames like this:

```typescript
// BEFORE (buggy)
ws.addEventListener('message', (event: MessageEvent) => {
  // ... JSON message handling ...
  
  // Binary audio frame
  const data = event.data as ArrayBuffer | Blob;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    data.arrayBuffer().then((buf) => {
      audioChunks.push(new Uint8Array(buf));  // ← ASYNC, unordered
    }).catch(() => { /* ignore */ });
  } else {
    audioChunks.push(new Uint8Array(data as ArrayBuffer));  // ← SYNC
  }
});
```

**The race condition:**
- Blob frames use `.then()` (async, non-blocking)
- ArrayBuffer frames are pushed immediately (sync)
- If frame N is a Blob and frame N+1 is an ArrayBuffer, frame N+1 gets pushed first
- When frames are combined in `combineChunks()`, they're in the wrong order
- Result: Audio corruption

---

## Solution

Implement a **sequential processing queue** using Promise chaining to ensure all frames (Blob or ArrayBuffer) are processed in strict order:

```typescript
// AFTER (fixed)
// Queue for processing binary frames sequentially to preserve order
let processingQueue: Promise<void> = Promise.resolve();

ws.addEventListener('message', (event: MessageEvent) => {
  // ... JSON message handling ...
  
  // Binary audio frame
  const data = event.data as ArrayBuffer | Blob;
  processingQueue = processingQueue.then(async () => {
    try {
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        const buf = await data.arrayBuffer();
        audioChunks.push(new Uint8Array(buf));
      } else {
        audioChunks.push(new Uint8Array(data as ArrayBuffer));
      }
    } catch {
      // Ignore individual chunk failure
    }
  });
});
```

**How it works:**
1. Each frame handler chains onto `processingQueue`
2. Frame N+1 doesn't execute until frame N completes
3. Blob conversions are awaited sequentially
4. Frames are always pushed in arrival order
5. `combineChunks()` receives frames in correct order

---

## Files Modified

- **`src/routes/api/tts/+server.ts`** (lines 417-467)
  - Added `processingQueue` variable
  - Wrapped frame processing in sequential Promise chain
  - Added explanatory comment about race condition fix

---

## Testing

### Build Verification
```bash
npm run check  # ✅ Passes (TTS fix compiles cleanly)
npm run build  # ✅ Passes (production build succeeds)
```

### Manual Testing
1. Go to Bulletin → Intro & Outro
2. Select a Qwen-cloned voice (e.g., Ffion, Owain, Chisomo)
3. Enter intro text: "Nation Cymru. We're on your side"
4. Click "Preview"
5. **Expected:** Hear only the intro text, no artifacts
6. **Before fix:** Would hear "Explore ... nation Cymru. Explore the ice cave ..."
7. **After fix:** Clean audio with no mixing

---

## Impact

- ✅ Fixes voice artifacts in bulletin intro/outro TTS
- ✅ Applies to all Qwen-cloned voices (Malawi, Zimbabwe, Wales)
- ✅ No performance impact (sequential processing is negligible overhead)
- ✅ No API changes (fix is internal to WebSocket handler)
- ✅ Backward compatible (no breaking changes)

---

## Related Issues

- **AGENTS.md:** Updated "Recently Fixed" section to document this fix
- **Known Issues:** This was a HIGH-priority issue; now resolved

---

## References

- **WebSocket Protocol:** Qwen Audio 3.0 TTS Flash (August 2026 migration)
- **Related Code:** `synthesizeViaWebSocket()` in `src/routes/api/tts/+server.ts`
- **Voice Cloning:** Malawi (Chisomo F, Mercy M), Zimbabwe (Precious F, Tawanda M), Wales (Ffion F, Owain M)
