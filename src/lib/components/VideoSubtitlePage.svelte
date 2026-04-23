<script lang="ts">
  import { onMount } from 'svelte';
  import PlayButton from './PlayButton.svelte';
  import SubtitlePanel from './SubtitlePanel.svelte';
  import { drawSubtitle, getActiveSegment, DEFAULT_SUBTITLE_STYLE, type FontSize } from '$lib/utils/subtitles';
  import type { SubtitleSegment, SubtitleStyle } from '$lib/utils/subtitles';

  // Video state
  let videoBlob: Blob | null = $state(null);
  let videoObjectUrl: string | null = $state(null);
  let videoDuration = $state(0);
  let canvasWidth = $state(1920);
  let canvasHeight = $state(1080);
  let fileInput: HTMLInputElement | null = $state(null);
  let resetKey = $state(0);

  // Trim state (0–1 ratios, matching TranscribePage pattern)
  let trimStart = $state(0);
  let trimEnd = $state(1);
  let draggingHandle = $state<'start' | 'end' | null>(null);

  // Progress bar
  let progressBarContainer = $state<HTMLDivElement | null>(null);
  let isDraggingPlayhead = $state(false);

  // Playback state
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let videoElement: HTMLVideoElement | null = $state(null);
  let playbackAnimId: number | null = null;

  // Canvas
  let canvasContext: CanvasRenderingContext2D | null = $state(null);
  let canvasElement: HTMLCanvasElement | null = $state(null);

  // Subtitle state
  let subtitleStyle: SubtitleStyle = $state({ ...DEFAULT_SUBTITLE_STYLE });
  let subtitleSegments: SubtitleSegment[] = $state([]);
  let subtitlesEnabled = $state(false);

  // Export / upload state
  let isExporting = $state(false);
  let exportError: string | null = $state(null);
  let uploadError: string | null = $state(null);
  let videoLoading = $state(false);

  // Derived
  let hasVideo = $derived(videoBlob !== null);
  let trimStartSec = $derived(trimStart * videoDuration);
  let trimEndSec = $derived(trimEnd * videoDuration);
  let trimmedDuration = $derived(trimEndSec - trimStartSec);


  // ─── Playback tracking loop ───────────────────────────────────────────────
  // Only depend on isPlaying and videoElement, NOT trim values.
  // Trim boundaries are read fresh inside tick() as plain variable reads so
  // dragging handles does NOT trigger effect re-runs (no loop teardown/restart).
  $effect(() => {
    if (!isPlaying || !videoElement) return;

    let animId: number;
    let active = true;

    function tick() {
      if (!active || !videoElement) return;

      const t = videoElement.currentTime;
      currentTime = t;

      // Read trim bounds fresh each frame without tracking them as reactive deps.
      // stopTime mirrors the playhead CSS clamp: trimEnd * barWidth - 20px.
      // Subtract a ~2-frame lookahead (≈33ms) so the RAF polling interval
      // doesn't let the video slip past the visual stop point before we catch it.
      const barWidth = progressBarContainer?.getBoundingClientRect().width || 1000;
      const stopTime = (trimEnd - 20 / barWidth) * videoDuration - 0.3;
      const frameTrimStartSec = trimStart * videoDuration;

      if (t >= stopTime) {
        videoElement.pause();
        isPlaying = false;
        currentTime = frameTrimStartSec;
        videoElement.currentTime = frameTrimStartSec;
        renderFrame(frameTrimStartSec);
        return;
      }

      // Guard against async-seek spiral: only correct once, then wait for seek
      if (t < frameTrimStartSec) {
        if (!videoElement.seeking) {
          videoElement.currentTime = frameTrimStartSec;
          currentTime = frameTrimStartSec;
        }
        animId = requestAnimationFrame(tick);
        return; // don't render, wait for seek to complete
      }

      renderFrame(t);
      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  });


  // ─── Progress bar playhead dragging ───────────────────────────────────────
  function handlePlayheadMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDraggingPlayhead = true;
    handlePlayheadDrag(e.clientX);

    const onMove = (me: MouseEvent) => handlePlayheadDrag(me.clientX);
    const onUp = () => {
      isDraggingPlayhead = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handlePlayheadTouchStart(e: TouchEvent) {
    e.preventDefault();
    isDraggingPlayhead = true;
    handlePlayheadDrag(e.touches[0].clientX);

    const onMove = (te: TouchEvent) => handlePlayheadDrag(te.touches[0].clientX);
    const onEnd = () => {
      isDraggingPlayhead = false;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  function handlePlayheadDrag(clientX: number) {
    if (!progressBarContainer) return;
    const rect = progressBarContainer.getBoundingClientRect();
    const relX = clientX - rect.left;
    // Calculate ratio within trimmed region only
    const trimmedPixelStart = trimStart * rect.width;
    const trimmedPixelWidth = (trimEnd - trimStart) * rect.width;
    const clampedX = Math.max(trimmedPixelStart, Math.min(trimmedPixelStart + trimmedPixelWidth, relX));
    const offsetInTrimmedRegion = clampedX - trimmedPixelStart;
    const progress = offsetInTrimmedRegion / trimmedPixelWidth;
    const newTime = trimStartSec + progress * trimmedDuration;
    currentTime = newTime;
    console.log(`[PlayheadDrag] relX=${relX}, trimmedStart=${trimmedPixelStart}, progress=${progress.toFixed(3)}, newTime=${newTime.toFixed(2)}, trimStartSec=${trimStartSec.toFixed(2)}, trimmedDuration=${trimmedDuration.toFixed(2)}`);
    if (videoElement) {
      videoElement.currentTime = newTime;
    }
  }

  // ─── Progress bar click to seek ────────────────────────────────────────────
  function handleProgressBarClick(e: MouseEvent) {
    if (!hasVideo || !progressBarContainer) return;
    const rect = progressBarContainer.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relX / rect.width));
    const newTime = Math.max(trimStartSec, Math.min(trimEndSec, videoDuration * ratio));
    currentTime = newTime;
    if (videoElement) {
      videoElement.currentTime = newTime;
      videoElement.addEventListener('seeked', () => renderFrame(newTime), { once: true });
    }
  }

  // ─── Video upload ─────────────────────────────────────────────────────────
  async function handleVideoUpload(file: File) {
    uploadError = null;
    videoLoading = true;
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

    if (!validTypes.includes(file.type)) {
      uploadError = 'Invalid video format. Please upload MP4, MOV, or WebM.';
      videoLoading = false;
      return;
    }

    try {
      // Clean up previous
      if (videoObjectUrl) {
        URL.revokeObjectURL(videoObjectUrl);
      }
      stopPlayback();

      videoBlob = file;
      const url = URL.createObjectURL(file);
      videoObjectUrl = url;

      // Load metadata via a temporary video element
      const tempVideo = document.createElement('video');
      tempVideo.crossOrigin = 'anonymous';
      tempVideo.src = url;

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onerror = () => reject(new Error('Failed to load video'));
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      canvasWidth = tempVideo.videoWidth;
      canvasHeight = tempVideo.videoHeight;
      videoDuration = tempVideo.duration;
      trimStart = 0;
      trimEnd = 1;
      currentTime = tempVideo.currentTime = 0;

      // Assign to the bound video element
      if (videoElement) {
        videoElement.src = url;
        videoElement.load();
      }

      // Draw initial frame once seeked
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          tempVideo.removeEventListener('seeked', onSeeked);
          renderFrameFromVideo(tempVideo);
          resolve();
        };
        tempVideo.addEventListener('seeked', onSeeked);
        tempVideo.currentTime = 0;
      });

    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'Failed to load video';
      videoBlob = null;
      videoObjectUrl = null;
    } finally {
      videoLoading = false;
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────
  function renderFrameFromVideo(vid: HTMLVideoElement) {
    if (!canvasContext || !canvasElement) return;
    canvasContext.fillStyle = '#000000';
    canvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
    try {
      canvasContext.drawImage(vid, 0, 0, canvasWidth, canvasHeight);
    } catch (e) {
      console.warn('[VideoSubtitle] drawImage failed:', e);
    }
  }

  function renderFrame(time: number) {
    if (!canvasContext || !videoElement || !canvasElement) return;

    canvasContext.fillStyle = '#000000';
    canvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
    try {
      canvasContext.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
    } catch (e) {
      console.warn('[VideoSubtitle] drawImage failed:', e);
    }

    if (subtitlesEnabled && subtitleSegments.length > 0) {
      const relTime = time - trimStartSec;
      const activeSegment = getActiveSegment(subtitleSegments, relTime);
      if (activeSegment) {
        drawSubtitle(canvasContext, activeSegment, subtitleStyle, canvasWidth, canvasHeight, relTime);
      }
    }
  }

  // ─── Playback controls ────────────────────────────────────────────────────
  function handlePlayPause() {
    if (!videoElement || !hasVideo) return;

    if (isPlaying) {
      videoElement.pause();
      isPlaying = false;
    } else {
      // If at or past trim end, reset to trim start
      if (currentTime >= trimEndSec || currentTime < trimStartSec) {
        videoElement.currentTime = trimStartSec;
        currentTime = trimStartSec;
      }
      videoElement.play();
      isPlaying = true;
    }
  }

  function handleSkipBack() {
    if (!videoElement || !hasVideo) return;
    const newTime = Math.max(trimStartSec, videoElement.currentTime - 5);
    videoElement.currentTime = newTime;
    currentTime = newTime;
    if (!isPlaying) renderFrame(newTime);
  }

  function handleSkipForward() {
    if (!videoElement || !hasVideo) return;
    const newTime = Math.min(trimEndSec, videoElement.currentTime + 5);
    videoElement.currentTime = newTime;
    currentTime = newTime;
    if (!isPlaying) renderFrame(newTime);
  }

  function stopPlayback() {
    if (videoElement) videoElement.pause();
    isPlaying = false;
    if (playbackAnimId !== null) {
      cancelAnimationFrame(playbackAnimId);
      playbackAnimId = null;
    }
  }

  // ─── Trim handles (mirrors TranscribePage exactly) ────────────────────────
  function handleTrimHandleMouseDown(handle: 'start' | 'end', e: MouseEvent) {
    e.preventDefault();
    draggingHandle = handle;

    const onMove = (me: MouseEvent) => handleTrimDrag(me.clientX);
    const onUp = () => {
      draggingHandle = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleTrimHandleTouchStart(handle: 'start' | 'end', e: TouchEvent) {
    e.preventDefault();
    draggingHandle = handle;

    const onMove = (te: TouchEvent) => handleTrimDrag(te.touches[0].clientX);
    const onEnd = () => {
      draggingHandle = null;
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  function handleTrimDrag(clientX: number) {
    if (!progressBarContainer || !draggingHandle) return;
    const rect = progressBarContainer.getBoundingClientRect();
    const relX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relX / rect.width));

    if (draggingHandle === 'start') {
      trimStart = Math.min(ratio, trimEnd - 0.01);
    } else {
      const newTrimEnd = Math.max(ratio, trimStart + 0.01);
      trimEnd = newTrimEnd;
      console.log(`[TrimDrag] end handle moved: trimEnd=${newTrimEnd.toFixed(3)}, trimEndSec=${(newTrimEnd * videoDuration).toFixed(2)}, currentTime=${currentTime.toFixed(2)}, isPlaying=${isPlaying}`);
    }

    // Clamp currentTime to stay within new trim bounds
    if (draggingHandle === 'start' && currentTime < trimStartSec) {
      console.log(`[TrimDrag] Clamping currentTime to trimStart: ${currentTime.toFixed(2)} -> ${trimStartSec.toFixed(2)}`);
      currentTime = trimStartSec;
      if (videoElement) videoElement.currentTime = trimStartSec;
    }
    if (draggingHandle === 'end' && currentTime > trimEndSec) {
      console.log(`[TrimDrag] Clamping currentTime to trimEnd: ${currentTime.toFixed(2)} -> ${trimEndSec.toFixed(2)}`);
      currentTime = trimEndSec;
      if (videoElement) videoElement.currentTime = trimEndSec;
    }

    // Seek video to show trim position
    if (videoElement) {
      const seekTime = draggingHandle === 'start' ? trimStartSec : trimEndSec;
      videoElement.currentTime = seekTime;
      currentTime = seekTime;
      console.log(`[TrimDrag] Seeked to ${seekTime.toFixed(2)}`);
    }
  }


  // ─── Delete video ─────────────────────────────────────────────────────────
  function handleDeleteVideo() {
    stopPlayback();
    if (videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
      videoObjectUrl = null;
    }
    videoBlob = null;
    videoDuration = 0;
    trimStart = 0;
    trimEnd = 1;
    currentTime = 0;
    subtitleSegments = [];
    subtitlesEnabled = false;
    subtitleStyle = { ...DEFAULT_SUBTITLE_STYLE };
    // Force SubtitlePanel remount to clear stale errors and internal state
    resetKey++;
    if (canvasContext && canvasElement) {
      canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  // ─── Drag and drop ────────────────────────────────────────────────────────
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleVideoUpload(file);
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleVideoUpload(file);
    input.value = '';
  }

  function triggerFileInput() {
    fileInput?.click();
  }

  // ─── Export ───────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!videoBlob || !canvasElement) {
      alert('Upload a video first');
      return;
    }

    isExporting = true;
    exportError = null;

    try {
      const { smartExportVideo } = await import('$lib/utils/video-export');

      const audioUrl = URL.createObjectURL(
        new Blob([], { type: 'audio/webm' })
      );
      const audioElement = document.createElement('audio');
      audioElement.src = audioUrl;

      const renderCallback = (time: number) => {
        renderFrame(time + trimStartSec);
      };

      await smartExportVideo(
        canvasElement,
        audioElement,
        undefined,
        trimmedDuration,
        undefined,
        renderCallback
      );

      alert('Video exported successfully');
    } catch (error) {
      exportError = error instanceof Error ? error.message : 'Export failed';
      console.error('[VideoSubtitle] Export error:', error);
    } finally {
      isExporting = false;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  onMount(() => {
    if (canvasElement) {
      canvasContext = canvasElement.getContext('2d');
    }

    return () => {
      stopPlayback();
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    };
  });

  $effect(() => {
    if (canvasElement) {
      canvasContext = canvasElement.getContext('2d');
    }
  });

  // Draw frame when video element seeks (for trim drag feedback)
  $effect(() => {
    if (videoElement) {
      const onSeeked = () => {
        if (!isPlaying) renderFrame(videoElement!.currentTime);
      };
      videoElement.addEventListener('seeked', onSeeked);
      return () => videoElement!.removeEventListener('seeked', onSeeked);
    }
  });
</script>

<svelte:window ondragover={(e) => e.preventDefault()} />

<!-- Hidden video element for playback/frame extraction -->
{#if hasVideo}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoElement}
    src={videoObjectUrl ?? undefined}
    style="display: none;"
    preload="auto"
  ></video>
{/if}

<div class="video-page">
  <!-- Upload zone (hidden when video is present) -->
  {#if !hasVideo}
    <div
      class="upload-zone"
      ondrop={handleDrop}
      ondragover={(e) => e.preventDefault()}
      onclick={triggerFileInput}
      role="button"
      tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') triggerFileInput(); }}
    >
      <div class="upload-prompt">
        <h2 class="upload-title">Video subtitles</h2>
        <p class="upload-sub">Select a video or drag and drop to get started (MP4, MOV, WebM)</p>
        <input
          type="file"
          bind:this={fileInput}
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onchange={handleFileInput}
          style="display: none;"
        />
        <button
          type="button"
          class="upload-btn"
          onclick={(e) => { e.stopPropagation(); triggerFileInput(); }}
        >
          Select video
        </button>
      </div>

      {#if uploadError}
        <div class="error-msg">{uploadError}</div>
      {/if}
    </div>
  {/if}

  <!-- Canvas preview (only visible when video loaded) -->
  {#if hasVideo}
    <div class="canvas-container">
      <canvas
        bind:this={canvasElement}
        width={canvasWidth}
        height={canvasHeight}
        class="preview-canvas"
      ></canvas>
      {#if videoLoading}
        <div class="canvas-loading">Loading video…</div>
      {/if}
    </div>

    <!-- Replace video & duration row -->
    <div class="audio-actions">
      <button type="button" class="text-btn" onclick={handleDeleteVideo}>
        Replace video
      </button>
      <span class="audio-duration">{trimmedDuration.toFixed(1)}s</span>
    </div>
  {/if}

  <!-- Progress bar trimmer (always visible, disabled when no video) -->
  <div
    class="progress-bar-container"
    class:disabled={!hasVideo}
    bind:this={progressBarContainer}
    onclick={hasVideo ? handleProgressBarClick : undefined}
    onkeydown={(e) => {
      if (!hasVideo) return;
      if (e.key === 'ArrowLeft') handleSkipBack();
      else if (e.key === 'ArrowRight') handleSkipForward();
      else if (e.key === ' ') { e.preventDefault(); handlePlayPause(); }
    }}
    role="slider"
    aria-label="Video timeline"
    aria-valuemin={0}
    aria-valuemax={videoDuration}
    aria-valuenow={currentTime}
    tabindex={hasVideo ? 0 : -1}
  >
    <!-- Trim start handle -->
    <div
      class="trim-handle start"
      style="left: {trimStart * 100}%"
      onmousedown={(e) => hasVideo && handleTrimHandleMouseDown('start', e)}
      ontouchstart={(e) => hasVideo && handleTrimHandleTouchStart('start', e)}
      role="slider"
      aria-label="Trim start"
      aria-valuemin={0}
      aria-valuemax={trimEnd}
      aria-valuenow={trimStart}
      tabindex={hasVideo ? 0 : -1}
    >
      <div class="trim-handle-bar"></div>
    </div>

    <!-- Trim overlay (left) -->
    {#if trimStart > 0}
      <div class="trim-overlay start" style="width: {trimStart * 100}%"></div>
    {/if}

    <!-- Progress bar background -->
    <div class="progress-bar-bg">
      <!-- Played portion (light purple) - fills from trimStart to playhead, same coordinate system as handles -->
      <div
        class="progress-bar-played"
        style="position: absolute; left: calc({(trimStartSec / videoDuration) * 100}% + 20px); width: calc(min({(currentTime / videoDuration) * 100}% + 20px, {trimEnd * 100}% - 20px) - ({(trimStartSec / videoDuration) * 100}% + 20px))"
      ></div>
    </div>

    <!-- Playhead (vertical line) - same coordinate system as trim handles -->
    <div
      class="playhead"
      style="left: min(calc({(currentTime / videoDuration) * 100}% + 20px), calc({trimEnd * 100}% - 20px))"
      onmousedown={hasVideo ? handlePlayheadMouseDown : undefined}
      ontouchstart={hasVideo ? handlePlayheadTouchStart : undefined}
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={videoDuration}
      aria-valuenow={currentTime}
      tabindex={hasVideo ? 0 : -1}
    ></div>

    <!-- Trim overlay (right) -->
    {#if trimEnd < 1}
      <div class="trim-overlay end" style="width: {(1 - trimEnd) * 100}%"></div>
    {/if}

    <!-- Trim end handle -->
    <div
      class="trim-handle end"
      style="right: {(1 - trimEnd) * 100}%"
      onmousedown={(e) => hasVideo && handleTrimHandleMouseDown('end', e)}
      ontouchstart={(e) => hasVideo && handleTrimHandleTouchStart('end', e)}
      role="slider"
      aria-label="Trim end"
      aria-valuemin={trimStart}
      aria-valuemax={1}
      aria-valuenow={trimEnd}
      tabindex={hasVideo ? 0 : -1}
    >
      <div class="trim-handle-bar"></div>
    </div>
  </div>

  <!-- Playback controls (always visible, disabled when no video) -->
  <div class="playback-controls">
    <div class="control-btn-spacer"></div>
    <div class="playback-center">
      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipBack}
        disabled={!hasVideo}
        aria-label="Skip back 5 seconds"
      >
        <svg class="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 4C7.55228 4 8 4.44772 8 5V11.3333L18.2227 4.51823C18.4524 4.36506 18.7628 4.42714 18.916 4.65691C18.9708 4.73904 19 4.83555 19 4.93426V19.0657C19 19.3419 18.7761 19.5657 18.5 19.5657C18.4013 19.5657 18.3048 19.5365 18.2227 19.4818L8 12.6667V19C8 19.5523 7.55228 20 7 20C6.44772 20 6 19.5523 6 19V5C6 4.44772 6.44772 4 7 4ZM17 7.73703L10.6056 12L17 16.263V7.73703Z"></path>
        </svg>
      </button>

      <PlayButton
        state={isPlaying ? 'playing' : hasVideo ? 'active' : 'inactive'}
        onclick={handlePlayPause}
        disabled={!hasVideo}
        ariaLabel={isPlaying ? 'Pause' : 'Play'}
      />

      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipForward}
        disabled={!hasVideo}
        aria-label="Skip forward 5 seconds"
      >
        <svg class="control-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 12.6667L5.77735 19.4818C5.54759 19.6349 5.23715 19.5729 5.08397 19.3431C5.02922 19.261 5 19.1645 5 19.0657V4.93426C5 4.65812 5.22386 4.43426 5.5 4.43426C5.59871 4.43426 5.69522 4.46348 5.77735 4.51823L16 11.3333V5C16 4.44772 16.4477 4 17 4C17.5523 4 18 4.44772 18 5V19C18 19.5523 17.5523 20 17 20C16.4477 20 16 19.5523 16 19V12.6667ZM7 7.73703V16.263L13.3944 12L7 7.73703Z"></path>
        </svg>
      </button>
    </div>
    <div class="control-btn-spacer"></div>
  </div>

  <!-- Subtitle panel (always visible, disabled when no video) -->
  <div class:disabled={!hasVideo}>
    {#key resetKey}
      <SubtitlePanel
        audioBlob={videoBlob}
        {canvasWidth}
        {canvasHeight}
        style={subtitleStyle}
        segments={subtitleSegments}
        subtitlesEnabled={subtitlesEnabled}
        onStyleChange={(s) => { subtitleStyle = s; }}
        onSegmentsChange={(segs) => { subtitleSegments = segs; }}
        onEnabledChange={(e) => { subtitlesEnabled = e; }}
      />
    {/key}
  </div>

  <!-- Export button (always visible, disabled when no video) -->
  <div class="export-section">
    <button
      class="export-button"
      onclick={handleExport}
      disabled={isExporting || !hasVideo}
    >
      {isExporting ? 'Exporting…' : 'Download video'}
    </button>
    {#if exportError}
      <div class="error-msg">{exportError}</div>
    {/if}
  </div>
</div>

<style>
  .video-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
    max-width: 100%;
  }

  /* ── Upload zone ── */
  .upload-zone {
    border: 2px dashed #777777;
    border-radius: var(--radius-md);
    padding: var(--spacing-xl);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-normal);
    background: var(--bg-white);
  }

  .upload-zone:hover {
    border-color: var(--accent-brand);
    background: var(--color-highlight);
  }

  .upload-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
  }

  .upload-title {
    margin: 0;
    font-size: var(--font-size-base);
    color: #555555;
    font-weight: var(--font-weight-semibold);
  }

  .upload-sub {
    margin: 0;
    font-size: var(--font-size-sm);
    color: #777777;
  }

  .upload-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--accent-brand);
    color: white;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: var(--font-weight-medium);
    border: none;
    font-size: var(--font-size-base);
    transition: opacity var(--transition-normal);
  }

  .upload-btn:hover {
    opacity: 0.9;
  }

  /* ── Canvas preview ── */
  .canvas-container {
    position: relative;
    width: 100%;
  }

  .preview-canvas {
    width: 100%;
    height: auto;
    display: block;
    background: #000;
    border-radius: var(--radius-md);
  }

  .canvas-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  /* ── Progress bar trimmer (simple, no waveform) ── */
  .progress-bar-container {
    position: relative;
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    cursor: pointer;
    touch-action: pan-y;
    height: 32px;
    display: flex;
    align-items: center;
  }

  .progress-bar-bg {
    position: absolute;
    inset: 0;
    background: #ffffff;
    border-radius: var(--radius-md);
    overflow: hidden;
    z-index: 1;
  }

  .progress-bar-played {
    height: 100%;
    background: #f0e6f7;
  }

  .playhead {
    position: absolute;
    width: 2px;
    height: 100%;
    background: #a284d3;
    top: 0;
    transform: translateX(-50%);
    cursor: grab;
    z-index: 8;
    touch-action: none;
  }

  .playhead:active {
    cursor: grabbing;
  }

  .trim-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.6);
    z-index: 5;
    pointer-events: none;
  }

  .trim-overlay.start {
    left: 0;
  }

  .trim-overlay.end {
    right: 0;
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    touch-action: none;
    background: var(--color-primary);
  }

  .trim-handle.start {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  .trim-handle.end {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .trim-handle-bar {
    width: 4px;
    height: 16px;
    background: var(--bg-white);
    border-radius: 1px;
  }

  .trim-handle:hover,
  .trim-handle:focus {
    background: color-mix(in srgb, var(--color-primary) 85%, black);
  }

  .audio-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0;
    margin-top: calc(-1 * var(--spacing-md) + var(--spacing-sm));
  }

  .audio-duration {
    font-size: var(--font-size-xs);
    color: #555555;
  }

  .text-btn {
    background: none;
    border: none;
    padding: var(--spacing-xs) 0;
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    cursor: pointer;
  }

  .text-btn:hover {
    color: #4a1d9e;
  }


  /* ── Playback controls (identical to TranscribePage / AudiogramPage) ── */
  .playback-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) 0;
  }

  .playback-center {
    display: flex;
    align-items: center;
    gap: var(--spacing-lg);
  }

  .control-btn-spacer {
    width: 40px;
    height: 40px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: all var(--transition-normal);
  }

  .control-btn:disabled {
    cursor: default;
  }

  .control-btn:disabled .control-icon {
    opacity: 0.4;
  }

  .control-btn:hover:not(:disabled) .control-icon {
    color: var(--color-primary);
  }

  .control-icon {
    width: 32px;
    height: 32px;
    color: var(--text-secondary);
    transition: color var(--transition-normal);
  }

  /* ── Export ── */
  .export-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .export-button {
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--accent-brand);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: opacity var(--transition-normal);
  }

  .export-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .export-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-msg {
    color: #d32f2f;
    font-size: var(--font-size-sm);
    margin: 0;
  }

  /* Disabled state for controls when no video is loaded */
  .progress-bar-container.disabled {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
  }

  .progress-bar-container.disabled .trim-handle {
    cursor: default;
  }

  .progress-bar-container.disabled .playhead {
    cursor: default;
  }

  div.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
