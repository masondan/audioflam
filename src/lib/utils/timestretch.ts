/**
 * Pitch-preserving time stretch using SoundTouchJS
 * Changes audio speed without affecting pitch (no chipmunk effect)
 */
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouchjs';

/**
 * Convert AudioBuffer to WAV Blob for download
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
	const numChannels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const format = 1; // PCM
	const bitDepth = 16;

	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;
	const byteRate = sampleRate * blockAlign;
	const dataLength = buffer.length * blockAlign;
	const headerLength = 44;
	const totalLength = headerLength + dataLength;

	const arrayBuffer = new ArrayBuffer(totalLength);
	const view = new DataView(arrayBuffer);

	// WAV header
	writeString(view, 0, 'RIFF');
	view.setUint32(4, totalLength - 8, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, format, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(view, 36, 'data');
	view.setUint32(40, dataLength, true);

	// Interleave channels and write samples
	const channels: Float32Array[] = [];
	for (let i = 0; i < numChannels; i++) {
		channels.push(buffer.getChannelData(i));
	}

	let offset = headerLength;
	for (let i = 0; i < buffer.length; i++) {
		for (let ch = 0; ch < numChannels; ch++) {
			const sample = Math.max(-1, Math.min(1, channels[ch][i]));
			const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
			view.setInt16(offset, intSample, true);
			offset += 2;
		}
	}

	return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}

/**
 * Time-stretch an AudioBuffer while preserving pitch
 * @param buffer - Source AudioBuffer
 * @param tempo - Speed multiplier (1.0 = normal, 1.15 = 15% faster, etc.)
 * @returns New AudioBuffer with adjusted tempo
 */
export async function timeStretch(buffer: AudioBuffer, tempo: number): Promise<AudioBuffer> {
	if (tempo === 1.0) {
		return buffer;
	}

	// Create SoundTouch source from the AudioBuffer
	const source = new WebAudioBufferSource(buffer);
	
	// Create SoundTouch processor
	const soundtouch = new SoundTouch();
	soundtouch.tempo = tempo;
	
	// Create filter to process the audio
	const filter = new SimpleFilter(source, soundtouch);
	
	// Calculate expected output length
	const expectedLength = Math.ceil(buffer.length / tempo);
	
	// Process in chunks and collect all samples
	const CHUNK_SIZE = 8192;
	const outputSamples: Float32Array[] = [];
	let totalFrames = 0;
	
	while (true) {
		const samples = new Float32Array(CHUNK_SIZE * 2); // Stereo interleaved
		const framesExtracted = filter.extract(samples, CHUNK_SIZE);
		
		if (framesExtracted === 0) {
			break;
		}
		
		// Store only the extracted portion
		outputSamples.push(samples.slice(0, framesExtracted * 2));
		totalFrames += framesExtracted;
		
		// Safety check to prevent infinite loops
		if (totalFrames > expectedLength * 1.5) {
			console.warn('TimeStretch: exceeded expected length, breaking');
			break;
		}
	}
	
	// Create new AudioBuffer with processed audio
	const audioContext = new OfflineAudioContext(
		buffer.numberOfChannels,
		totalFrames,
		buffer.sampleRate
	);
	
	const outputBuffer = audioContext.createBuffer(
		buffer.numberOfChannels,
		totalFrames,
		buffer.sampleRate
	);
	
	// Deinterleave stereo samples into separate channels
	const leftChannel = outputBuffer.getChannelData(0);
	const rightChannel = buffer.numberOfChannels > 1 ? outputBuffer.getChannelData(1) : null;
	
	let frameOffset = 0;
	for (const chunk of outputSamples) {
		for (let i = 0; i < chunk.length; i += 2) {
			const frameIndex = frameOffset + i / 2;
			if (frameIndex < totalFrames) {
				leftChannel[frameIndex] = chunk[i];
				if (rightChannel) {
					rightChannel[frameIndex] = chunk[i + 1];
				}
			}
		}
		frameOffset += chunk.length / 2;
	}
	
	// If mono, we processed as stereo internally but output is mono
	// The left channel already has the data we need
	
	return outputBuffer;
}
