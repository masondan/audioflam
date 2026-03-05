import { pipeline, env } from '@huggingface/transformers';

// Disable local model check (always fetch from HuggingFace CDN)
env.allowLocalModels = false;

export interface TranscriptionOptions {
	multilingualEnabled: boolean;
	quantized: boolean;
	language: string; // 'auto' or ISO 639-1 code
}

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
}

/**
 * Determine which Whisper model to use based on settings.
 */
function getModelName(multilingualEnabled: boolean): string {
	return multilingualEnabled
		? 'onnx-community/whisper-base'
		: 'onnx-community/whisper-base.en';
}

let cachedPipeline: any = null;
let cachedModelKey = '';

/**
 * Load Whisper model. Caches pipeline to avoid re-downloading.
 * If settings change, releases old pipeline and loads new one.
 */
export async function loadWhisperModel(
	options: TranscriptionOptions,
	onProgress?: (stage: 'downloading' | 'loaded') => void
): Promise<any> {
	const modelName = getModelName(options.multilingualEnabled);
	const modelKey = `${modelName}:${options.quantized}`;

	if (cachedPipeline && cachedModelKey === modelKey) {
		onProgress?.('loaded');
		return cachedPipeline;
	}

	// Release previous pipeline
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore disposal errors
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}

	onProgress?.('downloading');

	const pipe = await pipeline('automatic-speech-recognition', modelName, {
		dtype: options.quantized ? 'q8' : 'fp32',
	});

	cachedPipeline = pipe;
	cachedModelKey = modelKey;
	onProgress?.('loaded');
	return pipe;
}

/**
 * Transcribe audio using a loaded Whisper pipeline.
 * Returns full transcript with segment timing data.
 */
export async function transcribeAudio(
	audioBlob: Blob,
	whisperPipeline: any,
	language: string,
	onProgress?: (partialText: string) => void
): Promise<TranscriptionResult> {
	// Convert blob to Float32Array (Whisper expects 16kHz mono)
	const arrayBuffer = await audioBlob.arrayBuffer();
	const audioContext = new OfflineAudioContext(1, 1, 16000);

	// Decode and resample to 16kHz mono
	const tempContext = new AudioContext();
	const decoded = await tempContext.decodeAudioData(arrayBuffer);
	await tempContext.close();

	const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
	const source = offlineCtx.createBufferSource();
	source.buffer = decoded;
	source.connect(offlineCtx.destination);
	source.start(0);
	const resampled = await offlineCtx.startRendering();
	const audioData = resampled.getChannelData(0);

	const transcriptionOptions: any = {
		return_timestamps: true,
		chunk_length_s: 30,
		stride_length_s: 5,
	};

	// Set language for multilingual model
	if (language !== 'auto' && language !== 'en') {
		transcriptionOptions.language = language;
	}

	const result = await whisperPipeline(audioData, transcriptionOptions);

	const segments: TranscriptionSegment[] = [];
	let fullText = '';

	if (result.chunks && Array.isArray(result.chunks)) {
		for (const chunk of result.chunks) {
			const segText = (chunk.text || '').trim();
			if (segText) {
				segments.push({
					text: segText,
					start: chunk.timestamp?.[0] ?? 0,
					end: chunk.timestamp?.[1] ?? 0,
				});
			}
		}
		// Group segments into paragraphs (~every 3–5 segments for readability)
		fullText = segmentsToParagraphs(segments);
		onProgress?.(fullText);
	} else {
		fullText = (result.text || '').trim();
		segments.push({ text: fullText, start: 0, end: 0 });
		onProgress?.(fullText);
	}

	return { text: fullText, segments };
}

/**
 * Group segments into paragraphs for readability.
 * Creates a paragraph break roughly every 4-5 sentences or ~30 seconds of audio.
 */
