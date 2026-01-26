# AudioFlam Enhanced Features Roadmap

**Status:** Planning Phase  
**Objective:** Extend AudioFlam from basic TTS to professional audiogram creation with waveform visualization, silence removal, and subtitle support.

---

## Overview

This roadmap outlines modular feature additions to AudioFlam, grouped by core functionality and optional enhancements. Each module is self-contained and can be implemented, tested, and amended independently.

**Key Principles:**
- Simplicity first (avoid feature creep)
- Educational use (Africa-focused device compatibility)
- Zero additional hosting costs where possible
- Modular architecture (decisions on design/templates can be deferred)

---

## Core Modules (MVP Phase)

### Module 1: Silence Removal (Server-Side FFmpeg)

**Objective:** Remove/compress silences in TTS-generated audio post-generation.

**Technology:** FFmpeg running on Cloudflare Workers  
**Approach:** Server-side processing, client-side triggering

**Implementation:**

1. **Create new API endpoint:** `POST /api/audio/silence-removal`
   - Input: Base64-encoded MP3 audio
   - Parameters: 
     - `silenceThreshold`: -40dB (default)
     - `minSilenceDuration`: 500ms (default)
     - `compressionMode`: 'remove' | 'compress' (default: 'compress')
   - Output: Base64-encoded processed MP3

2. **FFmpeg filter chain:**
   ```bash
   ffmpeg -i input.mp3 \
     -af "silenceremove=start_periods=1:start_duration=1:start_threshold=-40dB:
           detection=peak,aformat=dblp,areverse,silenceremove=start_periods=1:
           start_duration=1:start_threshold=-40dB:detection=peak,areverse" \
     output.mp3
   ```

3. **Update TTS workflow:**
   - After TTS generation, optionally call silence-removal endpoint
   - Add UI toggle: "Remove silences" checkbox
   - Show processing status (progress indicator)

4. **Testing checklist:**
   - [ ] Process 1-minute audio without timeout
   - [ ] Verify audio quality post-processing
   - [ ] Test on slow connections (show spinner, not freeze)
   - [ ] Confirm Cloudflare Workers can handle FFmpeg (worker size constraints)
   - [ ] Test with both Azure and YarnGPT audio

5. **Fallback strategy:**
   - If Cloudflare Workers too constrained, delegate to external service (analyze cost)
   - Document decision in code comments

**Status:** ✅ Implemented (January 2026)  
**Dependencies:** None (independent module)

---

### Module 2: Waveform Preview (Client-Side Wavesurfer.js)

**Objective:** Display animated waveform during audio playback and export.

**Technology:** Wavesurfer.js (client-side Web Audio API)  
**Approach:** Real-time visualization of audio frequency data

**Implementation:**

1. **Install and configure Wavesurfer.js**
   - Add to `package.json`: `wavesurfer.js`
   - Create new component: `src/lib/components/WaveformPreview.svelte`

2. **WaveformPreview component:**
   ```svelte
   <script>
     import WaveSurfer from 'wavesurfer.js';
     
     export let audioBlob;
     export let isPlaying = false;
     
     // Initialize wavesurfer with:
     // - Container: <div id="waveform"></div>
     // - Height: 100px (responsive)
     // - Color: --color-primary (#5422b0)
     // - Progress color: --color-lavender-veil (#f0e6f7)
     // - Format: "bars" or "wave" (configurable)
   </script>
   
   <div id="waveform" class="waveform-container"></div>
   ```

3. **Integrate into app flow:**
   - After TTS generation, display waveform preview
   - Show play/pause button over waveform
   - Display duration and current time
   - Option to preview before proceeding to composition

4. **Styling:**
   - Use existing CSS variables (--color-primary, --color-lavender-veil)
   - Responsive width (mobile-first)
   - Optional dark theme variant

5. **Testing checklist:**
   - [ ] Waveform renders on first load
   - [ ] Play/pause syncs with audio
   - [ ] Responsive on mobile (small screens)
   - [ ] Performance on older devices (test on 2GB RAM Android)
   - [ ] No lag when scrubbing timeline

**Status:** Ready for implementation  
**Dependencies:** None (independent module)

---

### Module 3: Audio → Image → MP4 Composition (Cloudflare Stream)

**Objective:** Combine audio, static image, and overlays into MP4 video for download.

**Technology:** Cloudflare Stream with 30-minute auto-delete  
**Approach:** Server-side video composition

**Implementation:**

