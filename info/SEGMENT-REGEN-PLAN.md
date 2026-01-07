# Sentence Regeneration Feature - Implementation Plan

**Status:** Approved for implementation  
**Created:** January 2026

---

## Overview

Enable users to regenerate individual sentences after initial audio generation, without regenerating the entire script. Useful when YarnGPT produces an error on one sentence while the rest is perfect.

---

## Key Constraints (User Requirements)

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | No breaking changes | Feature is additive; existing single-generation flow unchanged |
| 2 | MP3 output only | Use `lamejs` library for browser-based MP3 encoding after stitching |
| 3 | Mobile-first | Web Audio API with user gesture init for iOS; touch-friendly toolbar |
| 4 | Full sentence selection only | Toolbar appears only when selection matches complete sentence boundaries |
| 5 | Toolbar design | Cancel \| Regenerate... \| ✓ with animated dots, icon states, shadow |
| 6 | Audio normalization | Apply peak normalization during stitching |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Initial Generation (existing flow - unchanged)                 │
│  User types text → clicks Play → full audio generated           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Post-Generation: Segment Mode Activated                        │
│  - Text split into sentences (Intl.Segmenter / regex fallback)  │
│  - Each sentence stored with its audio slice info               │
│  - Full audio retained as primary playback source               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  User Selects Sentence                                          │
│  - Selection must match complete sentence boundaries            │
│  - Toolbar appears near selection                               │
│  - Sentence highlighted with lavender background                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Regenerate Flow                                                │
│  1. API call for selected sentence only (~30s for YarnGPT)      │
│  2. Trim 100ms from end (removes click artifact)                │
│  3. Store new segment, keep original for cancel                 │
│  4. User can: ✓ Accept | Cancel | Regenerate again              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  On Accept (✓)                                                  │
│  1. Stitch all segments (Web Audio API)                         │
│  2. Apply 50ms crossfade at boundaries                          │
│  3. Normalize volume                                            │
│  4. Encode to MP3 (lamejs)                                      │
│  5. Replace main audio, dismiss toolbar                         │
│  6. Play button plays from start of regenerated sentence        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phased Implementation

### Phase 0: Setup & Data Model (~1 hour)

**Files to create/modify:**
- `src/lib/stores.ts` - Add segment types and stores
- `src/lib/sentenceSplit.ts` - Sentence boundary detection
- `package.json` - Add `lamejs` dependency

**Segment data model:**
```typescript
interface AudioSegment {
  id: string;
  index: number;
  text: string;
  startChar: number;        // Position in full text
  endChar: number;
  audioBase64: string;      // MP3 from API
  originalAudioBase64?: string;  // For cancel/revert
  status: 'idle' | 'generating' | 'ready' | 'pending-accept';
}
```

**Stores:**
```typescript
export const segments = writable<AudioSegment[]>([]);
export const selectedSegmentIndex = writable<number | null>(null);
export const segmentModeActive = writable<boolean>(false);
```

---

### Phase 1: Sentence Splitting & Initial Segment Creation (~2 hours)

**Trigger:** After successful initial audio generation

**Logic:**
1. Parse `textInput` into sentences using `Intl.Segmenter` (with regex fallback)
2. Create segment objects with text boundaries
3. Store full audio as single blob (existing behavior preserved)
4. Set `segmentModeActive = true`

**Sentence splitter (src/lib/sentenceSplit.ts):**
```typescript
export function splitIntoSentences(text: string): Sentence[] {
  // Use Intl.Segmenter if available (modern browsers)
  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    // ...
  }
  // Fallback: regex split on .!? with lookbehind for abbreviations
}
```

---

### Phase 2: Selection Detection & Toolbar UI (~3-4 hours)

**Selection validation logic:**
```typescript
function getSelectedSentenceIndex(): number | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;
  
  const selectedText = selection.toString().trim();
  
  // Find exact sentence match
  for (const seg of segments) {
    if (seg.text.trim() === selectedText) {
      return seg.index;
    }
  }
  return null; // Selection doesn't match a complete sentence
}
```

