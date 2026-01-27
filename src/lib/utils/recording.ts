export interface RecordingState {
  isRecording: boolean;
  countdown: number | null;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  analyser: AnalyserNode | null;
  audioContext: AudioContext | null;
}

export async function requestMicrophonePermission(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    return stream;
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Microphone permission denied. Please allow microphone access to record.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      }
    }
    throw new Error('Failed to access microphone.');
  }
}

export function createAudioAnalyser(stream: MediaStream): {
  audioContext: AudioContext;
  analyser: AnalyserNode;
} {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;
  
  source.connect(analyser);
  
  return { audioContext, analyser };
}

export function getFrequencyData(analyser: AnalyserNode): Uint8Array {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  return dataArray;
}

export function createMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';
  
  return new MediaRecorder(stream, { mimeType });
}

export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();
  return audioBuffer;
}

export function stopStream(stream: MediaStream | null): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

export function drawLiveWaveform(
  canvas: HTMLCanvasElement,
  frequencyData: Uint8Array,
  scrollOffset: number,
  color: string = '#777777'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const barWidth = 3;
  const barGap = 2;
  const totalBarWidth = barWidth + barGap;
  const centerY = height / 2;
  const maxBarHeight = (height / 2) - 2;

  const visibleBars = Math.floor(width / totalBarWidth);
  const halfVisibleBars = Math.floor(visibleBars / 2);
  
  const startX = Math.max(0, halfVisibleBars - scrollOffset) * totalBarWidth;

  const numBars = Math.min(frequencyData.length, scrollOffset + 1);
  
  ctx.fillStyle = color;
  
  for (let i = 0; i < numBars; i++) {
    const displayIndex = halfVisibleBars - (scrollOffset - i);
    if (displayIndex < 0) continue;
    if (displayIndex >= visibleBars) break;
    
    const x = displayIndex * totalBarWidth + barGap / 2;
    const amplitude = frequencyData[i] / 255;
    const barHeight = Math.max(2, amplitude * maxBarHeight);
    
    ctx.beginPath();
    roundedRect(ctx, x, centerY - barHeight, barWidth, barHeight, 1.5);
    ctx.fill();
    
    ctx.beginPath();
    roundedRect(ctx, x, centerY, barWidth, barHeight, 1.5);
    ctx.fill();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  radius = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}