1. **Create new API endpoint:** `POST /api/video/compose`
   - Input:
     - `audioUrl`: Base64 or URL to final audio
     - `imageUrl`: Base64 or URL to background image
     - `duration`: Video duration (seconds)
     - `overlays`: Array of text/graphic overlays (see Module 4)
     - `effects`: Object with bokeh, waveform, stinger settings
   - Output: Download link to MP4 (signed URL, expires in 30 min)

2. **Cloudflare Stream integration:**
   - Store API token in env: `CLOUDFLARE_STREAM_TOKEN`
   - Use `@cloudflare/stream` SDK
   - Set auto-delete: Metadata field `expiresAt: +30 minutes`
   - Documentation: https://developers.cloudflare.com/api/operations/stream-list-videos

3. **Video composition pipeline:**
   - Create temporary MP4 skeleton (image frame, audio track)
   - Apply overlays (see Module 4)
   - Apply visual effects (see Module 5: Bokeh)
   - Add waveform visualization (see Module 6)
   - Add subtitle track if enabled (see Optional Module: Subtitles)
   - Upload to Stream, get signed download URL

4. **Workflow integration:**
   - After silence removal, present preview
   - User selects image, bokeh style, text overlays
   - Click "Generate Audiogram"
   - API processes (show progress: image load → audio sync → composition)
   - Return download link + option to share (Stream direct link)

5. **Testing checklist:**
   - [ ] Upload 1-minute video to Stream successfully
   - [ ] Auto-delete fires after 30 minutes
   - [ ] Download link remains valid for full duration
   - [ ] Video quality acceptable (bitrate: 1080p @ 5Mbps)
   - [ ] Works across device types (web, mobile, tablet)
   - [ ] Large files (5+ min) don't timeout

6. **Cost monitoring:**
   - Log bytes stored per day
   - Alert if approaching unexpected usage
   - Document actual costs monthly

**Status:** Ready for investigation  
**Dependencies:** Module 1 (Silence Removal), Module 2 (Waveform), Module 4 (Text Overlays)

---

### Module 4: Text Overlays (Question/Title Templates)

**Objective:** Add customizable text overlays to images (titles, questions, speaker labels).

**Technology:** Canvas text rendering (client-side composition) or FFmpeg text filter (server-side)  
**Approach:** TBD during investigation

**Implementation:**

1. **Design text overlay system:**
   - Overlay types:
     - `title`: Top of image, question/hook text
     - `speaker_label`: Bottom-left/right, speaker name (for multi-speaker)
     - `timestamp`: Optional timestamp overlay
   - Properties:
     - Position (x, y coordinates or preset: top-left, center, bottom)
     - Font size (responsive)
     - Color (CSS color or preset: white, indigo-bloom, lavender)
     - Font (Inter, system font)
     - Opacity (0-100%)
     - Background (none, semi-transparent box)

2. **Text overlay component:** `src/lib/components/TextOverlayEditor.svelte`
   - Text input field
   - Position selector (grid: 9 positions)
   - Font size slider
   - Color picker (or preset select)
   - Preview canvas (show how overlay looks on image)
   - Delete/clear button

3. **Integration points:**
   - In `src/routes/app/+page.svelte`, add overlay editor before composition
   - Store overlay config in state
   - Pass to composition API

4. **Rendering approach (choose one during investigation):**
   - **Option A: Client-side Canvas**
     - Render text on canvas before sending image to composition
     - Bake text into image bytes
     - Pros: Simple, predictable
     - Cons: Text can't be edited after composition
   
   - **Option B: Server-side FFmpeg**
     - Send text config + image to composition API
     - Use FFmpeg `-vf drawtext=...` filter
     - Pros: Text stays editable in metadata, shareable
     - Cons: More complex FFmpeg syntax

   - **Decision pending:** Investigate both, measure performance/complexity

5. **Multi-speaker label handling:**
   - For Q&A format, optionally show "Speaker: [name]" before their segment
   - Auto-position labels at segment start time
   - Fade in/out with speech

6. **Testing checklist:**
   - [ ] Text renders correctly on image
   - [ ] Text is readable on various image backgrounds (light/dark)
   - [ ] Position controls work intuitively
   - [ ] Font size scales properly on mobile
   - [ ] Special characters (Nigerian names) render correctly
   - [ ] Preview matches final output

**Status:** Ready for design/investigation  
**Dependencies:** Module 3 (Composition)

---

### Module 5: Bokeh Effect (Visual Polish)

**Objective:** Add subtle, animated bokeh effect to static image background for visual interest.

**Technology:** CSS filters + Canvas/Three.js particle system  
**Approach:** Client-side rendering during video composition

