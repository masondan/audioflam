<script lang="ts">
  import TogglePanel from './TogglePanel.svelte';
  import ImageCropDrawer from './ImageCropDrawer.svelte';
  import { decodeAudioFile, extractWaveformData, drawWaveform, type WaveformData } from '$lib/utils/waveform';

  type OpenPanel = 'waveform' | 'title' | 'light' | null;
  type AspectRatio = 'none' | '9:16' | '1:1' | '16:9';

  interface CropData {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  }

  interface ImageData {
    original: Blob;
    resized: Blob;
    cropped: Blob | null;
    url: string;
    aspectRatio: AspectRatio;
  }

  interface AudioData {
    file: File;
    url: string;
    duration: number;
    buffer: AudioBuffer;
    waveform: WaveformData;
  }

  let imageData = $state<ImageData | null>(null);
  let imageLoading = $state(false);
  let showCropDrawer = $state(false);
  let audioData = $state<AudioData | null>(null);
  let audioLoading = $state(false);
  
  let isPlaying = $state(false);
  let isRecording = $state(false);
  let currentTime = $state(0);
  
  let trimStart = $state(0);
  let trimEnd = $state(1);
  let draggingHandle = $state<'start' | 'end' | null>(null);
  
  let waveformCanvas = $state<HTMLCanvasElement | null>(null);
  let waveformContainer = $state<HTMLDivElement | null>(null);
  let audioElement: HTMLAudioElement | null = null;
  
  let waveformActive = $state(false);
  let titleActive = $state(false);
  let lightActive = $state(false);
  
  let openPanel = $state<OpenPanel>(null);

  let hasAudio = $derived(audioData !== null);
  let hasImage = $derived(imageData !== null);
  let canDownload = $derived(hasImage && hasAudio);

  function handleImageUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleImageFile(file);
      }
    };
    input.click();
  }

  async function resizeImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const isHorizontal = width > height;
        const maxSize = isHorizontal ? 1920 : 1080;
        
        let newWidth = width;
        let newHeight = height;
        
        if (isHorizontal && width > maxSize) {
          newWidth = maxSize;
          newHeight = Math.round(height * (maxSize / width));
        } else if (!isHorizontal && Math.max(width, height) > maxSize) {
          if (height > width) {
            newHeight = maxSize;
            newWidth = Math.round(width * (maxSize / height));
          } else {
            newWidth = maxSize;
            newHeight = Math.round(height * (maxSize / width));
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create blob'));
            }
          },
          'image/jpeg',
          0.9
        );
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleImageFile(file: File) {
    imageLoading = true;
    try {
      const resized = await resizeImage(file);
      const url = URL.createObjectURL(resized);
      
      if (imageData?.url) {
        URL.revokeObjectURL(imageData.url);
      }
      
      imageData = {
        original: file,
        resized,
        cropped: null,
        url,
        aspectRatio: 'none'
      };
    } catch (err) {
      console.error('Failed to process image:', err);
    } finally {
      imageLoading = false;
    }
  }

  function handleReplaceImage() {
    handleImageUploadClick();
  }

  function handleResizeClick() {
    showCropDrawer = true;
  }

  function handleCloseCropDrawer() {
    showCropDrawer = false;
  }

  async function handleCropDone(ratio: AspectRatio, cropData: CropData | null) {
    if (!imageData) return;
    
    imageData = {
      ...imageData,
      aspectRatio: ratio
    };

    if (ratio !== 'none' && cropData) {
      try {
        const croppedBlob = await applyCrop(imageData.resized, cropData);
        const newUrl = URL.createObjectURL(croppedBlob);
        
        if (imageData.url && imageData.cropped) {
          URL.revokeObjectURL(imageData.url);
        }
        
        imageData = {
          ...imageData,
          cropped: croppedBlob,
          url: newUrl
        };
      } catch (err) {
        console.error('Failed to apply crop:', err);
      }
    } else if (ratio === 'none' && imageData.cropped) {
      if (imageData.url) {
        URL.revokeObjectURL(imageData.url);
      }
      imageData = {
        ...imageData,
        cropped: null,
        url: URL.createObjectURL(imageData.resized)
      };
    }
  }

  async function applyCrop(sourceBlob: Blob, cropData: CropData): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = cropData.width;
        canvas.height = cropData.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(
          img,
          cropData.x,
          cropData.y,
          cropData.width,
          cropData.height,
          0,
          0,
          cropData.width,
          cropData.height
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create blob'));
            }
          },
          'image/jpeg',
          0.9
        );
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(sourceBlob);
    });
  }

  function handleAudioUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleAudioFile(file);
      }
    };
    input.click();
  }

  async function handleAudioFile(file: File) {
    audioLoading = true;
    try {
      const buffer = await decodeAudioFile(file);
      const waveform = await extractWaveformData(buffer);
      const url = URL.createObjectURL(file);
      
      if (audioData?.url) {
        URL.revokeObjectURL(audioData.url);
      }
      
      audioData = {
        file,
        url,
        duration: buffer.duration,
        buffer,
        waveform
      };
      
      trimStart = 0;
      trimEnd = 1;
      currentTime = 0;
    } catch (err) {
      console.error('Failed to decode audio:', err);
    } finally {
      audioLoading = false;
    }
  }

  function handleStartAgain() {
    if (audioData) {
      URL.revokeObjectURL(audioData.url);
      audioData = null;
    }
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    isPlaying = false;
    isRecording = false;
    trimStart = 0;
    trimEnd = 1;
    currentTime = 0;
  }

  function handlePlayPause() {
    if (!audioData || !audioElement) return;
    
    if (isPlaying) {
      audioElement.pause();
      isPlaying = false;
    } else {
      const startTime = audioData.duration * trimStart;
      if (currentTime < startTime || currentTime >= audioData.duration * trimEnd) {
        audioElement.currentTime = startTime;
        currentTime = startTime;
      }
      audioElement.play();
      isPlaying = true;
    }
  }

  function handleSkipBack() {
    if (!audioData || !audioElement) return;
    const newTime = Math.max(audioData.duration * trimStart, audioElement.currentTime - 5);
    audioElement.currentTime = newTime;
    currentTime = newTime;
  }

  function handleSkipForward() {
    if (!audioData || !audioElement) return;
    const newTime = Math.min(audioData.duration * trimEnd, audioElement.currentTime + 5);
    audioElement.currentTime = newTime;
    currentTime = newTime;
  }

  function handleTimeUpdate() {
    if (!audioElement || !audioData) return;
    currentTime = audioElement.currentTime;
    
    if (currentTime >= audioData.duration * trimEnd) {
      audioElement.pause();
      isPlaying = false;
      currentTime = audioData.duration * trimStart;
      audioElement.currentTime = currentTime;
    }
  }

  function handleWaveformClick(e: MouseEvent) {
    if (!audioData || !waveformContainer || !audioElement) return;
    
    const rect = waveformContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    if (percentage >= trimStart && percentage <= trimEnd) {
      const newTime = audioData.duration * percentage;
      audioElement.currentTime = newTime;
      currentTime = newTime;
    }
  }

  function handleWaveformKeydown(e: KeyboardEvent) {
    if (!audioData || !audioElement) return;
    
    const step = audioData.duration * 0.02;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newTime = Math.max(audioData.duration * trimStart, currentTime - step);
      audioElement.currentTime = newTime;
      currentTime = newTime;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newTime = Math.min(audioData.duration * trimEnd, currentTime + step);
      audioElement.currentTime = newTime;
      currentTime = newTime;
    } else if (e.key === ' ') {
      e.preventDefault();
      handlePlayPause();
    }
  }

  function handleTrimHandleMouseDown(handle: 'start' | 'end', e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    draggingHandle = handle;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!waveformContainer || !audioData) return;
      
      const rect = waveformContainer.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      
      if (draggingHandle === 'start') {
        trimStart = Math.min(percentage, trimEnd - 0.05);
      } else if (draggingHandle === 'end') {
        trimEnd = Math.max(percentage, trimStart + 0.05);
      }
    };
    
    const handleMouseUp = () => {
      draggingHandle = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleTrimHandleTouchStart(handle: 'start' | 'end', e: TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    draggingHandle = handle;
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (!waveformContainer || !audioData) return;
      
      const touch = moveEvent.touches[0];
      const rect = waveformContainer.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      
      if (draggingHandle === 'start') {
        trimStart = Math.min(percentage, trimEnd - 0.05);
      } else if (draggingHandle === 'end') {
        trimEnd = Math.max(percentage, trimStart + 0.05);
      }
    };
    
    const handleTouchEnd = () => {
      draggingHandle = null;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  }

  $effect(() => {
    if (waveformCanvas && audioData) {
      drawWaveform({
        canvas: waveformCanvas,
        peaks: audioData.waveform.peaks,
        trimStart,
        trimEnd,
        playheadPosition: currentTime / audioData.duration
      });
    }
  });

  $effect(() => {
    const data = audioData;
    if (!data) {
      if (audioElement) {
        audioElement.pause();
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        audioElement = null;
      }
      return;
    }
    
    if (audioElement) {
      audioElement.pause();
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
    }
    
    const audio = new Audio(data.url);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', () => {
      isPlaying = false;
      if (audioData) {
        currentTime = audioData.duration * trimStart;
      }
    });
    audioElement = audio;
  });

  function handleMicClick() {
    isRecording = !isRecording;
  }

  function handlePanelToggle(panel: OpenPanel, active: boolean) {
    if (panel === 'waveform') waveformActive = active;
    if (panel === 'title') titleActive = active;
    if (panel === 'light') lightActive = active;
  }

  function handlePanelOpenChange(panel: OpenPanel, open: boolean) {
    if (open) {
      openPanel = panel;
    } else if (openPanel === panel) {
      openPanel = null;
    }
  }

  function handleDownload() {
    // TODO: Implement download
  }

  function handleImageDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleImageDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  }

  function handleAudioDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleAudioDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('audio/')) {
      handleAudioFile(file);
    }
  }
