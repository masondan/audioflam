import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/transcribe-deepgram
 *
 * Receives audio as a binary blob, sends to Deepgram Nova-3 for transcription
 * with word-level timestamps, and returns SubtitleSegment-compatible JSON.
 *
 * Request: multipart/form-data with field "audio" (audio file blob)
 * Response: { segments: SubtitleSegment[] }
 *
 * Each segment: { start, end, text, words: [{ word, start, end }] }
 */
export const POST: RequestHandler = async ({ request }) => {
	const DEEPGRAM_KEY = env.DEEPGRAM_VTT_KEY?.trim();

	if (!DEEPGRAM_KEY) {
		return json({ error: 'Deepgram API key not configured' }, { status: 500 });
	}

	try {
		const formData = await request.formData();
		const audioFile = formData.get('audio') as File | null;

		if (!audioFile) {
			return json({ error: 'No audio file provided' }, { status: 400 });
		}

		const audioBuffer = await audioFile.arrayBuffer();
		const mimeType = audioFile.type || 'audio/mpeg';

		// Call Deepgram Nova-3 with word-level timestamps
		const deepgramUrl = 'https://api.deepgram.com/v1/listen?' + new URLSearchParams({
			model: 'nova-3',
			smart_format: 'true',
			punctuate: 'true',
			utterances: 'false',
			words: 'true',
		}).toString();

		const deepgramResponse = await fetch(deepgramUrl, {
			method: 'POST',
			headers: {
				'Authorization': `Token ${DEEPGRAM_KEY}`,
				'Content-Type': mimeType,
			},
			body: audioBuffer,
		});

		if (!deepgramResponse.ok) {
			const errorText = await deepgramResponse.text();
			console.error('[Deepgram] API error:', deepgramResponse.status, errorText);
			return json(
				{ error: 'Deepgram transcription failed', details: errorText },
				{ status: deepgramResponse.status }
			);
		}

		const deepgramData = await deepgramResponse.json();

		// Extract word-level data from Deepgram response
		const words: Array<{ word: string; start: number; end: number }> =
			deepgramData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

		if (words.length === 0) {
			return json({ error: 'No transcription data returned' }, { status: 422 });
		}

		// Group words into subtitle segments.
		// Strategy: split on natural pauses (gap > 0.4s between words) or every ~8 words max.
		const MAX_WORDS_PER_SEGMENT = 8;
		const PAUSE_THRESHOLD = 0.4; // seconds

		const segments: Array<{
			start: number;
			end: number;
			text: string;
			words: Array<{ word: string; start: number; end: number }>;
		}> = [];

		let currentWords: typeof words = [];

		for (let i = 0; i < words.length; i++) {
			const w = words[i];
			const next = words[i + 1];

			currentWords.push({ word: w.word, start: w.start, end: w.end });

			const isLongEnough = currentWords.length >= MAX_WORDS_PER_SEGMENT;
			const isPause = next && (next.start - w.end) > PAUSE_THRESHOLD;
			const isLast = !next;

			if (isLongEnough || isPause || isLast) {
				segments.push({
					start: currentWords[0].start,
					end: currentWords[currentWords.length - 1].end,
					text: currentWords.map(cw => cw.word).join(' '),
					words: [...currentWords],
				});
				currentWords = [];
			}
		}

		console.log(`[Deepgram] Transcribed ${words.length} words into ${segments.length} segments`);

		return json({ segments }, { status: 200 });

	} catch (error) {
		console.error('[Deepgram] Server error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal server error', details: message }, { status: 500 });
	}
};
