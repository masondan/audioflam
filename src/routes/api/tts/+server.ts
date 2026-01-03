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
	const AZURE_SPEECH_KEY = env.AZURE_SPEECH_KEY;
	const AZURE_SPEECH_REGION = env.AZURE_SPEECH_REGION || 'eastus';

	console.log('Azure TTS request:', { voiceName, region: AZURE_SPEECH_REGION, textLength: text.length });

	if (!AZURE_SPEECH_KEY) {
		console.error('AZURE_SPEECH_KEY missing');
		return json({ error: 'Azure Speech key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 2000);
	const escapedText = escapeXml(trimmedText);

	const ssml = `<speak version='1.0' xml:lang='en-NG'><voice name='${voiceName}'>${escapedText}</voice></speak>`;
	console.log('SSML:', ssml);

	const response = await fetch(
		`https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
		{
			method: 'POST',
			headers: {
				'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
				'Content-Type': 'application/ssml+xml',
				'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
			},
			body: ssml
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		console.error('Azure TTS error:', response.status, errorText);
		return json(
			{ error: 'Azure TTS generation failed', details: errorText },
			{ status: response.status }
		);
	}

	const audioBuffer = await response.arrayBuffer();
	const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

	return json({ audioContent: base64Audio, format: 'mp3' });
}

async function handleYarnGPT(text: string, voiceName: string) {
	const YARNGPT_API_KEY = env.YARNGPT_API_KEY;
	if (!YARNGPT_API_KEY) {
		console.error('YARNGPT_API_KEY missing');
		return json({ error: 'YarnGPT API key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 2000);

	const response = await fetch('https://yarngpt.ai/api/v1/tts', {
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
	const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

	return json({ audioContent: base64Audio });
}


