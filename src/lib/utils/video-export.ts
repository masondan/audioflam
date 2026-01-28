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
  startPlayback?: () => void,
  stopPlayback?: () => void
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    onProgress?.({
      phase: 'preparing',
      progress: 0,
      message: 'Preparing export...'
    });

    // Get canvas stream at 30fps
    const canvasStream = canvas.captureStream(30);
    
    // Create audio context to capture audio
    let audioContext: AudioContext | null = null;
    let audioSource: MediaElementAudioSourceNode | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    
    try {
      audioContext = new AudioContext();
      audioSource = audioContext.createMediaElementSource(audioElement);
      audioDestination = audioContext.createMediaStreamDestination();
      
      // Connect audio to both destination (for recording) and speakers
      audioSource.connect(audioDestination);
      audioSource.connect(audioContext.destination);
      
      // Add audio track to canvas stream
      const audioTrack = audioDestination.stream.getAudioTracks()[0];
      if (audioTrack) {
        canvasStream.addTrack(audioTrack);
      }
    } catch (err) {
      console.warn('Could not capture audio, exporting video only:', err);
    }

    // Determine best supported codec - prioritize H.264/MP4 for Chrome/Safari
    const mimeTypes = [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    
    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }
    
    if (!mimeType) {
      reject(new Error('No supported video format found'));
      return;
    }

    const isH264 = mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1');
    console.log(`[VideoExport] Using codec: ${mimeType} (${isH264 ? 'H.264/MP4' : 'WebM'})`)

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 3500000 // 3.5 Mbps for 720p H.264
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      onProgress?.({
        phase: 'processing',
        progress: 0.95,
        message: 'Finalizing video...'
      });

      // Cleanup audio context
      if (audioSource) {
        audioSource.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }

      const blob = new Blob(chunks, { type: mimeType });
      
      onProgress?.({
        phase: 'complete',
        progress: 1,
        message: 'Complete!'
      });

      resolve({ blob, mimeType });
    };

    mediaRecorder.onerror = (e) => {
      reject(new Error(`Recording failed: ${e}`));
    };

    // Start recording
    mediaRecorder.start(100); // Collect data every 100ms
    
    onProgress?.({
      phase: 'recording',
      progress: 0,
      message: 'Recording video...'
    });

    // Start audio/animation playback
    startPlayback?.();

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
      clearInterval(progressInterval);
      stopPlayback?.();
      mediaRecorder.stop();
      
      // Stop all tracks
      canvasStream.getTracks().forEach(track => track.stop());
    }, duration * 1000 + 500); // Add 500ms buffer
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
