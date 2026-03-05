/**
 * Web Worker for Whisper transcription.
 * Runs model loading and inference off the main thread to prevent UI freezes.
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let cachedPipeline: any = null;
let cachedModelKey = '';

interface LoadMessage {
	type: 'load';
	modelName: string;
	quantized: boolean;
}

interface TranscribeMessage {
	type: 'transcribe';
	audioData: Float32Array;
	language: string;
}

interface ReleaseMessage {
	type: 'release';
}

type WorkerMessage = LoadMessage | TranscribeMessage | ReleaseMessage;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const msg = e.data;

	switch (msg.type) {
		case 'load':
			await handleLoad(msg);
			break;
		case 'transcribe':
			await handleTranscribe(msg);
			break;
		case 'release':
			await handleRelease();
			break;
	}
};

async function handleLoad(msg: LoadMessage) {
	const modelKey = `${msg.modelName}:${msg.quantized}`;

	if (cachedPipeline && cachedModelKey === modelKey) {
		self.postMessage({ type: 'loaded' });
		return;
	}

	// Release previous
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}

	self.postMessage({ type: 'progress', stage: 'downloading' });

	try {
		const pipe = await pipeline('automatic-speech-recognition', msg.modelName, {
			dtype: msg.quantized ? 'q8' : 'fp32',
		});

		cachedPipeline = pipe;
		cachedModelKey = modelKey;
		self.postMessage({ type: 'loaded' });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Failed to load model',
		});
	}
}

async function handleTranscribe(msg: TranscribeMessage) {
	if (!cachedPipeline) {
		self.postMessage({ type: 'error', error: 'Model not loaded' });
		return;
	}

	try {
		const transcriptionOptions: any = {
			return_timestamps: true,
			chunk_length_s: 30,
			stride_length_s: 5,
		};

		if (msg.language !== 'auto' && msg.language !== 'en') {
			transcriptionOptions.language = msg.language;
		}

		const result = await cachedPipeline(msg.audioData, transcriptionOptions);

		// Extract segments
		interface Chunk {
			text?: string;
			timestamp?: [number, number];
		}

		const segments: Array<{ text: string; start: number; end: number }> = [];

		if (result.chunks && Array.isArray(result.chunks)) {
			for (const chunk of result.chunks as Chunk[]) {
				const segText = (chunk.text || '').trim();
				if (segText) {
					segments.push({
						text: segText,
						start: chunk.timestamp?.[0] ?? 0,
						end: chunk.timestamp?.[1] ?? 0,
					});
				}
			}
		} else {
			const text = (result.text || '').trim();
			segments.push({ text, start: 0, end: 0 });
		}

		self.postMessage({ type: 'result', segments });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Transcription failed',
		});
	}
}

async function handleRelease() {
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}
	self.postMessage({ type: 'released' });
}
