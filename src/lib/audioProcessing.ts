/**
 * Client-side audio processing using Web Audio API
 * Handles silence detection and removal on actual PCM samples
 */


export type SilenceLevel = 'default' | 'trim' | 'tight';

interface SilenceConfig {
	amplitudeThreshold: number;  // 0-1, samples below this are "silent"
	minSilenceDuration: number;  // seconds of silence before processing
	keepDuration: number;        // seconds to keep at silence boundaries
	compressionRatio: number;    // how much to compress remaining silence
}

const SILENCE_CONFIG: Record<SilenceLevel, SilenceConfig> = {
	default: {
		amplitudeThreshold: 0,
		minSilenceDuration: 10,
		keepDuration: 1,
		compressionRatio: 1.0
	},
	trim: {
		amplitudeThreshold: 0.02,    // -34dB
		minSilenceDuration: 0.4,     // 400ms minimum silence
		keepDuration: 0.15,          // keep 150ms at boundaries
		compressionRatio: 0.5
	},
	tight: {
		amplitudeThreshold: 0.03,    // -30dB
		minSilenceDuration: 0.25,    // 250ms minimum silence
		keepDuration: 0.08,          // keep 80ms at boundaries
		compressionRatio: 0.3
	}
};

interface SilenceSegment {
	startSample: number;
	endSample: number;
}

/**
 * Decode base64 audio to AudioBuffer
 */
async function decodeAudio(base64Audio: string): Promise<AudioBuffer> {
	const binaryString = atob(base64Audio);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	
	const audioContext = new AudioContext();
	try {
		const audioBuffer = await audioContext.decodeAudioData(bytes.buffer);
		return audioBuffer;
	} finally {
		await audioContext.close();
	}
}

/**
 * Detect silent segments in audio buffer
 */
function detectSilentSegments(
	audioBuffer: AudioBuffer,
	config: SilenceConfig
): SilenceSegment[] {
	const sampleRate = audioBuffer.sampleRate;
	const channelData = audioBuffer.getChannelData(0); // Use first channel
	
	const minSilenceSamples = Math.floor(config.minSilenceDuration * sampleRate);
	const segments: SilenceSegment[] = [];
	
	let silenceStart: number | null = null;
	
	// Use a window to smooth detection (avoid choppy cuts)
	const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
	
	for (let i = 0; i < channelData.length; i += windowSize) {
		// Calculate RMS amplitude for this window
		let sumSquares = 0;
		const windowEnd = Math.min(i + windowSize, channelData.length);
		for (let j = i; j < windowEnd; j++) {
			sumSquares += channelData[j] * channelData[j];
		}
		const rms = Math.sqrt(sumSquares / (windowEnd - i));
		
		const isSilent = rms < config.amplitudeThreshold;
		
		if (isSilent) {
			if (silenceStart === null) {
				silenceStart = i;
			}
		} else {
			if (silenceStart !== null) {
				const silenceLength = i - silenceStart;
				if (silenceLength >= minSilenceSamples) {
					segments.push({
						startSample: silenceStart,
						endSample: i
					});
				}
				silenceStart = null;
			}
		}
	}
	
	// Handle trailing silence
	if (silenceStart !== null) {
		const silenceLength = channelData.length - silenceStart;
		if (silenceLength >= minSilenceSamples) {
			segments.push({
				startSample: silenceStart,
				endSample: channelData.length
			});
		}
	}
	
	return segments;
}

/**
 * Build new audio buffer with silence compressed
 */
function buildProcessedBuffer(
	audioBuffer: AudioBuffer,
	segments: SilenceSegment[],
	config: SilenceConfig
): AudioBuffer {
	if (segments.length === 0) {
		return audioBuffer;
	}
	
	const sampleRate = audioBuffer.sampleRate;
	const numChannels = audioBuffer.numberOfChannels;
	const keepSamples = Math.floor(config.keepDuration * sampleRate);
	
	// Calculate new length
	let removedSamples = 0;
	for (const seg of segments) {
		const segmentLength = seg.endSample - seg.startSample;
		const keepAtStart = Math.min(keepSamples, Math.floor(segmentLength / 2));
		const keepAtEnd = Math.min(keepSamples, Math.floor(segmentLength / 2));
		const middleLength = segmentLength - keepAtStart - keepAtEnd;
		const compressedMiddle = Math.floor(middleLength * config.compressionRatio);
		removedSamples += middleLength - compressedMiddle;
	}
	
	const newLength = audioBuffer.length - removedSamples;
	const audioContext = new OfflineAudioContext(numChannels, newLength, sampleRate);
	const newBuffer = audioContext.createBuffer(numChannels, newLength, sampleRate);
	
	// Process each channel
	for (let channel = 0; channel < numChannels; channel++) {
		const inputData = audioBuffer.getChannelData(channel);
		const outputData = newBuffer.getChannelData(channel);
		
		let inputPos = 0;
		let outputPos = 0;
		
		for (const seg of segments) {
			// Copy audio before this segment
			while (inputPos < seg.startSample && outputPos < newLength) {
				outputData[outputPos++] = inputData[inputPos++];
			}
			
			const segmentLength = seg.endSample - seg.startSample;
			const keepAtStart = Math.min(keepSamples, Math.floor(segmentLength / 2));
			const keepAtEnd = Math.min(keepSamples, Math.floor(segmentLength / 2));
			
			// Copy samples at start of silence
			for (let i = 0; i < keepAtStart && outputPos < newLength; i++) {
				outputData[outputPos++] = inputData[inputPos++];
			}
			
			// Compress middle section
			const middleStart = seg.startSample + keepAtStart;
			const middleEnd = seg.endSample - keepAtEnd;
			const middleLength = middleEnd - middleStart;
			const compressedLength = Math.floor(middleLength * config.compressionRatio);
			
			if (compressedLength > 0 && middleLength > 0) {
				const step = middleLength / compressedLength;
				for (let i = 0; i < compressedLength && outputPos < newLength; i++) {
					const srcIndex = middleStart + Math.floor(i * step);
					outputData[outputPos++] = inputData[srcIndex];
				}
			}
			
			inputPos = middleEnd;
			
			// Copy samples at end of silence
			for (let i = 0; i < keepAtEnd && outputPos < newLength; i++) {
				outputData[outputPos++] = inputData[inputPos++];
			}
		}
		
		// Copy remaining audio after last segment
		while (inputPos < inputData.length && outputPos < newLength) {
			outputData[outputPos++] = inputData[inputPos++];
		}
	}
	
	return newBuffer;
}