function segmentsToParagraphs(segments: TranscriptionSegment[]): string {
	if (segments.length === 0) return '';

	const paragraphs: string[] = [];
	let currentParagraph: string[] = [];
	let paragraphStartTime = segments[0]?.start ?? 0;
	const PARAGRAPH_INTERVAL = 30; // seconds

	for (const seg of segments) {
		currentParagraph.push(seg.text);
		const elapsed = seg.end - paragraphStartTime;

		// Break paragraph after ~30s of audio or if segment ends with sentence-ending punctuation
		if (elapsed >= PARAGRAPH_INTERVAL && currentParagraph.length >= 2) {
			paragraphs.push(currentParagraph.join(' '));
			currentParagraph = [];
			paragraphStartTime = seg.end;
		}
	}

	if (currentParagraph.length > 0) {
		paragraphs.push(currentParagraph.join(' '));
	}

	return paragraphs.join('\n\n');
}

/**
 * Format transcript with timestamps from segment data.
 * Groups segments into paragraphs with timestamp at the start of each.
 */
export function addTimestampsToTranscript(segments: TranscriptionSegment[]): string {
	if (segments.length === 0) return '';

	const paragraphs: string[] = [];
	let currentSegments: TranscriptionSegment[] = [];
	let paragraphStartTime = segments[0]?.start ?? 0;
	const PARAGRAPH_INTERVAL = 30;

	for (const seg of segments) {
		currentSegments.push(seg);
		const elapsed = seg.end - paragraphStartTime;

		if (elapsed >= PARAGRAPH_INTERVAL && currentSegments.length >= 2) {
			const ts = formatTimestamp(currentSegments[0].start);
			const text = currentSegments.map((s) => s.text).join(' ');
			paragraphs.push(`[${ts}] ${text}`);
			currentSegments = [];
			paragraphStartTime = seg.end;
		}
	}

	if (currentSegments.length > 0) {
		const ts = formatTimestamp(currentSegments[0].start);
		const text = currentSegments.map((s) => s.text).join(' ');
		paragraphs.push(`[${ts}] ${text}`);
	}

	return paragraphs.join('\n\n');
}

function formatTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Calculate word count from transcript text.
 */
export function getWordCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

/**
 * Release cached model to free memory.
 */
export async function releaseModel(): Promise<void> {
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}
}

/**
 * Supported languages for Whisper multilingual model.
 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
	auto: 'Auto-detect language',
	en: 'English',
	yo: 'Yoruba',
	ha: 'Hausa',
	fr: 'French',
	es: 'Spanish',
	pt: 'Portuguese',
	de: 'German',
	it: 'Italian',
	nl: 'Dutch',
	pl: 'Polish',
	ro: 'Romanian',
	sv: 'Swedish',
	da: 'Danish',
	fi: 'Finnish',
	el: 'Greek',
	cs: 'Czech',
	hu: 'Hungarian',
	tr: 'Turkish',
	ar: 'Arabic',
	hi: 'Hindi',
	ja: 'Japanese',
	ko: 'Korean',
	zh: 'Chinese',
	ru: 'Russian',
	uk: 'Ukrainian',
	vi: 'Vietnamese',
	th: 'Thai',
	id: 'Indonesian',
	ms: 'Malay',
	tl: 'Tagalog',
	sw: 'Swahili',
	af: 'Afrikaans',
	ca: 'Catalan',
	cy: 'Welsh',
	bg: 'Bulgarian',
	hr: 'Croatian',
	sk: 'Slovak',
	sl: 'Slovenian',
	lt: 'Lithuanian',
	lv: 'Latvian',
	et: 'Estonian',
	he: 'Hebrew',
	fa: 'Persian',
	ur: 'Urdu',
	bn: 'Bengali',
	ta: 'Tamil',
	te: 'Telugu',
	mr: 'Marathi',
	gu: 'Gujarati',
	kn: 'Kannada',
	ml: 'Malayalam',
	si: 'Sinhala',
	ne: 'Nepali',
	my: 'Myanmar',
	ka: 'Georgian',
	az: 'Azerbaijani',
	uz: 'Uzbek',
	kk: 'Kazakh',
	mn: 'Mongolian',
	bo: 'Tibetan',
	lo: 'Lao',
	km: 'Khmer',
	jw: 'Javanese',
	su: 'Sundanese',
};