</script>

<div class="audiogram-page">
  <!-- Image Upload -->
  {#if !imageData}
    <button
      type="button"
      class="upload-box"
      onclick={handleImageUploadClick}
      ondragover={handleImageDragOver}
      ondrop={handleImageDrop}
    >
      <span class="upload-label">Image</span>
      <img src="/icons/icon-upload.svg" alt="Upload" class="upload-icon" />
    </button>
  {:else}
    <div class="image-section">
      <div class="image-preview">
        <img src={imageData.url} alt="Uploaded" class="preview-image" />
        {#if imageLoading}
          <div class="image-loading-overlay">
            <div class="loading-spinner"></div>
          </div>
        {/if}
      </div>
      <div class="image-actions">
        <button type="button" class="text-btn" onclick={handleReplaceImage}>
          Replace image
        </button>
        <button type="button" class="text-btn" onclick={handleResizeClick}>
          Resize
        </button>
      </div>
    </div>
  {/if}

  <!-- Audio Upload -->
  {#if !audioData}
    <button
      type="button"
      class="upload-box"
      class:loading={audioLoading}
      onclick={handleAudioUploadClick}
      ondragover={handleAudioDragOver}
      ondrop={handleAudioDrop}
      disabled={audioLoading}
    >
      {#if audioLoading}
        <span class="upload-label">Processing audio...</span>
        <div class="loading-spinner small"></div>
      {:else}
        <span class="upload-label">Audio</span>
        <img src="/icons/icon-upload.svg" alt="Upload" class="upload-icon" />
      {/if}
    </button>
  {:else}
    <div 
      class="audio-waveform-container"
      bind:this={waveformContainer}
      onclick={handleWaveformClick}
      onkeydown={handleWaveformKeydown}
      role="slider"
      aria-label="Audio waveform"
      aria-valuemin={0}
      aria-valuemax={audioData.duration}
      aria-valuenow={currentTime}
      tabindex="0"
    >
      <div
        class="trim-handle start"
        style="left: {trimStart * 100}%"
        onmousedown={(e) => handleTrimHandleMouseDown('start', e)}
        ontouchstart={(e) => handleTrimHandleTouchStart('start', e)}
        role="slider"
        aria-label="Trim start"
        aria-valuemin={0}
        aria-valuemax={trimEnd}
        aria-valuenow={trimStart}
        tabindex="0"
      >
        <div class="trim-handle-bar"></div>
      </div>
      <canvas
        bind:this={waveformCanvas}
        class="waveform-canvas"
      ></canvas>
      <div
        class="trim-handle end"
        style="left: {trimEnd * 100}%"
        onmousedown={(e) => handleTrimHandleMouseDown('end', e)}
        ontouchstart={(e) => handleTrimHandleTouchStart('end', e)}
        role="slider"
        aria-label="Trim end"
        aria-valuemin={trimStart}
        aria-valuemax={1}
        aria-valuenow={trimEnd}
        tabindex="0"
      >
        <div class="trim-handle-bar"></div>
      </div>
    </div>
    <span class="audio-duration">{audioData.duration.toFixed(1)}s</span>
  {/if}

  <!-- Playback Controls -->
  <div class="playback-controls">
    <button
      type="button"
      class="control-btn start-again"
      onclick={handleStartAgain}
      disabled={!hasAudio}
      aria-label="Start again"
    >
      <img src="/icons/icon-start-again.svg" alt="" class="control-icon" />
    </button>

    <div class="playback-center">
      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipBack}
        disabled={!hasAudio}
        aria-label="Skip back 5 seconds"
      >
        <img src="/icons/icon-back-five.svg" alt="" class="control-icon" />
      </button>

      <button
        type="button"
        class="play-btn"
        class:active={hasAudio}
        class:playing={isPlaying}
        onclick={handlePlayPause}
        disabled={!hasAudio && !isRecording}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <img
          src={isPlaying ? '/icons/icon-pause-fill.svg' : '/icons/icon-play-fill.svg'}
          alt=""
          class="play-icon"
        />
      </button>

      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipForward}
        disabled={!hasAudio}
        aria-label="Skip forward 5 seconds"
      >
        <img src="/icons/icon-forward-five.svg" alt="" class="control-icon" />
      </button>
    </div>

    <button
      type="button"
      class="control-btn mic"
      class:active={isRecording}
      onclick={handleMicClick}
      aria-label="Record audio"
      aria-pressed={isRecording}
    >
      <img
        src={isRecording ? '/icons/icon-mic-fill.svg' : '/icons/icon-mic.svg'}
        alt=""
        class="control-icon"
      />
    </button>
  </div>

  <!-- Toggle Panels -->
  <div class="toggle-panels">
    <TogglePanel
      label="Waveform"
      isActive={waveformActive}
      isOpen={openPanel === 'waveform'}
      onToggle={(active) => handlePanelToggle('waveform', active)}
      onOpenChange={(open) => handlePanelOpenChange('waveform', open)}
    >
      <p class="panel-placeholder">Waveform options coming soon</p>
    </TogglePanel>

    <TogglePanel
      label="Title"
      isActive={titleActive}
      isOpen={openPanel === 'title'}
      onToggle={(active) => handlePanelToggle('title', active)}
      onOpenChange={(open) => handlePanelOpenChange('title', open)}
    >
      <p class="panel-placeholder">Title options coming soon</p>
    </TogglePanel>

    <TogglePanel
      label="Light effect"
      isActive={lightActive}
      isOpen={openPanel === 'light'}
      onToggle={(active) => handlePanelToggle('light', active)}
      onOpenChange={(open) => handlePanelOpenChange('light', open)}
    >
      <p class="panel-placeholder">Light effect options coming soon</p>
    </TogglePanel>
  </div>

  <!-- Download Button -->
  <button
    type="button"
    class="download-btn"
    class:active={canDownload}
    onclick={handleDownload}
    disabled={!canDownload}
  >
    Download audiogram
  </button>
</div>

{#if showCropDrawer && imageData}
  <ImageCropDrawer
    imageUrl={URL.createObjectURL(imageData.resized)}
    currentRatio={imageData.aspectRatio}
    onDone={handleCropDone}
    onClose={handleCloseCropDrawer}
  />
{/if}

<style>
  .audiogram-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .upload-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-md);
    border: 2px dashed var(--color-border-dark);
    border-radius: var(--radius-md);
    background: var(--color-white);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .upload-box:hover {
    border-color: var(--color-primary);
    background: var(--color-lavender-veil);
  }

  .upload-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .upload-icon {
    width: 24px;
    height: 24px;
    filter: invert(0.46);
  }

  .image-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .image-preview {
    position: relative;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-app-bg);
  }

  .preview-image {
    width: 100%;
    height: auto;
    display: block;
  }

  .image-loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .image-actions {
    display: flex;
    justify-content: space-between;
    padding: 0 var(--spacing-xs);
  }

  .text-btn {
    background: none;
    border: none;
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: color var(--transition-fast);
  }

  .text-btn:hover {
    color: var(--color-primary);
  }

  .upload-box.loading {
    cursor: wait;
    opacity: 0.7;
  }

  .loading-spinner.small {
    width: 20px;
    height: 20px;
    border-width: 2px;
  }

  .audio-waveform-container {
    position: relative;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--color-white);
    cursor: pointer;
    touch-action: none;
  }

  .waveform-canvas {
    width: 100%;
    height: 60px;
    display: block;
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20px;
    transform: translateX(-50%);
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    touch-action: none;
  }

  .trim-handle.start {
    background: linear-gradient(to right, rgba(200, 200, 200, 0.6), transparent);
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  .trim-handle.end {
    background: linear-gradient(to left, rgba(200, 200, 200, 0.6), transparent);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .trim-handle-bar {
    width: 4px;
    height: 24px;
    background: #555555;
    border-radius: 2px;
  }

  .trim-handle:hover .trim-handle-bar,
  .trim-handle:focus .trim-handle-bar {
    background: var(--color-primary);
  }

  .audio-duration {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

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
    transition: all var(--transition-fast);
  }

  .control-btn:disabled {
    cursor: default;
  }

  .control-btn:disabled .control-icon {
    opacity: 0.4;
  }

  .control-btn:hover:not(:disabled) .control-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .control-btn.mic.active .control-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .control-icon {
    width: 32px;
    height: 32px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .play-btn {
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-white);
    border: 3px solid #777777 !important;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
    flex-shrink: 0;
    -webkit-appearance: none;
    appearance: none;
  }

  .play-btn:disabled {
    cursor: not-allowed;
  }

  .play-btn:disabled .play-icon {
    opacity: 0.4;
  }

  .play-btn.active {
    border-color: var(--color-primary) !important;
    background: var(--color-white);
  }

  .play-btn.active .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
    -webkit-filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-btn.playing {
    border-color: var(--color-primary) !important;
  }

  .play-btn.playing .play-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%);
  }

  .play-icon {
    width: 40px;
    height: 40px;
    filter: brightness(0) saturate(100%) invert(60%);
    transition: filter var(--transition-fast);
    display: block;
    -webkit-filter: brightness(0) saturate(100%) invert(60%);
  }

  .toggle-panels {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .panel-placeholder {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: center;
    padding: var(--spacing-md);
  }

  .download-btn {
    width: 100%;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    background: var(--color-app-bg);
    border: none;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: not-allowed;
    transition: all var(--transition-fast);
  }

  .download-btn.active {
    background: var(--color-primary);
    color: var(--color-white);
    cursor: pointer;
  }

  .download-btn.active:hover {
    background: #4a1d9e;
  }
</style>
