/**
 * WebCodecs-based MP4 export for mobile devices
 * 
 * This bypasses MediaRecorder (which lies about H.264 support on mobile)
 * by using Mediabunny with WebCodecs API for proper H.264 encoding.
 * 
 * Browser support:
 * - Chrome Android: ✅ Full support (85% of AudioFlam users)
 * - Chrome Desktop: ✅ Full support
 * - Safari iOS: ⚠️ Partial (may need fallback)
 * - Firefox: ❌ Limited (needs fallback)
 * 
 * Cost note for fallback:
 * - Your usage: ~200 x 1min videos/year
 * - api.video: Free encoding + ~$0.003/video (storage+delivery) = ~$0/year if deleted after download
 * - Cloudinary: Needs paid tier for 200+ videos = overkill
 */

import type { ExportProgress, ProgressCallback, ExportResult } from './video-export';

// Types for Mediabunny (loaded dynamically)
type MediabunnyModule = typeof import('mediabunny');

// Lazy-load Mediabunny to keep initial bundle small (~17KB for MP4 writing)
let mediabunnyModule: MediabunnyModule | null = null;

async function loadMediabunny(): Promise<MediabunnyModule> {
  if (!mediabunnyModule) {
    mediabunnyModule = await import('mediabunny');
  }
  return mediabunnyModule;
}

/**
 * Check if WebCodecs is available and supports H.264 + AAC encoding
 */
// Store the working codec for use during export
let cachedWorkingH264Codec: string | null = null;

export async function checkWebCodecsSupport(): Promise<{
  supported: boolean;
  hasVideoEncoder: boolean;
  hasAudioEncoder: boolean;
  hasH264: boolean;
  hasAAC: boolean;
  workingCodec?: string;
  reason?: string;
}> {
  // Check basic API availability
  if (!('VideoEncoder' in window)) {
    console.log('[WebCodecs] VideoEncoder not in window');
    return {
      supported: false,
      hasVideoEncoder: false,
      hasAudioEncoder: false,
      hasH264: false,
      hasAAC: false,
      reason: 'VideoEncoder API not available'
    };
  }

  if (!('AudioEncoder' in window)) {
    console.log('[WebCodecs] AudioEncoder not in window');
    return {
      supported: false,
      hasVideoEncoder: true,
      hasAudioEncoder: false,
      hasH264: false,
      hasAAC: false,
      reason: 'AudioEncoder API not available'
    };
  }

  // Check H.264 encoding support with CONSERVATIVE settings
  // Use small resolution (640x480) to maximize hardware compatibility
  // The actual export will use the canvas size
  const testConfigs: VideoEncoderConfig[] = [
    // Try simplest config first - very conservative
    {
      codec: 'avc1.42001f', // Baseline profile, level 3.1 (common on mobile)
      width: 640,
      height: 480,
      bitrate: 1_000_000,
      framerate: 15,
    },
    // Then try baseline profile level 3.0
    {
      codec: 'avc1.42E01E', // Baseline Profile, Level 3.0
      width: 640,
      height: 480,
      bitrate: 1_000_000,
      framerate: 15,
    },
    // Try with just 'avc1' (let browser choose profile)
    {
      codec: 'avc1.4d001f', // Main profile, level 3.1
      width: 640,
      height: 480,
      bitrate: 1_000_000,
      framerate: 15,
    },
  ];

  let hasH264 = false;
  let workingCodec = '';
  
  for (const videoConfig of testConfigs) {
    try {
      console.log('[WebCodecs] Testing H.264 config:', videoConfig.codec);
      const videoSupport = await VideoEncoder.isConfigSupported(videoConfig);
      console.log('[WebCodecs] Config result:', videoSupport);
      
      if (videoSupport.supported === true) {
        hasH264 = true;
        workingCodec = videoConfig.codec;
        cachedWorkingH264Codec = workingCodec; // Cache for later use
        console.log('[WebCodecs] Found working H.264 codec:', workingCodec);
        break;
      }
    } catch (e) {
      console.warn('[WebCodecs] H.264 check failed for', videoConfig.codec, ':', e);
    }
  }

  // Check AAC encoding support
  const audioConfig: AudioEncoderConfig = {
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate: 44100,
    numberOfChannels: 2,
    bitrate: 128000,
  };

  let hasAAC = false;
  try {
    const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
    hasAAC = audioSupport.supported === true;
    console.log('[WebCodecs] AAC support:', hasAAC);
  } catch (e) {
    console.warn('[WebCodecs] AAC check failed:', e);
  }

  const supported = hasH264; // AAC is nice-to-have, video is essential

  console.log('[WebCodecs] Final support check:', { supported, hasH264, hasAAC, workingCodec });

  return {
    supported,
    hasVideoEncoder: true,
    hasAudioEncoder: true,
    hasH264,
    hasAAC,
    workingCodec: workingCodec || undefined,
    reason: !supported
      ? `Missing: ${!hasH264 ? 'H.264 encoder' : ''}${!hasH264 && !hasAAC ? ', ' : ''}${!hasAAC ? 'AAC encoder' : ''}`
      : undefined
  };
}

