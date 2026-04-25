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
	model: 'speech-02-turbo',
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