**Implementation:**

1. **Investigate three bokeh style templates:**

   **Template A: Soft Blur Overlay**
   - Simple CSS `blur(1-2px)` + `brightness(1.05)` on image
   - Optional: Semi-transparent colored overlay (lavender tint)
   - Effort: Minimal (2-3 lines CSS)
   - Result: Subtle depth, less distraction
   - Best for: Professional/journalism content

   **Template B: Animated Particle Bokeh**
   - Use Three.js or Canvas 2D to render 50-100 floating particles
   - Particles: Semi-transparent circles, slow drift animation
   - Color: Match design system (lavender, indigo tints)
   - Opacity: 10-30% (subtle)
   - Performance: Test on low-end devices
   - Effort: Medium (100-150 lines)
   - Result: Professional, motion-based interest
   - Best for: Social media sharing, dynamic content

   **Template C: Radial Blur (Depth Effect)**
   - Gaussian blur increases from center outward (focused on center)
   - Center remains sharp, edges blur
   - Creates impression of depth
   - Effort: Low-Medium (Canvas filter, ~50 lines)
   - Result: Cinematic feel
   - Best for: Title slides, intro images

2. **Bokeh implementation flow:**
   - User selects image in composition step
   - UI shows three bokeh template previews (small thumbnails)
   - User selects one (or "none")
   - Template is applied during video composition
   - If particles: bake into MP4, don't render in real-time

3. **Component:** `src/lib/components/BokehSelector.svelte`
   - Three radio buttons or thumbnail cards
   - Preview pane showing selected style on uploaded image
   - Intensity slider (if applicable)
   - Toggle on/off

4. **Integration with composition:**
   - Pass selected bokeh style to `/api/video/compose`
   - API applies template before rendering to MP4
   - Handle in FFmpeg or Canvas pre-processing

5. **Testing checklist:**
   - [ ] Three templates render correctly
   - [ ] Performance acceptable on test images
   - [ ] Bokeh doesn't interfere with text readability
   - [ ] Effect looks polished (not amateurish)
   - [ ] Works with various image types (photos, graphics, solid colors)
   - [ ] Performance on older devices (Template A should be default)

6. **Decision matrix (investigate):**
   - Which template best suits journalist use case?
   - Should users be able to customize colors/intensity?
   - Should bokeh be optional or always enabled?
   - Template A recommended as default (lowest friction)

**Status:** Ready for investigation (visual exploration)  
**Dependencies:** Module 3 (Composition)

---

## Optional Modules (Phase 2+)

### Optional Module A: Audio Stinger (Intro/Outro Music)

**Objective:** Add short intro/outro music with fade transitions to frame TTS dialogue.

**Technology:** Server-side FFmpeg audio mixing  
**Approach:** Blend stinger audio with TTS using FFmpeg filter chains

**Implementation:**

1. **Stinger audio source:**
   - Store 2-3 pre-selected stinger tracks in `static/audio/stingers/`
   - Stinger specs: 5-10 seconds, MP3, ~128kbps
   - Options: Uplifting, Professional, Minimal
   - Investigate: Royalty-free sources (YouTube Audio Library, Free Music Archive)

2. **Create new API endpoint:** `POST /api/audio/add-stinger`
   - Input:
     - `audioUrl`: Base64 TTS audio
     - `stingerType`: 'intro' | 'outro' | 'both'
     - `stingerTemplate`: 'uplifting' | 'professional' | 'minimal'
     - `fadeOutDuration`: 1000ms (default)
   - Output: Base64 processed audio with stinger blended

3. **Audio mixing logic:**
   - **Intro:** Stinger (5s) → fade out → TTS begins at 4s overlap (1s fade)
   - **Outro:** TTS ends → fade out → stinger plays (5s)
   - **Both:** Intro + TTS + Outro (concatenated with fades)

4. **FFmpeg filter chain example:**
   ```bash
   ffmpeg -i stinger.mp3 -i tts.mp3 \
     -filter_complex \
     "[0]afade=t=out:st=4:d=1[stinger]; \
      [stinger][1]concat=v=0:a=1[out]" \
     -map "[out]" output.mp3
   ```

5. **UI integration:**
   - Checkbox: "Add intro/outro music"
   - Dropdown: Select stinger template
   - Preview: Play 5-second sample before processing
   - Optional: Volume control for stinger vs. TTS

