<script lang="ts">
  import { onMount } from 'svelte';
  import SubtitlePanel from './SubtitlePanel.svelte';
  import TitlePanel from './TitlePanel.svelte';
  import type { SubtitleSegment, SubtitleStyle } from '$lib/utils/subtitles';
  import type { TitleFont, TitleAlign } from '$lib/utils/compositor';

  // Video state
  let videoBlob: Blob | null = null;
  let videoElement: HTMLVideoElement | null = null;
  let videoDuration = 0;
  let canvasWidth = 1920;
  let canvasHeight = 1080;
  let extractedAudioBlob: Blob | null = null;

  // Trim state
  let trimStart = $state(0);
  let trimEnd = $state(0);
  let isDraggingStart = false;
  let isDraggingEnd = false;
  let trimmerElement: HTMLElement | null = null;

  // Playback state
  let isPlaying = false;
  let currentTime = 0;
  let canvasContext: CanvasRenderingContext2D | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let rafId: number | null = null;

  // Subtitle state
  let subtitleStyle: SubtitleStyle = {
    fontSize: 32,
    fontColor: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    verticalPosition: 'bottom',
  };
  let subtitleSegments: SubtitleSegment[] = [];
  let subtitlesEnabled = false;

  // Title state
  let titleText = '';
  let titleFont: TitleFont = 'Inter';
  let titleAlign: TitleAlign = 'center';
  let titleBold = false;
  let titleLineHeight = 1.5;
  let titleLetterSpacing = 0;
  let titleColor = '#ffffff';
  let labelEnabled = false;
  let labelOpacity = 0.8;
  let labelSpace = 10;
  let labelColor = '#000000';

  // Export state
  let isExporting = false;
  let exportError: string | null = null;
  let uploadError: string | null = null;

  // Audio extraction from video
  async function extractAudioFromVideo(blob: Blob): Promise<Blob> {
    const videoUrl = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';

    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaElementAudioSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);

    const mediaRecorder = new MediaRecorder(destination.stream);
    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    mediaRecorder.start();
    video.play();

    await new Promise((resolve) => {
      video.onended = resolve;
    });

    mediaRecorder.stop();
    URL.revokeObjectURL(videoUrl);

    return new Blob(chunks, { type: 'audio/mp3' });
  }

  // Handle video upload
  async function handleVideoUpload(file: File) {
    uploadError = null;
    const validTypes = ['video/mp4', 'video/quicktime', 'video/webm'];

    if (!validTypes.includes(file.type)) {
      uploadError = 'Invalid video format. Please upload MP4, MOV, or WebM.';
      return;
    }

    try {
      videoBlob = file;

      // Create video element for preview
      const url = URL.createObjectURL(file);
      if (videoElement) {
        videoElement.src = url;
        await new Promise((resolve) => {
          if (videoElement) videoElement.onloadedmetadata = resolve;
        });

        videoDuration = videoElement.duration;
        trimEnd = videoDuration;

        // Get video dimensions
        canvasWidth = videoElement.videoWidth;
        canvasHeight = videoElement.videoHeight;
      }

      // Extract audio for transcription
      extractedAudioBlob = await extractAudioFromVideo(file);
    } catch (error) {
      uploadError =
        error instanceof Error ? error.message : 'Failed to load video';
      videoBlob = null;
      extractedAudioBlob = null;
    }
  }

  // Handle drag and drop
  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleVideoUpload(file);
    }
  }

  // Handle file input
  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleVideoUpload(file);
    }
  }

  // Trim control handlers
  function handleTrimMouseDown(e: MouseEvent, handle: 'start' | 'end') {
    if (handle === 'start') {
      isDraggingStart = true;
    } else {
      isDraggingEnd = true;
    }
    handleTrimMouseMove(e);
  }

  function handleTrimMouseMove(e: MouseEvent) {
    if (!isDraggingStart && !isDraggingEnd) return;
    if (!trimmerElement) return;

    const rect = trimmerElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * videoDuration;

    if (isDraggingStart) {
      trimStart = Math.min(time, trimEnd - 0.1);
    } else {
      trimEnd = Math.max(time, trimStart + 0.1);
    }
  }

  function handleTrimMouseUp() {
    isDraggingStart = false;
    isDraggingEnd = false;
  }

  // Canvas rendering
  function renderFrame(time: number) {
    if (!canvasContext || !videoElement) return;

    const seekTime = time + trimStart;
    videoElement.currentTime = seekTime;

    requestAnimationFrame(() => {
      if (!canvasContext || !videoElement) return;

      // Draw video frame
      canvasContext.fillStyle = '#000000';
      canvasContext.fillRect(0, 0, canvasWidth, canvasHeight);
      canvasContext.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
    });
  }

  // Playback control
  function togglePlayback() {
    if (!videoElement) return;

    if (isPlaying) {
      isPlaying = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      videoElement.pause();
    } else {
      isPlaying = true;
      videoElement.currentTime = trimStart + currentTime;
      videoElement.play();

      function updatePlayback() {
        if (!isPlaying) return;

        currentTime = videoElement!.currentTime - trimStart;

        if (currentTime >= trimEnd - trimStart) {
          isPlaying = false;
          currentTime = 0;
          videoElement!.pause();
          return;
        }

        renderFrame(currentTime);
        rafId = requestAnimationFrame(updatePlayback);
      }

      rafId = requestAnimationFrame(updatePlayback);
    }
  }

  // Export
  async function handleExport() {
    if (!videoBlob || !canvasWidth || !canvasHeight) {
      alert('Upload a video first');
      return;
    }

    isExporting = true;
    exportError = null;

    try {
      const { smartExportVideo } = await import('$lib/utils/video-export');

      const renderCallback = (time: number) => {
        renderFrame(time);
      };

      const trimmedDuration = trimEnd - trimStart;

      await smartExportVideo(
        canvasElement!,
        extractedAudioBlob || new Blob([], { type: 'audio/mp3' }),
        canvasWidth,
        canvasHeight,
        trimmedDuration,
        renderCallback
      );

      alert('Video exported successfully');
    } catch (error) {
      exportError = error instanceof Error ? error.message : 'Export failed';
    } finally {
      isExporting = false;
    }
  }

  onMount(() => {
    if (canvasElement) {
      canvasContext = canvasElement.getContext('2d');
    }

    document.addEventListener('mousemove', handleTrimMouseMove);
    document.addEventListener('mouseup', handleTrimMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleTrimMouseMove);
      document.removeEventListener('mouseup', handleTrimMouseUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  });
</script>

<svelte:window on:dragover|preventDefault={() => {}} />

<div class="video-page">
  <!-- Upload zone -->
  <div
    class="upload-zone"
    on:drop={handleDrop}
    on:dragover|preventDefault={() => {}}
    role="button"
    tabindex="0"
  >
    {#if videoBlob}
      <video
        bind:this={videoElement}
        class="video-preview"
        controls
        style="width: 100%; max-height: 400px; object-fit: contain;"
      />
    {:else}
      <div class="upload-prompt">
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2v20m0 0l-7-7m7 7l7-7" stroke-width="2" stroke-linecap="round" />
        </svg>
        <p>Drag and drop your video here</p>
        <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
          or click to select
        </p>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          on:change={handleFileInput}
          style="display: none;"
          id="video-input"
        />
        <label for="video-input" class="upload-label">Select video</label>
      </div>
    {/if}

    {#if uploadError}
      <div class="error-message">{uploadError}</div>
    {/if}
  </div>

  {#if videoBlob && videoElement}
    <!-- Trim control -->
    <div class="trim-section">
      <h3>Trim video</h3>
      <div class="trim-display">
        Duration: {(trimEnd - trimStart).toFixed(1)}s
      </div>

      <div class="trimmer-container" bind:this={trimmerElement}>
        <div class="trimmer-track">
          <div
            class="trimmer-handle trimmer-start"
            style="left: {(trimStart / videoDuration) * 100}%"
            on:mousedown={(e) => handleTrimMouseDown(e, 'start')}
            role="slider"
            aria-label="Trim start"
            tabindex="0"
          />
          <div
            class="trimmer-handle trimmer-end"
            style="left: {(trimEnd / videoDuration) * 100}%"
            on:mousedown={(e) => handleTrimMouseDown(e, 'end')}
            role="slider"
            aria-label="Trim end"
            tabindex="0"
          />
        </div>
      </div>
    </div>

    <!-- Playback controls -->
    <div class="playback-section">
      <button
        class="play-button"
        on:click={togglePlayback}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div class="time-display">
        {currentTime.toFixed(1)}s / {(trimEnd - trimStart).toFixed(1)}s
      </div>
    </div>

    <!-- Canvas preview -->
    <div class="canvas-section">
      <h3>Preview</h3>
      <canvas
        bind:this={canvasElement}
        width={canvasWidth}
        height={canvasHeight}
        style="width: 100%; max-height: 400px; background: #000; border-radius: var(--radius-md);"
      />
    </div>

    <!-- Subtitle panel -->
    <SubtitlePanel
      audioBlob={extractedAudioBlob}
      {canvasWidth}
      {canvasHeight}
      style={subtitleStyle}
      segments={subtitleSegments}
      subtitlesEnabled={subtitlesEnabled}
      onStyleChange={(s) => {
        subtitleStyle = s;
      }}
      onSegmentsChange={(segs) => {
        subtitleSegments = segs;
      }}
      onEnabledChange={(e) => {
        subtitlesEnabled = e;
      }}
    />

    <!-- Title panel -->
    <TitlePanel
      text={titleText}
      selectedFont={titleFont}
      selectedAlign={titleAlign}
      isBold={titleBold}
      lineHeight={titleLineHeight}
      letterSpacing={titleLetterSpacing}
      textColor={titleColor}
      labelEnabled={labelEnabled}
      labelOpacity={labelOpacity}
      labelSpace={labelSpace}
      labelColor={labelColor}
      onTextChange={(t) => {
        titleText = t;
      }}
      onFontChange={(f) => {
        titleFont = f;
      }}
      onAlignChange={(a) => {
        titleAlign = a;
      }}
      onBoldChange={(b) => {
        titleBold = b;
      }}
      onLineHeightChange={(h) => {
        titleLineHeight = h;
      }}
      onLetterSpacingChange={(s) => {
        titleLetterSpacing = s;
      }}
      onTextColorChange={(c) => {
        titleColor = c;
      }}
      onLabelEnabledChange={(e) => {
        labelEnabled = e;
      }}
      onLabelOpacityChange={(o) => {
        labelOpacity = o;
      }}
      onLabelSpaceChange={(s) => {
        labelSpace = s;
      }}
      onLabelColorChange={(c) => {
        labelColor = c;
      }}
    />

    <!-- Export button -->
    <div class="export-section">
      <button
        class="export-button"
        on:click={handleExport}
        disabled={isExporting}
      >
        {isExporting ? 'Exporting...' : 'Download video'}
      </button>
      {#if exportError}
        <div class="error-message">{exportError}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .video-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
    max-width: 100%;
  }

  .upload-zone {
    border: 2px dashed var(--color-border);
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
    gap: var(--spacing-md);
    color: var(--text-secondary);
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    color: var(--accent-brand);
  }

  .upload-label {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--accent-brand);
    color: white;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: var(--font-weight-medium);
  }

  .upload-label:hover {
    opacity: 0.9;
  }

  .video-preview {
    border-radius: var(--radius-md);
  }

  .error-message {
    color: #dc2626;
    margin-top: var(--spacing-md);
    font-size: var(--font-size-sm);
  }

  .trim-section {
    background: var(--bg-white);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .trim-section h3 {
    margin: 0 0 var(--spacing-md) 0;
    font-size: var(--font-size-lg);
  }

  .trim-display {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-md);
  }

  .trimmer-container {
    position: relative;
    height: 60px;
  }

  .trimmer-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--color-border);
    transform: translateY(-50%);
    border-radius: 2px;
  }

  .trimmer-handle {
    position: absolute;
    top: 50%;
    width: 20px;
    height: 20px;
    background: var(--accent-brand);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    transition: box-shadow 100ms;
  }

  .trimmer-handle:hover {
    box-shadow: 0 0 0 8px rgba(84, 34, 176, 0.1);
  }

  .playback-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    background: var(--bg-white);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .play-button {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--accent-brand);
    color: white;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity var(--transition-normal);
  }

  .play-button:hover {
    opacity: 0.9;
  }

  .play-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .time-display {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .canvas-section {
    background: var(--bg-white);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .canvas-section h3 {
    margin: 0 0 var(--spacing-md) 0;
    font-size: var(--font-size-lg);
  }

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

  h3 {
    color: var(--text-primary);
    font-weight: var(--font-weight-semibold);
  }
</style>
