export interface WaveformData {
  peaks: number[];
  duration: number;
}

export async function extractWaveformData(
  audioBuffer: AudioBuffer,
  samples: number = 200
): Promise<WaveformData> {
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const blockSize = Math.floor(totalSamples / samples);
  const peaks: number[] = [];

  const samplesPerBlock = Math.min(100, Math.ceil(blockSize / 10));

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalSamples);
    const stride = Math.max(1, Math.floor((end - start) / samplesPerBlock));
    
    let max = 0;
    for (let j = start; j < end; j += stride) {
      const absValue = Math.abs(channelData[j]);
      if (absValue > max) max = absValue;
    }
    peaks.push(max);
  }

  return {
    peaks,
    duration: audioBuffer.duration
  };
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();
  return audioBuffer;
}

export interface DrawWaveformOptions {
  canvas: HTMLCanvasElement;
  peaks: number[];
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  color?: string;
  playheadPosition?: number;
  playheadColor?: string;
  trimStart?: number;
  trimEnd?: number;
  trimOverlayColor?: string;
  mirrored?: boolean;
}

export function drawWaveform(options: DrawWaveformOptions): void {
  const {
    canvas,
    peaks,
    barWidth = 3,
    barGap = 2,
    barRadius = 1.5,
    color = '#777777',
    playheadPosition,
    playheadColor = '#5422b0',
    trimStart = 0,
    trimEnd = 1,
    trimOverlayColor = 'rgba(200, 200, 200, 0.5)',
    mirrored = true
  } = options;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const totalBarWidth = barWidth + barGap;
  const barsCount = Math.floor(width / totalBarWidth);
  const centerY = height / 2;
  const maxBarHeight = mirrored ? (height / 2) - 2 : height - 4;

  const resampledPeaks = resamplePeaks(peaks, barsCount);

  for (let i = 0; i < resampledPeaks.length; i++) {
    const peak = resampledPeaks[i];
    const x = i * totalBarWidth + barGap / 2;
    const barHeight = Math.max(2, peak * maxBarHeight);

    ctx.fillStyle = color;
    ctx.beginPath();
    
    if (mirrored) {
      roundedRect(ctx, x, centerY - barHeight, barWidth, barHeight, barRadius);
      ctx.fill();
      ctx.beginPath();
      roundedRect(ctx, x, centerY, barWidth, barHeight, barRadius);
      ctx.fill();
    } else {
      roundedRect(ctx, x, height - barHeight - 2, barWidth, barHeight, barRadius);
      ctx.fill();
    }
  }

  if (trimStart > 0) {
    ctx.fillStyle = trimOverlayColor;
    ctx.fillRect(0, 0, width * trimStart, height);
  }
  if (trimEnd < 1) {
    ctx.fillStyle = trimOverlayColor;
    ctx.fillRect(width * trimEnd, 0, width * (1 - trimEnd), height);
  }

  if (playheadPosition !== undefined && playheadPosition >= 0 && playheadPosition <= 1) {
    const playheadX = width * playheadPosition;
    ctx.strokeStyle = playheadColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }
}

function resamplePeaks(peaks: number[], targetCount: number): number[] {
  if (peaks.length === targetCount) return peaks;
  
  const result: number[] = [];
  const ratio = peaks.length / targetCount;
  
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let max = 0;
    for (let j = start; j < end; j++) {
      if (peaks[j] > max) max = peaks[j];
    }
    result.push(max);
  }
  
  return result;
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
