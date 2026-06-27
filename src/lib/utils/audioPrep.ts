import { AudioContext, OfflineAudioContext } from 'standardized-audio-context';

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE = 24000; // Target sample rate for Qwen
const APPEND_SILENCE_SECONDS = 0.5; // Seconds of silence to append
const MAX_AUDIO_DURATION_SECONDS = 20; // Max duration for cloning
const MIN_AUDIO_DURATION_SECONDS = 10; // Min duration for cloning

// RMS Loudness Thresholds (tuned for typical microphone input)
const RMS_TOO_QUIET_THRESHOLD = 0.005; // Below this is considered too quiet
const RMS_VOICE_THRESHOLD = 0.02;    // Above this is good voice activity

// Clipping detection
const CLIPPING_THRESHOLD = 0.99; // Samples at or above this are considered clipped
const CLIPPING_RUN_LENGTH = 10;  // Number of consecutive clipped samples to trigger warning

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AudioPrepResult {
  blob: Blob;
  warnings: string[];
}

// ── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Encodes an AudioBuffer as a WAV file (PCM 16-bit, mono).
 * @param buffer - The AudioBuffer to encode. Must be mono.
 * @returns A Blob with type 'audio/wav'.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  if (buffer.numberOfChannels !== 1) {
    throw new Error('audioBufferToWav only supports mono audio buffers.');
  }

  const numSamples = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataLength = numSamples * buffer.numberOfChannels * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM chunk size
  view.setUint16(20, 1, true);            // PCM format (1 for PCM)
  view.setUint16(22, 1, true);            // Number of channels (mono)
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 1 * bytesPerSample, true); // Byte rate
  view.setUint16(32, 1 * bytesPerSample, true); // Block align
  view.setUint16(34, 16, true);           // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Calculates the Root Mean Square (RMS) loudness of an AudioBuffer.
 * @param buffer - The AudioBuffer to analyze.
 * @returns The RMS value.
 */
function calculateRMS(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels === 0) return 0;
  const channelData = buffer.getChannelData(0); // Only use first channel for mono
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i];
  }
  return Math.sqrt(sum / channelData.length);
}

/**
 * Detects sustained clipping in an AudioBuffer.
 * @param buffer - The AudioBuffer to analyze.
 * @returns True if sustained clipping is detected, false otherwise.
 */
function detectClipping(buffer: AudioBuffer): boolean {
  if (buffer.numberOfChannels === 0) return false;
  const channelData = buffer.getChannelData(0);
  let clippedSamples = 0;
  for (let i = 0; i < channelData.length; i++) {
    if (Math.abs(channelData[i]) >= CLIPPING_THRESHOLD) {
      clippedSamples++;
      if (clippedSamples >= CLIPPING_RUN_LENGTH) {
        return true;
      }
    } else {
      clippedSamples = 0;
    }
  }
  return false;
}

/**
 * Prepares an audio Blob for Qwen voice cloning by normalizing, resampling,
 * performing loudness/clipping checks, appending silence, and re-encoding to WAV.
 * @param audioBlob - The input audio Blob (any format decodable by AudioContext).
 * @returns A Promise resolving to an AudioPrepResult containing the processed Blob and any warnings.
 * @throws {Error} if critical issues like duration or decoding failure occur.
 */
export async function prepareAudioForCloning(audioBlob: Blob): Promise<AudioPrepResult> {
  const warnings: string[] = [];
  let audioBuffer: AudioBuffer;

  // 1. Decode audio
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext(); // Use standard AudioContext for initial decode
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
  } catch (error) {
    throw new Error(`Failed to decode audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // 2. Resample to target SAMPLE_RATE and downmix to mono if necessary
  // Use OfflineAudioContext for consistent processing
  const offlineCtx = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioBuffer.duration * SAMPLE_RATE),
    SAMPLE_RATE
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const processedBuffer = await offlineCtx.startRendering();

  // 3. Append silence
  const silenceBuffer = offlineCtx.createBuffer(
    1,
    Math.ceil(APPEND_SILENCE_SECONDS * SAMPLE_RATE),
    SAMPLE_RATE
  );
  // Silence buffer is already all zeros by default

  const combinedLength = processedBuffer.length + silenceBuffer.length;
  const combinedBuffer = offlineCtx.createBuffer(1, combinedLength, SAMPLE_RATE);

  combinedBuffer.copyToChannel(processedBuffer.getChannelData(0), 0, 0);
  combinedBuffer.copyToChannel(silenceBuffer.getChannelData(0), 0, processedBuffer.length);

  // 4. Trim to MAX_AUDIO_DURATION_SECONDS
  let finalBuffer = combinedBuffer;
  if (finalBuffer.duration > MAX_AUDIO_DURATION_SECONDS) {
    const trimLength = Math.ceil(MAX_AUDIO_DURATION_SECONDS * SAMPLE_RATE);
    const trimmedBuffer = offlineCtx.createBuffer(1, trimLength, SAMPLE_RATE);
    trimmedBuffer.copyToChannel(finalBuffer.getChannelData(0).slice(0, trimLength), 0, 0);
    finalBuffer = trimmedBuffer;
    warnings.push('Audio trimmed');
  }

  // 5. Check duration
  if (finalBuffer.duration < MIN_AUDIO_DURATION_SECONDS) {
    throw new Error(`Audio is too short. Please record at least ${MIN_AUDIO_DURATION_SECONDS} seconds.`);
  }

  // 6. Loudness and clipping checks
  const rms = calculateRMS(finalBuffer);
  if (rms < RMS_TOO_QUIET_THRESHOLD) {
    throw new Error('Audio is too quiet. Please move closer to the microphone or speak louder.');
  }
  // Only add a warning for clipping, don't fail hard
  if (detectClipping(finalBuffer)) {
    warnings.push('Audio clipping detected. Try moving further from the microphone or speaking softer.');
  }

  // 7. Re-encode as 16-bit PCM WAV
  const wavBlob = audioBufferToWav(finalBuffer);

  return { blob: wavBlob, warnings };
}
