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
			'X-Microsoft-OutputFormat': 'audio-16khz-48kbitrate-mono-mp3',
			'User-Agent': 'audioflam-cloudflare/1.0',
			'Host': `${AZURE_SPEECH_REGION}.tts.speech.microsoft.com`
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


