import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { text, voiceName, provider } = await request.json();

		if (!text) {
			return json({ error: 'Text is required' }, { status: 400 });
		}
		if (!voiceName) {
			return json({ error: 'Voice name is required' }, { status: 400 });
		}

		// Route to appropriate provider
		if (provider === 'azure') {
			return await handleAzure(text, voiceName);
		} else if (provider === 'minimax') {
			return await handleMiniMax(text, voiceName);
		} else if (provider === 'qwen') {
			return await handleQwen(text, voiceName);
		} else {
			return await handleYarnGPT(text, voiceName);
		}

	} catch (error) {
		console.error('Server Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal Server Error', details: message }, { status: 500 });
	}
};

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function cleanForTTS(text: string): string {
	let result = text;

	// 1. Replace em-dashes (—) with commas for natural pacing, preserving spacing
	result = result.replace(/\s*—\s*/g, ', ');

	// 2. Ensure every sentence ends with . ? or !
	// Process each line separately and add period if missing
	const lines = result.split('\n');
	result = lines
		.map((line) => {
			const trimmed = line.trim();
			// Add period if line has content but no ending punctuation
			if (trimmed && !/[.!?]$/.test(trimmed)) {
				return trimmed + '.';
			}
			return trimmed;
		})
		.join('\n');

	// Also ensure the entire text ends with punctuation
	result = result.trim();
	if (result && !/[.!?]$/.test(result)) {
		result += '.';
	}

	// 3. Add comma after unpunctuated clauses 8+ words long
	// Split on sentence-ending punctuation to identify clauses
	// If a clause is long (8+ words) and unpunctuated, add comma for pacing
	const clauses = result.split(/(?=[.!?])/);
	result = clauses
		.map((clause) => {
			if (!clause || /^[.!?]/.test(clause)) {
				return clause; // Keep punctuation marks as-is
			}

			const trimmedClause = clause.trim();
			const wordCount = trimmedClause.split(/\s+/).filter((w) => w.length > 0).length;

			// If 8+ words and currently unpunctuated, add comma for natural breath point
			if (wordCount >= 8 && !/[,;:]$/.test(trimmedClause)) {
				return trimmedClause + ',';
			}
			return trimmedClause;
		})
		.join('');

	return result;
}

async function handleAzure(text: string, voiceName: string) {
	const AZURE_SPEECH_KEY = env.AZURE_SPEECH_KEY?.trim();
	const AZURE_SPEECH_REGION = env.AZURE_SPEECH_REGION?.trim() || 'eastus';

	if (!AZURE_SPEECH_KEY) {
		return json({ error: 'Azure Speech key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 4000);
	const escapedText = escapeXml(trimmedText);

	const langMatch = voiceName.match(/^([a-z]{2}-[A-Z]{2})/);
	const langCode = langMatch ? langMatch[1] : 'en-US';
	
	const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${langCode}'><voice name='${voiceName}'>${escapedText}</voice></speak>`;
	const endpoint = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
			'Content-Type': 'application/ssml+xml; charset=utf-8',
			'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
			'User-Agent': 'audioflam-cloudflare/1.0'
		},
		body: ssml
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Azure TTS error:', response.status, errorText);
		return json(
			{ error: 'Azure TTS generation failed', status: response.status, details: errorText },
			{ status: response.status }
		);
	}

	const audioBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(audioBuffer);
	let binaryString = '';
	const chunkSize = 8192;
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		binaryString += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
	}
	const base64Audio = btoa(binaryString);

	return json({ audioContent: base64Audio, format: 'mp3' }, { status: 200 });
}