**Toolbar component (src/lib/components/SentenceToolbar.svelte):**

```svelte
<div class="sentence-toolbar" style="top: {toolbarY}px; left: {toolbarX}px">
  <button class="toolbar-btn cancel" onclick={handleCancel}>
    Cancel
  </button>
  <div class="toolbar-divider"></div>
  <button class="toolbar-btn regenerate" onclick={handleRegenerate} disabled={isRegenerating}>
    Regenerate{#if isRegenerating}<span class="animated-dots"></span>{/if}
  </button>
  <div class="toolbar-divider"></div>
  <button 
    class="toolbar-btn accept" 
    onclick={handleAccept} 
    disabled={!canAccept}
  >
    <img 
      src="/icons/icon-check-fill.svg" 
      alt="Accept"
      class:active={canAccept}
    />
  </button>
</div>
```

**Toolbar styles:**
```css
.sentence-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: var(--spacing-xs) var(--spacing-sm);
  z-index: 100;
}

.toolbar-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.toolbar-btn.accept img {
  width: 20px;
  height: 20px;
  filter: invert(60%); /* #999999 equivalent */
}

.toolbar-btn.accept img.active {
  filter: invert(22%) sepia(95%) saturate(2000%) hue-rotate(254deg); /* #5422b0 */
}

.animated-dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}
```

---

### Phase 3: Regeneration API Call (~1 hour)

**On "Regenerate" click:**
1. Store current segment audio as `originalAudioBase64`
2. Set segment status to `'generating'`
3. Call `/api/tts` with sentence text only
4. On success: set `audioBase64` to new audio, status to `'pending-accept'`
5. Enable ✓ button (turns purple)

```typescript
async function regenerateSegment(index: number) {
  const seg = segments[index];
  
  // Store original for cancel
  seg.originalAudioBase64 = seg.audioBase64;
  seg.status = 'generating';
  
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: seg.text,
      voiceName: selectedVoice.name,
      provider: selectedVoice.provider
    })
  });
  
  const data = await res.json();
  seg.audioBase64 = data.audioContent;
  seg.status = 'pending-accept';
}
```

---

### Phase 4: Audio Stitching with Web Audio API (~4-6 hours)

**Create: src/lib/audioStitch.ts**

```typescript
const TRIM_TAIL_MS = 100;
const CROSSFADE_MS = 50;

export async function stitchSegments(
  segments: AudioSegment[]
): Promise<ArrayBuffer> {
  const audioCtx = new AudioContext();
  
  // 1. Decode all segments to AudioBuffers
  const buffers = await Promise.all(
    segments.map(seg => decodeBase64ToAudioBuffer(audioCtx, seg.audioBase64))
  );
  
  // 2. Calculate total duration with crossfade overlap
  const sampleRate = buffers[0].sampleRate;
  const trimSamples = Math.floor((TRIM_TAIL_MS / 1000) * sampleRate);
  const crossfadeSamples = Math.floor((CROSSFADE_MS / 1000) * sampleRate);
  
  let totalSamples = 0;
  for (let i = 0; i < buffers.length; i++) {
    const effectiveLength = buffers[i].length - trimSamples;
    totalSamples += (i === 0) ? effectiveLength : (effectiveLength - crossfadeSamples);
  }
  
  // 3. Create offline context and render
  const offline = new OfflineAudioContext(1, totalSamples, sampleRate);
  
  // ... (schedule sources with gain automation for crossfade)
  
  const rendered = await offline.startRendering();
  
  // 4. Normalize
  normalizeAudioBuffer(rendered);
  
  // 5. Encode to MP3 using lamejs
  return encodeToMP3(rendered);
}

function normalizeAudioBuffer(buffer: AudioBuffer): void {
  const data = buffer.getChannelData(0);
  let maxAbs = 0;
  for (let i = 0; i < data.length; i++) {
    maxAbs = Math.max(maxAbs, Math.abs(data[i]));
  }
  if (maxAbs > 0 && maxAbs < 1) {
    const gain = 0.95 / maxAbs;
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}
```