6. **Testing checklist:**
   - [ ] Stinger fades smoothly into TTS
   - [ ] Audio levels balanced (no clipping, no too-quiet stinger)
   - [ ] Timing accurate (no dead air, no overlap)
   - [ ] Works with multi-speaker audio (cumulative duration correct)
   - [ ] Outro plays after final speaker

7. **Investigation points:**
   - Which stinger templates work best for journalism/education context?
   - Should users be able to upload custom stingers?
   - Cost: Can this stay on Cloudflare Workers, or delegate to external service?

**Status:** Optional (investigate after core modules)  
**Dependencies:** Module 1 (Silence Removal) — stinger is applied pre-silence removal or post

---

### Optional Module B: Burned-In Subtitles (Whisper + FFmpeg)

**Objective:** Extract word-level timing from TTS audio and burn subtitles into final MP4.

**Technology:** OpenAI Whisper API + FFmpeg text overlay  
**Approach:** Transcribe audio to get timings, apply as SRT burn during composition

**Implementation:**

1. **Create new API endpoint:** `POST /api/video/add-subtitles`
   - Input:
     - `audioUrl`: Base64 audio file
     - `language`: 'en' (default), future: 'ha', 'yo' (Hausa, Yoruba)
     - `subtitleStyle`: CSS-like object (font size, color, position)
   - Output: SRT file content (in-memory, for next step)

2. **Whisper integration:**
   - Call OpenAI Whisper API to transcribe audio
   - Request word-level timestamps: `timestamp_granularity: 'word'`
   - Parse response into SRT format:
     ```
     1
     00:00:00,000 --> 00:00:00,450
     Why
     
     2
     00:00:00,450 --> 00:00:00,750
     is
     ```
   - Cost: ~$0.01-0.03 per video

3. **Multi-speaker handling:**
   - If dialogue script, track speaker names
   - Format subtitles as: `[Speaker Name]: word`
   - Or use Whisper's speaker detection (if available in API)

4. **Subtitle styling:**
   - Font: Inter (already available)
   - Size: 24-28pt (readable on mobile)
   - Color: White with semi-transparent black background (readability)
   - Position: Bottom-center (standard)
   - Customization: Optional (size, color picker)

5. **FFmpeg burning:**
   - Use `-vf subtitles=subs.srt` filter
   - Apply during composition (Module 3)
   - Specify subtitle style in filter:
     ```
     subtitles=subs.srt:force_style='FontSize=24,FontName=Inter,
     PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2'
     ```

6. **Workflow integration:**
   - Optional toggle: "Add subtitles" (disabled by default)
   - Show Whisper transcription preview for user review
   - Allow minor edits to subtitle text (e.g., correct names)
   - Click "Generate" → subtitles burned into final MP4

7. **Testing checklist:**
   - [ ] Whisper transcription accurate (especially Nigerian names)
   - [ ] Word timing sync with audio (no lag, no early subtitles)
   - [ ] Multi-speaker labeling works
   - [ ] Subtitles readable on various video backgrounds
   - [ ] No performance impact on composition (FFmpeg handles it)
   - [ ] Subtitle position doesn't overlap with other overlays

8. **Investigation points:**
   - Should subtitles be opt-in or default?
   - Can Whisper be run locally on Cloudflare Workers, or must use API?
   - Future: Support transcription in Hausa/Yoruba (requires Whisper training)
   - Cost tracking: Monitor Whisper API usage monthly

**Status:** Optional (investigate after core modules + stinger)  
**Dependencies:** Module 3 (Composition), Whisper API token in env

---

## Implementation Sequence (Suggested)

**Phase 1 (Core Video Pipeline):**
1. Module 2: Waveform Preview (low friction, visual feedback)
2. Module 1: Silence Removal (most requested feature)
3. Module 3: Audio → Image → MP4 Composition (integrates above two)

**Phase 2 (Polish & Features):**
4. Module 4: Text Overlays (narrative structure)
5. Module 5: Bokeh Effect (visual interest)

**Phase 3 (Optional Enhancements):**
6. Optional Module A: Audio Stinger (intro/outro music)
7. Optional Module B: Subtitles (accessibility + Whisper transcription)

---

## Architecture Notes

### File Structure (After Implementation)