async function handleYarnGPT(text: string, voiceName: string) {
	const YARNGPT_API_KEY = env.YARNGPT_API_KEY;
	if (!YARNGPT_API_KEY) {
		console.error('YARNGPT_API_KEY missing');
		return json({ error: 'YarnGPT API key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 4000);

	const response = await fetch('https://yarngpt.ai/api/v1.1/tts', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${YARNGPT_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			text: trimmedText,
			voice: voiceName,
			response_format: 'mp3'
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('YarnGPT API error:', response.status, errorText);
		return json(
			{ error: 'YarnGPT generation failed', details: errorText },
			{ status: response.status }
		);
	}

	const audioBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(audioBuffer);
	let binaryString = '';
	const chunkSize = 8192;
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		binaryString += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
	}
	const base64Audio = btoa(binaryString);
return json({ audioContent: base64Audio, format: 'mp3' }, { status: 200 });
}

async function handleMiniMax(text: string, voiceName: string) {
const MINIMAX_API_KEY = env.MINIMAX_SPEECH_KEY;
const MINIMAX_GROUP_ID = env.MINIMAX_GROUP_ID;
if (!MINIMAX_API_KEY) {
	console.error('[MiniMax] MINIMAX_SPEECH_KEY missing');
	return json({ error: 'MiniMax API key not configured' }, { status: 500 });
}
if (!MINIMAX_GROUP_ID) {
	console.error('[MiniMax] MINIMAX_GROUP_ID missing');
	return json({ error: 'MiniMax Group ID not configured' }, { status: 500 });
}

const trimmedText = text.slice(0, 4000);

console.log(`[MiniMax] Generating TTS for voice: ${voiceName}, text length: ${trimmedText.length}`);
console.log(`[MiniMax] API Key set: ${MINIMAX_API_KEY ? 'yes' : 'no'}`);

const requestBody = {
	model: 'speech-02',
	text: trimmedText,
	voice_id: voiceName,
	emotion: 'neutral',
	response_format: 'mp3'
};
console.log(`[MiniMax] Request payload:`, JSON.stringify(requestBody, null, 2));

const response = await fetch(`https://api.minimax.io/v1/text_to_speech?GroupId=${MINIMAX_GROUP_ID}`, {
	method: 'POST',
	headers: {
		'Authorization': `Bearer ${MINIMAX_API_KEY}`,
		'Content-Type': 'application/json'
	},
	body: JSON.stringify(requestBody)
});

console.log(`[MiniMax] Response status: ${response.status}`);
console.log(`[MiniMax] Response headers:`, Object.fromEntries(response.headers.entries()));

if (!response.ok) {
	const errorText = await response.text();
	console.error('[MiniMax] Full API error response:', errorText);
	console.error('[MiniMax] Error status:', response.status);
	return json(
		{ error: 'MiniMax TTS generation failed', status: response.status, details: errorText },
		{ status: response.status }
	);
}

// MiniMax may return JSON with base64 audio_content, or raw binary audio
const contentType = response.headers.get('content-type') || '';
if (contentType.includes('application/json')) {
	const data = await response.json() as { audio_content?: string; base_resp?: { status_code: number; status_msg: string } };
	if (data.base_resp && data.base_resp.status_code !== 0) {
		console.error('[MiniMax] API error in JSON response:', data.base_resp);
		return json(
			{ error: 'MiniMax TTS generation failed', details: data.base_resp.status_msg },
			{ status: 500 }
		);
	}
	if (data.audio_content) {
		return json({ audioContent: data.audio_content, format: 'mp3' }, { status: 200 });
	}
}

// Raw binary audio response
const audioBuffer = await response.arrayBuffer();
const uint8Array = new Uint8Array(audioBuffer);
let binaryString = '';
const chunkSize = 8192;
for (let i = 0; i < uint8Array.length; i += chunkSize) {
	binaryString += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
}
const base64Audio = btoa(binaryString);
console.log('[MiniMax] TTS generated successfully');
return json({ audioContent: base64Audio, format: 'mp3' }, { status: 200 });
}

// ── Qwen (qwen-audio-3.0-tts-flash) — WebSocket-based synthesis ─────────────
// Protocol confirmed empirically against the live API (August 2026):
// header/payload envelope, run-task -> task-started -> continue-task ->
// result-generated (binary audio frames interleaved with text/JSON sentence
// metadata events) -> finish-task -> task-finished. Voice IDs enrolled under
// the retiring qwen3-tts-vc-2026-01-22 model CANNOT be reused here — they
// must be re-enrolled via the new voice-enrollment API (see /api/tts/clone).

interface QwenWsMessage {
	header?: { event?: string; task_id?: string };
	payload?: unknown;
}

async function handleQwen(text: string, voiceId: string) {
	const QWEN_API_KEY = env.QWEN_SPEECH_KEY;
	if (!QWEN_API_KEY) {
		console.error('[Qwen] QWEN_SPEECH_KEY missing');
		return json({ error: 'Qwen API key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 4000);
	const cleanedText = cleanForTTS(trimmedText);
	const WS_ENDPOINT = 'wss://llm-vg2wh1r1rw2th4cy.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference';
	const SYNTHESIS_MODEL = 'qwen-audio-3.0-tts-flash';

	console.log(`[Qwen] Generating TTS for voice: ${voiceId}, text length: ${cleanedText.length}`);

	try {
		const audioBuffer = await synthesizeViaWebSocket(WS_ENDPOINT, QWEN_API_KEY, SYNTHESIS_MODEL, voiceId, cleanedText);

		// Convert to base64
		const uint8Array = new Uint8Array(audioBuffer);
		let binaryString = '';
		const chunkSize = 8192;
		for (let i = 0; i < uint8Array.length; i += chunkSize) {
			binaryString += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
		}
		const base64Audio = btoa(binaryString);

		console.log('[Qwen] TTS generated successfully');
		return json({ audioContent: base64Audio, format: 'wav' }, { status: 200 });

	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[Qwen] WebSocket synthesis error:', message);
		return json({ error: 'Qwen TTS request failed', details: message }, { status: 500 });
	}
}

// Establish an authenticated WebSocket connection to the DashScope inference
// endpoint. Cloudflare Workers' global WebSocket constructor does not accept
// a headers option, so on that runtime the connection must be made via
// fetch() with an "Upgrade: websocket" header — the resulting Response
// carries a `webSocket` property that must be accept()-ed before use. On
// Node (local `npm run dev`), undici's WebSocket constructor does accept a
// headers option, so we use that path directly.
async function connectQwenWebSocket(endpoint: string, apiKey: string): Promise<WebSocket> {
	const isCloudflareWorker = typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';

	if (isCloudflareWorker) {
		const httpsEndpoint = endpoint.replace(/^wss:\/\//, 'https://');
		const upgradeResponse = await fetch(httpsEndpoint, {
			headers: {
				'Upgrade': 'websocket',
				'Authorization': `Bearer ${apiKey}`
			}
		});
		const cfWebSocket = (upgradeResponse as unknown as { webSocket?: WebSocket }).webSocket;
		if (!cfWebSocket) {
			throw new Error('Cloudflare Workers WebSocket upgrade failed: no webSocket in response');
		}
		(cfWebSocket as unknown as { accept: () => void }).accept();
		return cfWebSocket;
	}

	// Node / undici path — headers option supported on Node 22+.
	const WebSocketCtor = WebSocket as unknown as new (url: string, opts?: { headers?: Record<string, string> }) => WebSocket;
	return new WebSocketCtor(endpoint, {
		headers: { 'Authorization': `Bearer ${apiKey}` }
	});
}

async function synthesizeViaWebSocket(
	endpoint: string,
	apiKey: string,
	model: string,
	voiceId: string,
	text: string
): Promise<Uint8Array> {
	const ws = await connectQwenWebSocket(endpoint, apiKey);

	return new Promise((resolve, reject) => {
		const taskId = crypto.randomUUID();
		const audioChunks: Uint8Array[] = [];
		let settled = false;

		const timeoutHandle = setTimeout(() => {
			if (settled) return;
			settled = true;
			try { ws.close(); } catch { /* ignore */ }
			reject(new Error('Qwen synthesis timeout'));
		}, 60000);

		function finish(err: Error | null, result?: Uint8Array) {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutHandle);
			try { ws.close(); } catch { /* ignore */ }
			if (err) reject(err);
			else resolve(result!);
		}

		function combineChunks(): Uint8Array {
			const totalSize = audioChunks.reduce((sum, c) => sum + c.length, 0);
			const combined = new Uint8Array(totalSize);
			let offset = 0;
			for (const chunk of audioChunks) {
				combined.set(chunk, offset);
				offset += chunk.length;
			}
			return combined;
		}

		ws.addEventListener('open', () => {
			ws.send(JSON.stringify({
				header: {
					action: 'run-task',
					task_id: taskId,
					streaming: 'duplex'
				},
				payload: {
					task_group: 'audio',
					task: 'tts',
					function: 'SpeechSynthesizer',
					model,
					parameters: {
						text_type: 'PlainText',
						voice: voiceId,
						format: 'wav',
						sample_rate: 24000
					},
					input: {}
				}
			}));
		});

		ws.addEventListener('message', (event: MessageEvent) => {
			if (typeof event.data === 'string') {
				let msg: QwenWsMessage;
				try {
					msg = JSON.parse(event.data);
				} catch {
					return;
				}
				const eventType = msg.header?.event;

				if (eventType === 'task-started') {
					ws.send(JSON.stringify({
						header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
						payload: { input: { text } }
					}));
					// Give the server a brief moment to buffer the text, then finish.
					setTimeout(() => {
						ws.send(JSON.stringify({
							header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
							payload: { input: {} }
						}));
					}, 300);
				} else if (eventType === 'task-finished') {
					finish(null, combineChunks());
				} else if (eventType === 'task-failed') {
					finish(new Error(`Qwen task-failed: ${JSON.stringify(msg.payload)}`));
				}
				// 'result-generated' text events carry sentence metadata only; audio arrives as binary frames.
			} else {
				// Binary audio frame — normalize to Uint8Array across runtimes (Blob in
				// browser-like WS implementations, ArrayBuffer in Workers/undici).
				const data = event.data as ArrayBuffer | Blob;
				if (typeof Blob !== 'undefined' && data instanceof Blob) {
					data.arrayBuffer().then((buf) => {
						audioChunks.push(new Uint8Array(buf));
					}).catch(() => { /* ignore individual chunk failure */ });
				} else {
					audioChunks.push(new Uint8Array(data as ArrayBuffer));
				}
			}
		});

		ws.addEventListener('error', () => {
			finish(new Error('Qwen WebSocket connection error'));
		});

		ws.addEventListener('close', () => {
			if (!settled) {
				if (audioChunks.length === 0) {
					finish(new Error('Qwen WebSocket closed with no audio data'));
				} else {
					finish(null, combineChunks());
				}
			}
		});
	});
}