---

### Phase 5: MP3 Encoding with lamejs (~2 hours)

**Install:**
```bash
npm install lamejs
npm install -D @types/lamejs
```

**Encoder function:**
```typescript
import lamejs from 'lamejs';

export function encodeToMP3(audioBuffer: AudioBuffer): ArrayBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.getChannelData(0);
  
  // Convert Float32 to Int16
  const int16Samples = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const mp3Data: Int8Array[] = [];
  
  const blockSize = 1152;
  for (let i = 0; i < int16Samples.length; i += blockSize) {
    const chunk = int16Samples.subarray(i, i + blockSize);
    const mp3buf = mp3encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Int8Array(mp3buf));
    }
  }
  
  const finalBuf = mp3encoder.flush();
  if (finalBuf.length > 0) {
    mp3Data.push(new Int8Array(finalBuf));
  }
  
  // Combine all chunks
  const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of mp3Data) {
    result.set(new Uint8Array(buf.buffer), offset);
    offset += buf.length;
  }
  
  return result.buffer;
}
```

---

### Phase 6: Accept/Cancel/Play Logic (~2 hours)

**On ✓ Accept:**
1. Call `stitchSegments()` with all segments
2. Create blob URL from MP3 result
3. Replace `audioUrl` with new stitched audio
4. Clear selection, hide toolbar
5. Set playback position to start of regenerated sentence
6. Auto-play from that position

**On Cancel:**
1. Restore `originalAudioBase64` to `audioBase64`
2. Clear selection, hide toolbar
3. Keep original full audio unchanged

**On Play (after accept):**
```typescript
function playFromSentence(segmentIndex: number) {
  if (!audioElement) return;
  
  // Calculate start time of this segment
  let startTime = 0;
  for (let i = 0; i < segmentIndex; i++) {
    startTime += segments[i].durationSec;
  }
  
  audioElement.currentTime = startTime;
  audioElement.play();
}
```

---

## Icon Required

Add `icon-check-fill.svg` to `static/icons/`:
- Size: 24x24
- Color: Use currentColor or #5422b0 for filled version

---

## Testing Checklist

- [ ] Initial generation works exactly as before (no regression)
- [ ] Sentences correctly split for various punctuation patterns
- [ ] Toolbar only appears when full sentence is selected
- [ ] Toolbar positioned correctly near selection
- [ ] Animated dots display during regeneration
- [ ] Check icon changes color when audio ready
- [ ] Cancel restores original audio
- [ ] Accept stitches and replaces audio
- [ ] Play starts from regenerated sentence
- [ ] Works on iOS Safari (AudioContext on gesture)
- [ ] Works on Android Chrome
- [ ] Download exports correct stitched MP3

---

## Estimated Effort

| Phase | Task | Hours |
|-------|------|-------|
| 0 | Setup & data model | 1 |
| 1 | Sentence splitting | 2 |
| 2 | Selection & toolbar UI | 4 |
| 3 | Regeneration API | 1 |
| 4 | Audio stitching | 6 |
| 5 | MP3 encoding | 2 |
| 6 | Accept/Cancel/Play | 2 |
| - | Testing & polish | 4 |
| **Total** | | **~22 hours** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| iOS AudioContext blocked | Create on first user gesture (existing play button) |
| lamejs bundle size (~90KB) | Acceptable for this feature; lazy-load if needed |
| Sentence split errors | Allow manual text editing to adjust |
| YarnGPT rate limiting | Sequential regeneration, not parallel |
| Sample rate mismatch | Validate all segments share same rate before stitching |