export interface WebCodecsExportConfig {
  canvas: HTMLCanvasElement;
  audioBuffer?: AudioBuffer; // Optional: decoded audio for encoding
  audioElement?: HTMLAudioElement; // For playback sync during recording
  duration: number; // in seconds
  fps?: number; // Default: 15 (mobile-optimized)
  videoBitrate?: number; // Default: 2 Mbps
  audioBitrate?: number; // Default: 48 kbps (matches app settings)
  onProgress?: ProgressCallback;
  renderFrame?: (currentTime: number) => void; // Pass current time for animation sync
  startAudioPlayback?: () => void;
  stopAudioPlayback?: () => void;
}

/**
 * Export canvas + audio to MP4 using Mediabunny (WebCodecs-based)
 * 
 * This is the primary export method for Android devices.
 * Uses CanvasSource for video and AudioBufferSource for audio.
 */
export async function exportWithWebCodecs(config: WebCodecsExportConfig): Promise<ExportResult> {
  const {
    canvas,
    audioBuffer,
    audioElement,
    duration,
    fps = 15,
    videoBitrate = 2_000_000,
    audioBitrate = 48000, // 48 kbps - matches app settings
    onProgress,
    renderFrame,
    startAudioPlayback,
    stopAudioPlayback,
  } = config;

  console.log('[WebCodecs] Starting export', {
    width: canvas.width,
    height: canvas.height,
    duration,
    fps,
    videoBitrate,
    hasAudio: !!audioBuffer
  });

  onProgress?.({
    phase: 'preparing',
    progress: 0,
    message: 'Loading encoder...'
  });

  // Load Mediabunny
  const mb = await loadMediabunny();
  const { 
    Output, 
    Mp4OutputFormat, 
    BufferTarget, 
    CanvasSource, 
    AudioBufferSource,
    QUALITY_HIGH 
  } = mb;

  onProgress?.({
    phase: 'preparing',
    progress: 0.1,
    message: 'Setting up encoder...'
  });

  // Create output with MP4 format
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  // Track encoded frames for progress
  let encodedFrames = 0;
  const totalFrames = Math.ceil(duration * fps);

  // Add video track from canvas
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc', // H.264
    bitrate: videoBitrate,
    keyFrameInterval: 2, // Keyframe every 2 seconds
    onEncodedPacket: () => {
      encodedFrames++;
      const progress = Math.min(encodedFrames / totalFrames, 0.9);
      onProgress?.({
        phase: 'recording',
        progress,
        message: `Encoding: ${Math.round(progress * 100)}%`
      });
    }
  });
  
  output.addVideoTrack(videoSource, {
    frameRate: fps
  });

  // Add audio track if we have audio data
  let audioSource: InstanceType<typeof AudioBufferSource> | null = null;
  if (audioBuffer) {
    try {
      audioSource = new AudioBufferSource({
        codec: 'aac',
        bitrate: audioBitrate,
      });
      output.addAudioTrack(audioSource);
      console.log('[WebCodecs] Audio track added');
    } catch (e) {
      console.warn('[WebCodecs] Could not add audio track:', e);
      // Continue without audio
    }
  }

  console.log('[WebCodecs] Starting output...');
  await output.start();

  onProgress?.({
    phase: 'recording',
    progress: 0,
    message: 'Recording video...'
  });

  // Calculate frame timing
  const frameDurationMs = 1000 / fps;
  const frameDurationSec = 1 / fps; // Duration in seconds for Mediabunny

  console.log('[WebCodecs] Recording', totalFrames, 'frames at', fps, 'fps');

  // Start audio playback for waveform animation sync (if using audioElement)
  startAudioPlayback?.();

  // Record frames
  const startTime = performance.now();
  
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    // Calculate current time in seconds
    const currentTime = frameIndex / fps;
    
    // Render the frame at this time position
    if (renderFrame) {
      renderFrame(currentTime);
    }

    // Add frame to video source with timestamp and duration (in seconds)
    // CanvasSource.add(timestamp, duration) captures the current canvas state
    await videoSource.add(currentTime, frameDurationSec);

    // Real-time pacing: wait until we should capture the next frame
    const targetTime = (frameIndex + 1) * frameDurationMs;
    const elapsed = performance.now() - startTime;
    if (elapsed < targetTime) {
      await new Promise(resolve => setTimeout(resolve, targetTime - elapsed));
    }
  }

  // Stop audio playback
  stopAudioPlayback?.();
  
  // Close video source (no more frames)
  videoSource.close();

  // Add audio data if we have it
  if (audioSource && audioBuffer) {
    console.log('[WebCodecs] Adding audio buffer...');
    onProgress?.({
      phase: 'processing',
      progress: 0.9,
      message: 'Encoding audio...'
    });

    // Trim audio to match video duration if needed
    const audioDuration = audioBuffer.duration;
    const trimmedDuration = Math.min(audioDuration, duration);
    
    // AudioBufferSource.add() takes an AudioBuffer
    // If audio is longer than video, we should trim it
    if (audioDuration > duration) {
      // Create a trimmed audio buffer
      const sampleRate = audioBuffer.sampleRate;
      const trimmedLength = Math.floor(trimmedDuration * sampleRate);
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const trimmedBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        trimmedLength,
        sampleRate
      );
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel);
        const destData = trimmedBuffer.getChannelData(channel);
        destData.set(sourceData.subarray(0, trimmedLength));
      }
      await audioSource.add(trimmedBuffer);
      audioContext.close();
    } else {
      await audioSource.add(audioBuffer);
    }
    
    audioSource.close();
  }

  console.log('[WebCodecs] Finalizing...');
  onProgress?.({
    phase: 'processing',
    progress: 0.95,
    message: 'Finalizing video...'
  });

  // Finalize the output
  await output.finalize();

  // Get the result
  const target = output.target as InstanceType<typeof BufferTarget>;
  if (!target.buffer) {
    throw new Error('Export failed: no data produced');
  }
  const blob = new Blob([target.buffer], { type: 'video/mp4' });

  console.log('[WebCodecs] Export complete, size:', blob.size, 'bytes');

  onProgress?.({
    phase: 'complete',
    progress: 1,
    message: 'Complete!'
  });

  return {
    blob,
    mimeType: 'video/mp4'
  };
}

/**
 * Export video only (no audio) - useful for testing or when audio encoding fails
 */
export async function exportVideoOnly(config: Omit<WebCodecsExportConfig, 'audioBuffer' | 'audioElement'>): Promise<ExportResult> {
  return exportWithWebCodecs({
    ...config,
    audioBuffer: undefined,
    audioElement: undefined,
  });
}
