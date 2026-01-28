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
   stopAudioPlayback?: () => void
): Promise<ExportResult> {
   return new Promise((resolve, reject) => {
     onProgress?.({
       phase: 'preparing',
       progress: 0,
       message: 'Preparing export...'
     });

     // Get canvas stream at 30fps
     let canvasStream: MediaStream;
     try {
       canvasStream = canvas.captureStream(30);
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
    
    // Capture audio stream directly from the audio element
    // This avoids conflicts with existing AudioContext connections
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
    
    // Log canvas stream tracks for debugging
    console.log('[VideoExport] Final canvas stream:', {
      videoTracks: canvasStream.getVideoTracks().length,
      audioTracks: canvasStream.getAudioTracks().length
    });

    // Determine best supported codec - prioritize H.264/MP4 for Chrome/Safari
    // On mobile, WebM might be more reliable
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const mimeTypes = isMobile ? [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4'
    ] : [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    
    console.log('[VideoExport] Device:', isMobile ? 'Mobile' : 'Desktop');
    
    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        console.log('[VideoExport] Selected mime type:', mimeType);
        break;
      }
    }
    
    if (!mimeType) {
      console.error('[VideoExport] Supported types:', mimeTypes.filter((_, i) => i < 5).join(', '));
      reject(new Error('No supported video format found on this device'));
      return;
    }

    const isH264 = mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1');
    console.log(`[VideoExport] Using codec: ${mimeType} (${isH264 ? 'H.264/MP4' : 'WebM'})`)

    const chunks: Blob[] = [];
    
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: 3500000 // 3.5 Mbps for 720p H.264
      });
    } catch (err) {
      console.error('[VideoExport] Failed to create MediaRecorder:', err);
      reject(new Error(`Failed to create recorder: ${err}`));
      return;
    }
    
    console.log('[VideoExport] MediaRecorder created, state:', mediaRecorder.state);

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
       console.error('[VideoExport] MediaRecorder error:', {
         type: e.type,
         message: (e as any).message || 'Unknown',
         error: e.error || 'No error object'
       });
       reject(new Error(`Recording failed: ${(e as any).message || e}`));
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