/**
 * Convert AudioBuffer to WAV blob (for playback)
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChannels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const format = 1; // PCM
	const bitDepth = 16;
	
	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataSize = buffer.length * blockAlign;
	const headerSize = 44;
	const totalSize = headerSize + dataSize;
	
	const arrayBuffer = new ArrayBuffer(totalSize);
	const view = new DataView(arrayBuffer);
	
	// WAV header
	const writeString = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};
	
	writeString(0, 'RIFF');
	view.setUint32(4, totalSize - 8, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, format, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(36, 'data');
	view.setUint32(40, dataSize, true);
	
	// Interleave channels and write samples
	let offset = 44;
	const channels: Float32Array[] = [];
	for (let i = 0; i < numChannels; i++) {
		channels.push(buffer.getChannelData(i));
	}
	
	for (let i = 0; i < buffer.length; i++) {
		for (let ch = 0; ch < numChannels; ch++) {
			const sample = Math.max(-1, Math.min(1, channels[ch][i]));
			const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
			view.setInt16(offset, intSample, true);
			offset += 2;
		}
	}
	
	return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export interface ProcessingResult {
	blob: Blob;
	originalDuration: number;
	processedDuration: number;
	silenceRemoved: number;
}

/**
 * Concatenate multiple base64-encoded audio segments into a single audio file
 * Uses Web Audio API to decode, concatenates PCM, outputs as WAV
 * WAV format ensures correct duration metadata (unlike naive MP3 concatenation)
 */
export async function concatenateAudioSegments(base64Audios: string[]): Promise<Blob> {
	if (base64Audios.length === 0) {
		throw new Error('No audio segments provided');
	}

	if (base64Audios.length === 1) {
		// Single segment - just convert to blob
		const binaryString = atob(base64Audios[0]);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return new Blob([bytes], { type: 'audio/mp3' });
	}

	// Decode all segments to AudioBuffers
	const audioBuffers: AudioBuffer[] = [];
	for (const base64 of base64Audios) {
		const buffer = await decodeAudio(base64);
		audioBuffers.push(buffer);
	}

	// Use the sample rate from the first buffer (should all be the same)
	const sampleRate = audioBuffers[0].sampleRate;

	// Calculate total length
	const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);

	// Create a new AudioBuffer to hold concatenated audio (mono)
	const audioContext = new OfflineAudioContext(1, totalLength, sampleRate);
	const concatenatedBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
	const outputData = concatenatedBuffer.getChannelData(0);
	
	let offset = 0;
	for (const buffer of audioBuffers) {
		// Get first channel (mono) or mix down stereo
		const channelData = buffer.numberOfChannels > 1
			? mixToMono(buffer)
			: buffer.getChannelData(0);
		
		outputData.set(channelData, offset);
		offset += buffer.length;
	}

	// Convert to WAV - this guarantees correct duration metadata
	return audioBufferToWav(concatenatedBuffer);
}

/**
 * Mix stereo AudioBuffer to mono Float32Array
 */
function mixToMono(buffer: AudioBuffer): Float32Array {
	const left = buffer.getChannelData(0);
	const right = buffer.getChannelData(1);
	const mono = new Float32Array(buffer.length);
	
	for (let i = 0; i < buffer.length; i++) {
		mono[i] = (left[i] + right[i]) / 2;
	}
	
	return mono;
}

/**
 * Main function: process audio and remove silence
 */
export async function removeSilence(
	base64Audio: string,
	level: SilenceLevel
): Promise<ProcessingResult> {
	// If default level, just convert to blob without processing
	if (level === 'default') {
		const binaryString = atob(base64Audio);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: 'audio/mp3' });
		
		return {
			blob,
			originalDuration: 0,
			processedDuration: 0,
			silenceRemoved: 0
		};
	}
	
	const config = SILENCE_CONFIG[level];
	
	// Decode audio
	const audioBuffer = await decodeAudio(base64Audio);
	const originalDuration = audioBuffer.duration;
	
	// Detect silent segments
	const segments = detectSilentSegments(audioBuffer, config);
	
	// Build processed buffer
	const processedBuffer = buildProcessedBuffer(audioBuffer, segments, config);
	const processedDuration = processedBuffer.duration;
	
	// Convert to WAV for playback
	const blob = audioBufferToWav(processedBuffer);
	
	return {
		blob,
		originalDuration,
		processedDuration,
		silenceRemoved: originalDuration - processedDuration
	};
}
