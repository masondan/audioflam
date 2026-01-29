<script lang="ts">
  import { tick } from 'svelte';
  import TogglePanel from './TogglePanel.svelte';
  import ImageCropDrawer from './ImageCropDrawer.svelte';
  import CompositionCanvas from './CompositionCanvas.svelte';
  import WaveformPanel from './WaveformPanel.svelte';
  import TitlePanel from './TitlePanel.svelte';
  import LightEffectPanel from './LightEffectPanel.svelte';
  import type { WaveformStyle } from './WaveformPanel.svelte';
  import type { TitleFont, TitleAlign } from './TitlePanel.svelte';
  import { decodeAudioFile, extractWaveformData, drawWaveform, type WaveformData } from '$lib/utils/waveform';
  import {
    requestMicrophonePermission,
    createAudioAnalyser,
    createMediaRecorder,
    blobToAudioBuffer,
    stopStream,
    getFrequencyData,
    drawLiveWaveform
  } from '$lib/utils/recording';
  import type { WaveformConfig, WaveformPosition, TitleConfig, TitlePosition, LightEffectConfig } from '$lib/utils/compositor';
  import { smartExportVideo, downloadBlob, generateFilename, getExtensionFromMimeType, type ExportProgress, type ExportResult } from '$lib/utils/video-export';

  type OpenPanel = 'waveform' | 'title' | 'light' | null;
  type AspectRatio = 'none' | '9:16' | '1:1' | '16:9';
  type RecordingPhase = 'idle' | 'ready' | 'countdown' | 'recording';

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
  
  // Track which overlay is currently selected (showing border)
  let waveformSelected = $state(false);
  let titleSelected = $state(false);

  // Waveform overlay state
  let waveformStyle = $state<WaveformStyle>('bars');
  let waveformColor = $state('#ffffff');
  let waveformOpacity = $state(1);
  let waveformPosition = $state<WaveformPosition>({
    x: 0.1,
    y: 0.65,
    width: 0.8,
    height: 0.25
  });
  let waveformFrequencyData = $state<Uint8Array | undefined>(undefined);
  let playbackAnalyser: AnalyserNode | null = null;
  let playbackAudioContext: AudioContext | null = null;
  let playbackAnimationId: number | null = null;

  // Title overlay state
  let titleText = $state('');
  let titleFont = $state<TitleFont>('Inter');
  let titleAlign = $state<TitleAlign>('center');
  let titleBold = $state(true);
  let titleLineHeight = $state(1);
  let titleLetterSpacing = $state(0);
  let titleColor = $state('#ffffff');
  let labelEnabled = $state(true);
  let labelOpacity = $state(0.5);
  let labelSpace = $state(0.5);
  let labelColor = $state('#333333');
  let titlePosition = $state<TitlePosition>({
    x: 0.1,
    y: 0.05,
    width: 0.8,
    height: 0.15
  });

  // Light effect state
  let lightOpacity = $state(0.5);
  let lightSpeed = $state(0.5);
  let lightPhase = $state(0);
  let lightAnimationId: number | null = null;

  // Recording state
  let recordingPhase = $state<RecordingPhase>('idle');
  let countdownNumber = $state(3);
  let micError = $state<string | null>(null);
  
  // Recording resources (not reactive to avoid loops)
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let recordedChunks: Blob[] = [];
  let liveWaveformData: number[] = [];
  let recordingAnimationId: number | null = null;
  let lastBarTime = 0;
  const BAR_INTERVAL_MS = 100; // Add a new bar every 100ms (~10 bars/second)

  // Export state
  let isExporting = $state(false);
  let exportProgress = $state<ExportProgress | null>(null);
  let showFilenameModal = $state(false);
  let exportFilename = $state('');
  let pendingVideoBlob = $state<Blob | null>(null);
  let pendingVideoMimeType = $state('');
  let compositionCanvasRef = $state<{ 
  getCanvas: () => HTMLCanvasElement | null;
  renderFrame: () => void;
} | null>(null);

  let hasAudio = $derived(audioData !== null);
  let hasImage = $derived(imageData !== null);
  let canDownload = $derived(hasImage && hasAudio);
  let isMicActive = $derived(recordingPhase !== 'idle');

  let waveformConfig = $derived<WaveformConfig | null>(
    waveformActive ? {
      enabled: true,
      position: waveformPosition,
      color: waveformColor,
      style: waveformStyle,
      frequencyData: waveformFrequencyData,
      isEditing: waveformSelected && !isPlaying && !isExporting,
      opacity: waveformOpacity
    } : null
  );

  let titleConfig = $derived<TitleConfig | null>(
    titleActive ? {
      enabled: true,
      text: titleText,
      font: titleFont,
      align: titleAlign,
      bold: titleBold,
      lineHeight: titleLineHeight,
      letterSpacing: titleLetterSpacing,
      color: titleColor,
      labelEnabled: labelEnabled,
      labelOpacity: labelOpacity,
      labelSpace: labelSpace,
      labelColor: labelColor,
      position: titlePosition,
      isEditing: titleSelected && !isPlaying && !isExporting
    } : null
  );

  let lightConfig = $derived<LightEffectConfig | null>(
    lightActive ? {
      enabled: true,
      opacity: lightOpacity,
      speed: lightSpeed,
      phase: lightPhase
    } : null
  );

  function startLightAnimation() {
    if (lightAnimationId !== null) return;
    
    function animate() {
      lightPhase = lightPhase + 1;
      lightAnimationId = requestAnimationFrame(animate);
    }
    lightAnimationId = requestAnimationFrame(animate);
  }

  function stopLightAnimation() {
    if (lightAnimationId !== null) {
      cancelAnimationFrame(lightAnimationId);
      lightAnimationId = null;
    }
  }

  $effect(() => {
    if (lightActive) {
      startLightAnimation();
    } else {
      stopLightAnimation();
    }
    
    return () => {
      stopLightAnimation();
    };
  });

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
        
        // Mobile: reduce resolution for better H.264 encoding on mobile devices
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const maxSize = isMobile ? (isHorizontal ? 1280 : 720) : (isHorizontal ? 1920 : 1080);
        
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

  function handleDeleteImage() {
    if (imageData?.url) {
      URL.revokeObjectURL(imageData.url);
    }
    imageData = null;
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
    
    // Reset waveform overlay when audio is cleared
    stopWaveformAnimation();
    if (playbackAudioContext) {
      playbackAudioContext.close();
      playbackAudioContext = null;
      playbackAnalyser = null;
    }
    waveformActive = false;
    openPanel = null;
    
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
      stopWaveformAnimation();
    } else {
      const startTime = audioData.duration * trimStart;
      if (currentTime < startTime || currentTime >= audioData.duration * trimEnd) {
        audioElement.currentTime = startTime;
        currentTime = startTime;
      }
      audioElement.play();
      isPlaying = true;
      
      if (waveformActive) {
        startWaveformAnimation();
      }
    }
  }

  function startWaveformAnimation() {
    if (!audioElement) return;
    
    if (!playbackAudioContext) {
      playbackAudioContext = new AudioContext();
      const source = playbackAudioContext.createMediaElementSource(audioElement);
      playbackAnalyser = playbackAudioContext.createAnalyser();
      playbackAnalyser.fftSize = 256;
      playbackAnalyser.smoothingTimeConstant = 0.3;
      source.connect(playbackAnalyser);
      playbackAnalyser.connect(playbackAudioContext.destination);
    }
    
    const animate = () => {
      if (!isPlaying || !playbackAnalyser) {
        waveformFrequencyData = undefined;
        return;
      }
      
      const rawData = new Uint8Array(playbackAnalyser.frequencyBinCount);
      playbackAnalyser.getByteFrequencyData(rawData);
      
      // Get the active frequency range (typically first 30-40% has most energy)
      const activeRange = Math.floor(rawData.length * 0.4);
      
      // Calculate average energy from active frequencies
      let totalEnergy = 0;
      for (let i = 0; i < activeRange; i++) {
        totalEnergy += rawData[i];
      }
      const avgEnergy = totalEnergy / activeRange;
      
      // Create output data - spread across full width
      const targetBins = 80;
      const enhancedData = new Uint8Array(targetBins);
      
      for (let i = 0; i < targetBins; i++) {
        // Map each output bin to the active input range, then mirror for right half
        let sourceIdx: number;
        if (i < targetBins / 2) {
          // Left half: map directly to active frequencies
          sourceIdx = Math.floor((i / (targetBins / 2)) * activeRange);
        } else {
          // Right half: mirror from left half (reverse order)
          sourceIdx = Math.floor(((targetBins - 1 - i) / (targetBins / 2)) * activeRange);
        }
        
        const value = rawData[Math.min(sourceIdx, rawData.length - 1)];
        
        // Add time-based variation for organic movement
        const phase = Date.now() * 0.008;
        const variation = Math.sin(i * 0.4 + phase) * 20 + Math.sin(i * 0.15 + phase * 0.7) * 15;
        
        // Boost and clamp
        const enhanced = Math.min(255, value * 1.3 + variation + avgEnergy * 0.3);
        enhancedData[i] = Math.max(30, enhanced);
      }
      
      waveformFrequencyData = enhancedData;
      playbackAnimationId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  function stopWaveformAnimation() {
    if (playbackAnimationId) {
      cancelAnimationFrame(playbackAnimationId);
      playbackAnimationId = null;
    }
    waveformFrequencyData = undefined;
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
      stopWaveformAnimation();
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

  async function handleMicClick() {
    micError = null;
    
    if (recordingPhase !== 'idle') {
      // Deactivate mic - cancel any recording in progress
      cleanupRecording();
      recordingPhase = 'idle';
      return;
    }
    
    // Activate mic - request permission and enter ready state
    try {
      mediaStream = await requestMicrophonePermission();
      const result = createAudioAnalyser(mediaStream);
      audioContext = result.audioContext;
      analyser = result.analyser;
      recordingPhase = 'ready';
    } catch (err) {
      micError = err instanceof Error ? err.message : 'Failed to access microphone';
      console.error('Mic error:', err);
    }
  }

  function cleanupRecording() {
    if (recordingAnimationId) {
      cancelAnimationFrame(recordingAnimationId);
      recordingAnimationId = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
    stopStream(mediaStream);
    mediaStream = null;
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    analyser = null;
    recordedChunks = [];
    liveWaveformData = [];
    isRecording = false;
  }

  async function handleRecordPlayPause() {
    if (recordingPhase === 'ready') {
      // Start countdown
      startCountdown();
    } else if (recordingPhase === 'recording') {
      // Stop recording
      stopRecording();
    }
  }

  function startCountdown() {
    recordingPhase = 'countdown';
    countdownNumber = 3;
    
    const countdownInterval = setInterval(() => {
      countdownNumber--;
      if (countdownNumber <= 0) {
        clearInterval(countdownInterval);
        startRecording();
      }
    }, 1000);
  }

  async function startRecording() {
    if (!mediaStream) return;
    
    recordingPhase = 'recording';
    isRecording = true;
    recordedChunks = [];
    liveWaveformData = [];
    lastBarTime = 0;
    
    mediaRecorder = createMediaRecorder(mediaStream);
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      await processRecording();
    };
    
    mediaRecorder.start(100); // Collect data every 100ms
    
    // Wait for DOM to update so canvas is available
    await tick();
    
    // Start live waveform animation
    animateLiveWaveform();
  }

  function animateLiveWaveform() {
    if (!analyser || !waveformCanvas || recordingPhase !== 'recording') return;
    
    const now = performance.now();
    const shouldAddBar = now - lastBarTime >= BAR_INTERVAL_MS;
    
    if (shouldAddBar) {
      const frequencyData = getFrequencyData(analyser);
      
      // Get RMS amplitude for better sensitivity
      let sumSquares = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sumSquares += frequencyData[i] * frequencyData[i];
      }
      const rms = Math.sqrt(sumSquares / frequencyData.length);
      
      // Boost and clamp the amplitude for visibility (rms typically 0-100 range)
      const boosted = Math.min(255, rms * 2.5);
      liveWaveformData.push(boosted);
      lastBarTime = now;
    }
    
    // Always redraw for smooth visuals
    drawLiveWaveform(waveformCanvas, new Uint8Array(liveWaveformData), liveWaveformData.length);
    
    recordingAnimationId = requestAnimationFrame(animateLiveWaveform);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (recordingAnimationId) {
      cancelAnimationFrame(recordingAnimationId);
      recordingAnimationId = null;
    }
  }

  async function processRecording() {
    if (recordedChunks.length === 0) {
      cleanupRecording();
      recordingPhase = 'idle';
      return;
    }
    
    audioLoading = true;
    
    try {
      const blob = new Blob(recordedChunks, { type: recordedChunks[0].type });
      const buffer = await blobToAudioBuffer(blob);
      const waveform = await extractWaveformData(buffer);
      
      // Create a File from the blob for consistency with imported audio
      const file = new File([blob], 'recording.webm', { type: blob.type });
      const url = URL.createObjectURL(blob);
      
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
      console.error('Failed to process recording:', err);
    } finally {
      cleanupRecording();
      recordingPhase = 'idle';
      audioLoading = false;
    }
  }

  function handleRecordingStartAgain() {
    // Clear recorded audio but stay in mic-ready mode
    if (audioData) {
      URL.revokeObjectURL(audioData.url);
      audioData = null;
    }
    if (audioElement) {
      audioElement.pause();
      audioElement = null;
    }
    isPlaying = false;
    trimStart = 0;
    trimEnd = 1;
    currentTime = 0;
    
    // If we have a stream, stay in ready mode
    if (mediaStream && recordingPhase === 'idle') {
      // Re-enter ready state if mic was active
    }
  }

  function handlePanelToggle(panel: OpenPanel, active: boolean) {
    if (panel === 'waveform') {
      waveformActive = active;
      // Select waveform when activated, deselect when deactivated
      waveformSelected = active;
      if (active) titleSelected = false;
    }
    if (panel === 'title') {
      titleActive = active;
      // Select title when activated, deselect when deactivated
      titleSelected = active;
      if (active) waveformSelected = false;
    }
    if (panel === 'light') {
      lightActive = active;
      // Light effect panel deselects all overlays
      waveformSelected = false;
      titleSelected = false;
    }
  }

  function handlePanelOpenChange(panel: OpenPanel, open: boolean) {
    if (open) {
      openPanel = panel;
      // Deselect overlays when opening a different panel's options
      if (panel === 'waveform') {
        waveformSelected = true;
        titleSelected = false;
      } else if (panel === 'title') {
        titleSelected = true;
        waveformSelected = false;
      } else if (panel === 'light') {
        waveformSelected = false;
        titleSelected = false;
      }
    } else if (openPanel === panel) {
      openPanel = null;
    }
  }

  async function handleDownload() {
    if (!canDownload || !audioData) return;

    isExporting = true;
    exportProgress = {
      phase: 'preparing',
      progress: 0,
      message: 'Initializing...'
    };

    try {
      // Get the canvas from the CompositionCanvas component
      const canvas = compositionCanvasRef?.getCanvas();
      if (!canvas) {
        throw new Error('Canvas not available');
      }

      // Ensure we have an audio element
      if (!audioElement) {
        audioElement = new Audio(audioData.url);
        audioElement.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Audio element failed to load'));
          }, 5000);
          audioElement!.onloadedmetadata = () => {
            clearTimeout(timeout);
            console.log('[Export] Audio element loaded:', {
              duration: audioElement!.duration,
              readyState: audioElement!.readyState
            });
            resolve();
          };
          audioElement!.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load audio element'));
          };
          audioElement!.load();
        });
      }

      // Set audio to trim start position
      const audioDuration = audioData.duration * (trimEnd - trimStart);
      audioElement.currentTime = audioData.duration * trimStart;

      // Get trimmed audio buffer for WebCodecs export
      // Note: For trimmed audio, we create a slice of the original buffer
      let trimmedAudioBuffer: AudioBuffer | undefined;
      if (audioData.buffer) {
        const startSample = Math.floor(audioData.buffer.sampleRate * audioData.duration * trimStart);
        const endSample = Math.floor(audioData.buffer.sampleRate * audioData.duration * trimEnd);
        const sampleCount = endSample - startSample;
        
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          trimmedAudioBuffer = audioContext.createBuffer(
            audioData.buffer.numberOfChannels,
            sampleCount,
            audioData.buffer.sampleRate
          );
          for (let channel = 0; channel < audioData.buffer.numberOfChannels; channel++) {
            const sourceData = audioData.buffer.getChannelData(channel);
            const destData = trimmedAudioBuffer.getChannelData(channel);
            destData.set(sourceData.subarray(startSample, endSample));
          }
          audioContext.close();
        } catch (e) {
          console.warn('[Export] Could not create trimmed audio buffer:', e);
          // Will fall back to audio element capture
        }
      }

      // Export using smartExportVideo (WebCodecs on Android, MediaRecorder fallback)
      const exportResult = await smartExportVideo(
        canvas,
        audioElement,
        trimmedAudioBuffer,
        audioDuration,
        (progress) => {
          exportProgress = progress;
        },
        (currentTimeInExport) => {
          // Render frame callback - receives current time for animation sync
          // For WebCodecs export: generate waveform data from pre-computed peaks
          // (we don't use live audio analysis because it causes stuttering)
          if (waveformActive && audioData?.waveform) {
            const totalDuration = audioData.duration * (trimEnd - trimStart);
            const timePosition = currentTimeInExport / totalDuration;
            const peakIndex = Math.floor(timePosition * audioData.waveform.peaks.length);
            
            // Generate frequency data based on current amplitude
            const currentAmplitude = audioData.waveform.peaks[Math.min(peakIndex, audioData.waveform.peaks.length - 1)] || 0.5;
            const targetBins = 80;
            const syntheticData = new Uint8Array(targetBins);
            
            for (let i = 0; i < targetBins; i++) {
              // Create symmetrical waveform with variation
              const phase = currentTimeInExport * 8 + i * 0.4;
              const variation = Math.sin(phase) * 20 + Math.sin(phase * 0.7) * 15;
              const baseValue = currentAmplitude * 180;
              syntheticData[i] = Math.max(30, Math.min(255, baseValue + variation));
            }
            waveformFrequencyData = syntheticData;
          }
          compositionCanvasRef?.renderFrame();
        },
        () => {
          // Start audio playback callback
          isPlaying = true;
          audioElement?.play();
          if (waveformActive) {
            startWaveformAnimation();
          }
        },
        () => {
          // Stop audio playback callback
          isPlaying = false;
          audioElement?.pause();
          stopWaveformAnimation();
        }
      );

      // Store the blob/mimeType and show filename modal
      console.log('[Export] Received result, blob size:', exportResult.blob.size);
      pendingVideoBlob = exportResult.blob;
      pendingVideoMimeType = exportResult.mimeType;
      exportFilename = generateFilename(exportResult.mimeType);
      console.log('[Export] Showing filename modal');
      showFilenameModal = true;
    } catch (err) {
      console.error('Export failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      exportProgress = {
        phase: 'complete',
        progress: 0,
        message: `Export failed: ${errorMessage}`
      };
      // Keep error visible for 5 seconds
      setTimeout(() => {
        if (exportProgress?.progress === 0) {
          exportProgress = null;
        }
      }, 5000);
    } finally {
      isExporting = false;
    }
  }

  function handleFilenameConfirm() {
    if (pendingVideoBlob && exportFilename) {
      const extension = getExtensionFromMimeType(pendingVideoMimeType);
      const filename = exportFilename.endsWith(`.${extension}`) 
        ? exportFilename 
        : `${exportFilename}.${extension}`;
      downloadBlob(pendingVideoBlob, filename);
    }
    handleFilenameCancel();
  }

  function handleFilenameCancel() {
    showFilenameModal = false;
    pendingVideoBlob = null;
    pendingVideoMimeType = '';
    exportFilename = '';
    exportProgress = null;
  }

  function handleWaveformPositionChange(position: WaveformPosition) {
    waveformPosition = position;
  }

  function handleWaveformOverlayClick() {
    if (isPlaying) {
      handlePlayPause();
    } else {
      // Select waveform overlay (show border)
      waveformSelected = true;
      titleSelected = false;
    }
  }

  function handleWaveformStyleChange(style: WaveformStyle) {
    waveformStyle = style;
  }

  function handleWaveformColorChange(color: string) {
    waveformColor = color;
  }

  function handleTitleTextChange(text: string) {
    // Auto-wrap: insert line breaks when text exceeds 90% of canvas width
    const canvas = compositionCanvasRef?.getCanvas();
    if (canvas) {
      const maxWidth = titlePosition.width * canvas.width * 0.9; // 90% of title area width
      const fontSize = titlePosition.width * canvas.width * 0.07; // Must match compositor.ts
      
      const fontFamilyMap: Record<string, string> = {
        'Inter': "'Inter', sans-serif",
        'Lora': "'Lora', serif",
        'Roboto Slab': "'Roboto Slab', serif",
        'Saira Condensed': "'Saira Condensed', sans-serif",
        'Playfair Display': "'Playfair Display', serif",
        'Bebas Neue': "'Bebas Neue', sans-serif"
      };
      const fontFamily = fontFamilyMap[titleFont] || "'Inter', sans-serif";
      const fontWeight = titleFont === 'Bebas Neue' ? 400 : (titleBold ? (titleFont === 'Inter' ? 800 : 700) : 400);
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        if (titleLetterSpacing !== 0) {
          ctx.letterSpacing = `${titleLetterSpacing}em`;
        }
        
        // Process each line and wrap if needed
        const inputLines = text.split('\n');
        const outputLines: string[] = [];
        
        for (const line of inputLines) {
          const words = line.split(' ');
          let currentLine = '';
          
          for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
              outputLines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            outputLines.push(currentLine);
          }
        }
        
        ctx.restore();
        
        const wrappedText = outputLines.join('\n');
        if (wrappedText !== text) {
          titleText = wrappedText;
          return;
        }
      }
    }
    
    titleText = text;
  }

  function handleTitleFontChange(font: TitleFont) {
    titleFont = font;
    if (font === 'Inter') {
      titleBold = true;
    } else if (font === 'Bebas Neue') {
      titleBold = false;
    }
  }

  function handleTitleAlignChange(align: TitleAlign) {
    titleAlign = align;
  }

  function handleTitleBoldChange(bold: boolean) {
    titleBold = bold;
  }

  function handleTitleLineHeightChange(value: number) {
    titleLineHeight = value;
  }

  function handleTitleLetterSpacingChange(value: number) {
    titleLetterSpacing = value;
  }

  function handleTitleColorChange(color: string) {
    titleColor = color;
  }

  function handleLabelEnabledChange(enabled: boolean) {
    labelEnabled = enabled;
  }

  function handleLabelOpacityChange(value: number) {
    labelOpacity = value;
  }

  function handleLabelSpaceChange(value: number) {
    labelSpace = value;
  }

  function handleLabelColorChange(color: string) {
    labelColor = color;
  }

  function handleTitlePositionChange(position: TitlePosition) {
    titlePosition = position;
  }

  function handleTitleOverlayClick() {
    if (isPlaying) {
      handlePlayPause();
    } else {
      // Select title overlay (show border)
      titleSelected = true;
      waveformSelected = false;
    }
  }
  
  function handleCanvasBackgroundClick() {
    // Deselect all overlays when clicking canvas background
    waveformSelected = false;
    titleSelected = false;
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
      <CompositionCanvas 
        bind:this={compositionCanvasRef}
        imageUrl={imageData.url} 
        loading={imageLoading}
        waveformConfig={waveformConfig}
        titleConfig={titleConfig}
        lightConfig={lightConfig}
        isPlaying={isPlaying}
        onWaveformPositionChange={handleWaveformPositionChange}
        onWaveformClick={handleWaveformOverlayClick}
        onTitlePositionChange={handleTitlePositionChange}
        onTitleClick={handleTitleOverlayClick}
        onBackgroundClick={handleCanvasBackgroundClick}
      />
      <div class="image-actions">
        <button type="button" class="text-btn" onclick={handleDeleteImage}>
          Delete image
        </button>
        <button type="button" class="text-btn" onclick={handleResizeClick}>
          Resize
        </button>
      </div>
    </div>
  {/if}

  <!-- Audio Upload / Recording -->
  {#if !audioData && recordingPhase === 'idle'}
    <!-- Default upload state -->
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
  {:else if !audioData && recordingPhase === 'ready'}
    <!-- Mic ready - show instructions -->
    <div class="recording-box">
      <p class="recording-instructions">
        Tap Play to record. Tap Stop to end.<br />
        Tap refresh to start again.
      </p>
      {#if micError}
        <p class="mic-error">{micError}</p>
      {/if}
    </div>
  {:else if !audioData && (recordingPhase === 'countdown' || recordingPhase === 'recording')}
    <!-- Recording in progress -->
    <div class="recording-box recording-active" bind:this={waveformContainer}>
      {#if recordingPhase === 'countdown'}
        <div class="countdown-display">
          <span class="countdown-number">{countdownNumber}</span>
        </div>
      {:else}
        <div class="live-waveform-container">
          <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
          <div class="center-playhead"></div>
        </div>
      {/if}
    </div>
  {:else if audioLoading}
    <!-- Processing recorded audio -->
    <div class="recording-box">
      <span class="upload-label">Processing audio...</span>
      <div class="loading-spinner small"></div>
    </div>
  {:else}
    <div 
      class="audio-waveform-container"
      bind:this={waveformContainer}
      onclick={handleWaveformClick}
      onkeydown={handleWaveformKeydown}
      role="slider"
      aria-label="Audio waveform"
      aria-valuemin={0}
      aria-valuemax={audioData?.duration ?? 0}
      aria-valuenow={currentTime}
      tabindex="0"
    >
      <div
        class="trim-handle start"
        style="left: calc({trimStart} * (100% - 44px))"
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
      <!-- White overlay for trimmed start area -->
      {#if trimStart > 0}
        <div class="trim-overlay start" style="width: calc({trimStart} * (100% - 44px))"></div>
      {/if}
      <canvas
        bind:this={waveformCanvas}
        class="waveform-canvas"
      ></canvas>
      <!-- White overlay for trimmed end area -->
      {#if trimEnd < 1}
        <div class="trim-overlay end" style="width: calc({1 - trimEnd} * (100% - 44px))"></div>
      {/if}
      <div
        class="trim-handle end"
        style="left: calc(22px + {trimEnd} * (100% - 44px))"
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
    <span class="audio-duration">{audioData?.duration.toFixed(1)}s</span>
  {/if}

  <!-- Playback Controls -->
  <div class="playback-controls">
    <button
      type="button"
      class="control-btn start-again"
      onclick={isMicActive ? handleRecordingStartAgain : handleStartAgain}
      disabled={!hasAudio && !isMicActive}
      aria-label="Start again"
    >
      <img src="/icons/icon-start-again.svg" alt="" class="control-icon" />
    </button>

    <div class="playback-center">
      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipBack}
        disabled={!hasAudio || isMicActive}
        aria-label="Skip back 5 seconds"
      >
        <img src="/icons/icon-back-five.svg" alt="" class="control-icon" />
      </button>

      <button
        type="button"
        class="play-btn"
        class:active={hasAudio || isMicActive}
        class:playing={isPlaying || recordingPhase === 'recording'}
        onclick={isMicActive ? handleRecordPlayPause : handlePlayPause}
        disabled={!hasAudio && !isMicActive}
        aria-label={recordingPhase === 'recording' ? 'Stop' : isPlaying ? 'Pause' : 'Play'}
      >
        {#if recordingPhase === 'countdown'}
          <img
            src="/icons/icon-{countdownNumber === 3 ? 'three' : countdownNumber === 2 ? 'two' : 'one'}.svg"
            alt={String(countdownNumber)}
            class="play-icon countdown-icon"
          />
        {:else if recordingPhase === 'recording'}
          <img
            src="/icons/icon-stop-fill.svg"
            alt=""
            class="play-icon"
          />
        {:else}
          <img
            src={isPlaying ? '/icons/icon-pause-fill.svg' : '/icons/icon-play-fill.svg'}
            alt=""
            class="play-icon"
          />
        {/if}
      </button>

      <button
        type="button"
        class="control-btn skip"
        onclick={handleSkipForward}
        disabled={!hasAudio || isMicActive}
        aria-label="Skip forward 5 seconds"
      >
        <img src="/icons/icon-forward-five.svg" alt="" class="control-icon" />
      </button>
    </div>

    <button
      type="button"
      class="control-btn mic"
      class:active={isMicActive}
      onclick={handleMicClick}
      disabled={hasAudio}
      aria-label="Record audio"
      aria-pressed={isMicActive}
    >
      <img
        src={isMicActive ? '/icons/icon-mic-fill.svg' : '/icons/icon-mic.svg'}
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
      <WaveformPanel
        selectedStyle={waveformStyle}
        selectedColor={waveformColor}
        opacity={waveformOpacity}
        onStyleChange={handleWaveformStyleChange}
        onColorChange={handleWaveformColorChange}
        onOpacityChange={(opacity) => waveformOpacity = opacity}
      />
    </TogglePanel>

    <TogglePanel
      label="Title"
      isActive={titleActive}
      isOpen={openPanel === 'title'}
      onToggle={(active) => handlePanelToggle('title', active)}
      onOpenChange={(open) => handlePanelOpenChange('title', open)}
    >
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
        onTextChange={handleTitleTextChange}
        onFontChange={handleTitleFontChange}
        onAlignChange={handleTitleAlignChange}
        onBoldChange={handleTitleBoldChange}
        onLineHeightChange={handleTitleLineHeightChange}
        onLetterSpacingChange={handleTitleLetterSpacingChange}
        onTextColorChange={handleTitleColorChange}
        onLabelEnabledChange={handleLabelEnabledChange}
        onLabelOpacityChange={handleLabelOpacityChange}
        onLabelSpaceChange={handleLabelSpaceChange}
        onLabelColorChange={handleLabelColorChange}
      />
    </TogglePanel>

    <TogglePanel
      label="Light effect"
      isActive={lightActive}
      isOpen={openPanel === 'light'}
      onToggle={(active) => handlePanelToggle('light', active)}
      onOpenChange={(open) => handlePanelOpenChange('light', open)}
    >
      <LightEffectPanel
        opacity={lightOpacity}
        speed={lightSpeed}
        onOpacityChange={(opacity) => lightOpacity = opacity}
        onSpeedChange={(speed) => lightSpeed = speed}
      />
    </TogglePanel>
  </div>

  <!-- Download Button -->
  <button
    type="button"
    class="download-btn"
    class:active={canDownload && !isExporting && !exportProgress}
    class:error={exportProgress && exportProgress.progress === 0}
    onclick={handleDownload}
    disabled={!canDownload || isExporting || !!exportProgress}
  >
    {#if exportProgress}
      <div class="export-progress">
        <span class="export-message">{exportProgress.message}</span>
        {#if exportProgress.progress > 0}
          <div class="export-bar">
            <div class="export-bar-fill" style="width: {exportProgress.progress * 100}%"></div>
          </div>
        {/if}
      </div>
    {:else}
      Download audiogram
    {/if}
  </button>
</div>

<!-- Filename Modal -->
{#if showFilenameModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-overlay" onclick={handleFilenameCancel} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
      <h3 id="modal-title" class="modal-title">Save audiogram</h3>
      <input
        type="text"
        class="filename-input"
        bind:value={exportFilename}
        placeholder="Enter filename"
        onkeydown={(e) => e.key === 'Enter' && handleFilenameConfirm()}
      />
      <div class="modal-actions">
        <button type="button" class="modal-btn cancel" onclick={handleFilenameCancel}>
          Cancel
        </button>
        <button type="button" class="modal-btn confirm" onclick={handleFilenameConfirm}>
          Download
        </button>
      </div>
    </div>
  </div>
{/if}

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

  /* Recording UI */
  .recording-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-white);
  }

  .recording-box.recording-active {
    padding: var(--spacing-sm) 0;
  }

  .recording-instructions {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: center;
    line-height: 1.5;
    margin: 0;
  }

  .mic-error {
    font-size: var(--font-size-sm);
    color: #d32f2f;
    text-align: center;
    margin-top: var(--spacing-sm);
  }

  .countdown-display {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 60px;
  }

  .countdown-number {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-primary);
    animation: pulse 1s ease-in-out;
  }

  @keyframes pulse {
    0% { transform: scale(1.2); opacity: 0.7; }
    50% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }

  .countdown-icon {
    filter: invert(15%) sepia(95%) saturate(4500%) hue-rotate(260deg) brightness(85%) contrast(95%) !important;
  }

  .live-waveform-container {
    position: relative;
    width: 100%;
  }

  .center-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: var(--color-primary);
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 5;
  }

  .audio-waveform-container {
    position: relative;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) 22px;
    background: var(--color-white);
    cursor: pointer;
    touch-action: none;
  }

  .waveform-canvas {
    width: 100%;
    height: 60px;
    display: block;
  }

  /* White overlay for trimmed areas */
  .trim-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--color-white);
    z-index: 5;
    pointer-events: none;
  }

  .trim-overlay.start {
    left: 22px;
  }

  .trim-overlay.end {
    right: 22px;
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 22px;
    cursor: ew-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    touch-action: none;
    background: #999999;
  }

  .trim-handle.start {
    border-radius: 6px 0 0 6px;
  }

  .trim-handle.end {
    border-radius: 0 6px 6px 0;
  }

  .trim-handle-bar {
    width: 4px;
    height: 28px;
    background: var(--color-white);
    border-radius: 2px;
  }

  .trim-handle:hover,
  .trim-handle:focus {
    background: #888888;
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

  .download-btn.error {
    background: #dc3545;
    color: var(--color-white);
  }

  /* Export progress styles */
  .export-progress {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    width: 100%;
  }

  .export-message {
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .export-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .export-bar-fill {
    height: 100%;
    background: white;
    border-radius: var(--radius-full);
    transition: width 0.2s ease-out;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .modal-content {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .modal-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .filename-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-family: inherit;
    outline: none;
    transition: border-color var(--transition-fast);
  }

  .filename-input:focus {
    border-color: var(--color-primary);
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  .modal-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .modal-btn.cancel {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .modal-btn.cancel:hover {
    background: var(--color-app-bg);
  }

  .modal-btn.confirm {
    background: var(--color-primary);
    border: none;
    color: var(--color-white);
  }

  .modal-btn.confirm:hover {
    background: #4a1d9e;
  }
</style>
