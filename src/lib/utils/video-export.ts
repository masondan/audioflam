export interface ExportProgress {
  phase: 'preparing' | 'recording' | 'processing' | 'complete';
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

export interface ExportResult {
  blob: Blob;
  mimeType: string;
}

export async function exportCanvasVideo(
   canvas: HTMLCanvasElement,
   audioElement: HTMLAudioElement,
   duration: number,
   onProgress?: ProgressCallback,
   renderFrame?: () => void,
   startAudioPlayback?: () => void,
   stopAudioPlayback?: () => void,
   includeAudio: boolean = true
): Promise<ExportResult> {
   return new Promise((resolve, reject) => {
     onProgress?.({
       phase: 'preparing',
       progress: 0,
       message: 'Preparing export...'
     });

     // Detect mobile device for framerate optimization
     const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
     const captureFramerate = isMobile ? 15 : 30; // 15fps for mobile (lower encoding load), 30fps for desktop
     console.log('[VideoExport] Device type:', isMobile ? 'Mobile' : 'Desktop', `- using ${captureFramerate}fps`);
     
     // Get canvas stream at adaptive framerate
     let canvasStream: MediaStream;
     try {
       canvasStream = canvas.captureStream(captureFramerate);
     } catch (err) {
       console.error('[VideoExport] captureStream failed:', err);
       reject(new Error(`Failed to capture canvas: ${err}`));
       return;
     }

     // Verify the stream has valid video tracks
     if (!canvasStream || canvasStream.getVideoTracks().length === 0) {
       reject(new Error('Canvas stream has no video tracks'));
       return;
     }
     
     const videoTracks = canvasStream.getVideoTracks();
     console.log('[VideoExport] Canvas stream created:', {
       videoTracks: videoTracks.length,
       trackState: videoTracks[0]?.readyState,
       trackEnabled: videoTracks[0]?.enabled
     });
     
     // Ensure video track is enabled
     if (videoTracks[0] && !videoTracks[0].enabled) {
       videoTracks[0].enabled = true;
       console.log('[VideoExport] Enabled disabled video track');
     }
    
    // Capture audio stream directly from the audio element (if enabled)
    // This avoids conflicts with existing AudioContext connections
    if (includeAudio) {
      try {
        const audioStream = (audioElement as HTMLMediaElement & { captureStream(): MediaStream }).captureStream();
        const audioTracks = audioStream.getAudioTracks();
        console.log('[VideoExport] Audio stream tracks:', audioTracks.length);
        
        if (audioTracks.length > 0) {
          const audioTrack = audioTracks[0];
          console.log('[VideoExport] Audio track state:', { 
            readyState: audioTrack.readyState,
            enabled: audioTrack.enabled 
          });
          
          // Only add track if it's in a valid state
          if (audioTrack.readyState === 'live') {
            canvasStream.addTrack(audioTrack);
            console.log('[VideoExport] Audio track added successfully');
          } else {
            console.warn('[VideoExport] Audio track not live, skipping audio');
          }
        } else {
          console.warn('[VideoExport] No audio tracks in audio stream');
        }
      } catch (err) {
        console.warn('[VideoExport] Could not capture audio, exporting video only:', err);
      }
    } else {
      console.log('[VideoExport] Audio disabled for this export (test mode)');
    }
    
    // Log canvas stream tracks for debugging
    console.log('[VideoExport] Final canvas stream:', {
      videoTracks: canvasStream.getVideoTracks().length,
      audioTracks: canvasStream.getAudioTracks().length
    });

    // Determine best supported codec
    // Priority: H.264/MP4 (best sharing compatibility), then WebM
    // Note: H.264 may fail at encoding time if bitrate is unsupported, so we'll try WebM fallback
    const h264Types = [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4'
    ];
    
    const webmTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    
    let mimeType = '';
    
    // Try H.264 first
    for (const type of h264Types) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        console.log('[VideoExport] Selected mime type (H.264):', mimeType);
        break;
      }
    }
    
    // If H.264 not supported, try WebM
    if (!mimeType) {
      for (const type of webmTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log('[VideoExport] H.264 not supported, falling back to WebM:', mimeType);
          break;
        }
      }
    }
    
    if (!mimeType) {
      reject(new Error('No supported video format found on this device'));
      return;
    }

    const isH264 = mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1');
    console.log(`[VideoExport] Using codec: ${mimeType} (${isH264 ? 'H.264/MP4' : 'WebM'})`)

    const chunks: Blob[] = [];
    
    let mediaRecorder: MediaRecorder;
    const recorderConfig: any = { mimeType };
    
    // Only set bitrate for H.264 (WebM doesn't use videoBitsPerSecond the same way)
    if (isH264) {
      if (isMobile) {
        // Mobile: use very low bitrate to prevent encoder errors
        recorderConfig.videoBitsPerSecond = 500000; // 500 kbps - conservative for mobile H.264
        console.log('[VideoExport] Mobile H.264: using 500kbps bitrate');
      } else {
        // Desktop: use high bitrate for better quality
        recorderConfig.videoBitsPerSecond = 3500000; // 3.5 Mbps
        console.log('[VideoExport] Desktop H.264: using 3.5Mbps bitrate');
      }
    }
    
    try {
      mediaRecorder = new MediaRecorder(canvasStream, recorderConfig);
      console.log('[VideoExport] MediaRecorder created with config:', recorderConfig);
    } catch (err) {
      console.error('[VideoExport] Failed to create MediaRecorder:', err);
      reject(new Error(`Failed to create recorder: ${err}`));
      return;
    }
    
    console.log('[VideoExport] MediaRecorder state:', mediaRecorder.state);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        console.log(`[VideoExport] Data available, chunk size: ${e.data.size}, total chunks: ${chunks.length}`);
      }
    };

    let hasResolved = false;
    let renderAnimationId: number | null = null;

    function finalizeRecording() {
      if (hasResolved) return;
      hasResolved = true;
      
      console.log('[VideoExport] Finalizing, chunks:', chunks.length);
      
      onProgress?.({
        phase: 'processing',
        progress: 0.95,
        message: 'Finalizing video...'
      });

      const blob = new Blob(chunks, { type: mimeType });
      console.log('[VideoExport] Blob created, size:', blob.size);
      
      onProgress?.({
        phase: 'complete',
        progress: 1,
        message: 'Complete!'
      });

      resolve({ blob, mimeType });
    }

    mediaRecorder.onstop = () => {
      console.log('[VideoExport] onstop fired');
      finalizeRecording();
    };

    mediaRecorder.onerror = (e) => {
      const errorDetail = {
        type: e.type,
        message: (e as any).message || 'Unknown',
        error: e.error?.name || (e.error ? String(e.error) : 'No error object')
      };
      console.error('[VideoExport] MediaRecorder error:', errorDetail);
      
      // If it's an encoding error, we need to stop and reject
      if (errorDetail.error?.includes('EncodingError') || errorDetail.message?.includes('encoder')) {
        console.error('[VideoExport] Encoder configuration not supported - falling back to WebM not possible mid-recording');
      }
      
      reject(new Error(`Recording failed: ${errorDetail.message || e}`));
    };

    // Ensure canvas is rendered at least once before recording starts
    if (renderFrame) {
      console.log('[VideoExport] Rendering initial frame');
      renderFrame();
    }

    // Small delay to ensure tracks are settled (critical for mobile)
    setTimeout(() => {
      // Start recording
      try {
        mediaRecorder.start(100); // Collect data every 100ms
        console.log('[VideoExport] MediaRecorder started, state:', mediaRecorder.state);
      } catch (err) {
        console.error('[VideoExport] Error starting recorder:', err);
        reject(new Error(`Failed to start recorder: ${err}`));
        return;
      }
    
      onProgress?.({
        phase: 'recording',
        progress: 0,
        message: 'Recording video...'
      });

      // Start internal rendering loop - this ensures continuous frame delivery to captureStream
      if (renderFrame) {
        const startRenderTime = Date.now();
        function renderLoop() {
          const elapsed = (Date.now() - startRenderTime) / 1000;
          if (elapsed < duration && renderFrame) {
            renderFrame();
            renderAnimationId = requestAnimationFrame(renderLoop);
          }
        }
        renderAnimationId = requestAnimationFrame(renderLoop);
        console.log('[VideoExport] Render loop started');
      }

      // Start audio playback
      startAudioPlayback?.();

      // Track progress during recording
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 0.9);
        
        onProgress?.({
          phase: 'recording',
          progress,
          message: `Recording: ${Math.round(elapsed)}s / ${Math.round(duration)}s`
        });
      }, 200);

      // Stop recording when duration is reached
      setTimeout(() => {
        console.log('[VideoExport] Duration reached, stopping recorder');
        clearInterval(progressInterval);
        
        // Stop rendering loop
        if (renderAnimationId !== null) {
          cancelAnimationFrame(renderAnimationId);
          console.log('[VideoExport] Render loop stopped');
        }
        
        // Stop audio playback
        stopAudioPlayback?.();
        
        try {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        } catch (err) {
          console.error('[VideoExport] Error stopping recorder:', err);
        }
        
        // Stop all tracks
        canvasStream.getTracks().forEach(track => track.stop());
        
        // Fallback: if onstop doesn't fire within 2 seconds, finalize anyway
        setTimeout(() => {
          if (!hasResolved && chunks.length > 0) {
            console.warn('[VideoExport] onstop did not fire, using fallback');
            finalizeRecording();
          }
        }, 2000);
      }, duration * 1000 + 500); // Add 500ms buffer
    }, 50); // 50ms delay for track settlement
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1')) {
    return 'mp4';
  }
  return 'webm';
}

export function generateFilename(mimeType: string = 'video/webm'): string {
  const extension = getExtensionFromMimeType(mimeType);
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `audioflam-audiogram-${day}${month}${year}-${hours}${minutes}.${extension}`;
}