```
src/
├── routes/
│   ├── app/
│   │   └── +page.svelte          ← Main editor (updated with new controls)
│   └── api/
│       ├── tts/
│       │   └── +server.ts        ← Existing TTS endpoint
│       ├── audio/
│       │   ├── silence-removal/
│       │   │   └── +server.ts    ← NEW: Module 1
│       │   └── add-stinger/
│       │       └── +server.ts    ← NEW: Optional Module A
│       └── video/
│           ├── compose/
│           │   └── +server.ts    ← NEW: Module 3
│           └── add-subtitles/
│               └── +server.ts    ← NEW: Optional Module B
├── lib/
│   ├── components/
│   │   ├── WaveformPreview.svelte      ← NEW: Module 2
│   │   ├── TextOverlayEditor.svelte    ← NEW: Module 4
│   │   ├── BokehSelector.svelte        ← NEW: Module 5
│   │   └── SpeakerDialog.svelte        ← Existing
│   ├── stores.ts                      ← Update with new state (overlays, bokeh, etc.)
│   └── utils/
│       ├── ffmpeg.ts                  ← NEW: FFmpeg utilities
│       ├── cloudflareStream.ts        ← NEW: Stream API wrapper
│       └── whisper.ts                 ← NEW: Optional Module B
└── app.css                             ← Update with new component styles
```

### Environment Variables (New)

```env
# Existing
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
YARNGPT_API_KEY=...

# New (for Modules)
CLOUDFLARE_STREAM_TOKEN=...        # Module 3
OPENAI_API_KEY=...                 # Optional Module B (Whisper)
```

---

## Testing Strategy

### Unit Tests (Per Module)
- Module 1: Silence removal (verify FFmpeg filters, audio quality)
- Module 2: Waveform (verify canvas rendering, responsiveness)
- Module 3: Composition (verify Stream API, file integrity)
- Modules 4-5: UI components (verify preview accuracy)

### Integration Tests
- Full workflow: TTS → Silence removal → Waveform → Composition → Download
- Multi-speaker dialogue → correct timing + subtitles
- Edge cases: Very short audio, very long audio, special characters

### Device Testing (Priority)
- Modern Android (2022+)
- Older Android (2018-2020) with 2GB RAM
- iOS (recent)
- Desktop (Chrome, Safari)

---

## Known Constraints & Decisions

1. **FFmpeg on Cloudflare Workers:**
   - Cloudflare Workers have size limits (~1MB uncompressed)
   - May need to delegate silence removal to external service if FFmpeg.wasm is too large
   - **Decision pending:** Test after implementation

2. **Bokeh effect rendering:**
   - Client-side Three.js or Canvas may struggle on low-end devices
   - **Recommendation:** Default to Template A (CSS blur) for performance
   - Advanced templates (B, C) are opt-in

3. **Whisper transcription cost:**
   - ~$0.01-0.03 per video
   - For 35 journalists × 50 videos = ~$17.50-52.50
   - **Decision:** Make subtitles opt-in to control costs

4. **Video storage (30-min auto-delete):**
   - Cloudflare Stream will delete videos after 30 minutes if not renewed
   - Users must download before expiration
   - **Messaging:** Clearly communicate "Download your video" with countdown timer

---

## Rollback & Decision Gates

Each module includes a "Decision pending" or "Investigation" note. Before merging to main:

1. **Module 1 (Silence Removal):**
   - [ ] FFmpeg.wasm loads successfully on Cloudflare Workers
   - [ ] Processing time ≤ 30 seconds for 5-minute audio
   - **If blocked:** Use external service (e.g., AssemblyAI) and budget cost

2. **Module 5 (Bokeh Effect):**
   - [ ] Three template investigations complete
   - [ ] Performance acceptable on 2GB RAM devices
   - **If blocked:** Default to Template A only (CSS blur)

3. **Optional Module B (Subtitles):**
   - [ ] Whisper API cost acceptable for projected usage
   - [ ] Transcription accuracy sufficient for Nigerian English
   - **If blocked:** Defer to Phase 3, revisit based on user feedback

---

## Success Metrics

Upon completion of all modules:

- [ ] Single-click "Generate Audiogram" workflow
- [ ] Output: Professional MP4 with video + audio + optional subtitles
- [ ] Works on low-bandwidth devices (Africa context)
- [ ] Zero additional hosting costs beyond existing infrastructure
- [ ] Journalists can create polished short-form podcast content in <5 minutes
- [ ] Accessibility: Burned-in subtitles available for deaf/hard of hearing users

---

## Future Considerations (Out of Scope)

- Real-time video preview (CPU-intensive, not feasible)
- Custom stinger uploads (adds complexity, storage)
- Automatic speaker detection without script input
- Batch processing (for multiple videos simultaneously)
- Watermarking (future: add organization logo to videos)

---

**Document Status:** Draft Roadmap  
**Last Updated:** January 2026  
**Next Review:** After Module 1 investigation phase
