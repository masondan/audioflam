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

/**
 * Pre-compute frequency data frames for export rendering.
 * Performs FFT on windowed chunks of the AudioBuffer at each frame interval,
 * producing the same type of data as AnalyserNode.getByteFrequencyData().
 */
export function precomputeFrequencyFrames(
  audioBuffer: AudioBuffer,
  fps: number = 24,
  fftSize: number = 256,
  smoothingTimeConstant: number = 0.3
): Uint8Array[] {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const totalFrames = Math.ceil(audioBuffer.duration * fps);
  const frequencyBinCount = fftSize / 2;
  const frames: Uint8Array[] = [];

  let previousMagnitudes = new Float32Array(frequencyBinCount);
  const win = blackmanWindow(fftSize);

  const minDecibels = -100;
  const maxDecibels = -30;
  const rangeScalar = 255 / (maxDecibels - minDecibels);

  for (let frame = 0; frame < totalFrames; frame++) {
    const time = frame / fps;
    const centerSample = Math.floor(time * sampleRate);

    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const halfFFT = fftSize / 2;

    for (let i = 0; i < fftSize; i++) {
      const sampleIdx = centerSample - halfFFT + i;
      const sample = (sampleIdx >= 0 && sampleIdx < channelData.length)
        ? channelData[sampleIdx]
        : 0;
      real[i] = sample * win[i];
      imag[i] = 0;
    }

    fftInPlace(real, imag);

    const byteData = new Uint8Array(frequencyBinCount);

    for (let i = 0; i < frequencyBinCount; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / fftSize;
      const smoothed = smoothingTimeConstant * previousMagnitudes[i] +
                       (1 - smoothingTimeConstant) * magnitude;
      previousMagnitudes[i] = smoothed;

      let dB = 20 * Math.log10(smoothed || 1e-20);
      dB = Math.max(minDecibels, Math.min(maxDecibels, dB));
      byteData[i] = Math.round((dB - minDecibels) * rangeScalar);
    }

    frames.push(byteData);
  }

  return frames;
}

function blackmanWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (2 * Math.PI * i) / (size - 1);
    win[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  return win;
}

function fftInPlace(real: Float32Array, imag: Float32Array): void {
  const n = real.length;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1, curImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const vReal = real[i + j + halfLen] * curReal - imag[i + j + halfLen] * curImag;
        const vImag = real[i + j + halfLen] * curImag + imag[i + j + halfLen] * curReal;

        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[i + j + halfLen] = uReal - vReal;
        imag[i + j + halfLen] = uImag - vImag;

        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
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
