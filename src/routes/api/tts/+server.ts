import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const { text, voiceName, provider, speakerUrl } = await request.json();

		if (!text) {
			return json({ error: 'Text is required' }, { status: 400 });
		}
		if (!voiceName) {
			return json({ error: 'Voice name is required' }, { status: 400 });
		}

		// Route to appropriate provider
		if (provider === 'replicate') {
			return await handleReplicate(text, speakerUrl, url.origin);
		} else {
			return await handleYarnGPT(text, voiceName);
		}

	} catch (error) {
		console.error('Server Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal Server Error', details: message }, { status: 500 });
	}
};

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
	const base64Audio = Buffer.from(audioBuffer).toString('base64');

	return json({ audioContent: base64Audio });
}

async function handleReplicate(text: string, speakerUrl: string, origin: string) {
	const REPLICATE_API_TOKEN = env.REPLICATE_API_TOKEN;
	if (!REPLICATE_API_TOKEN) {
		console.error('REPLICATE_API_TOKEN missing');
		return json({ error: 'Replicate API token not configured' }, { status: 500 });
	}

	// If speakerUrl is a relative path, make it absolute
	const absoluteSpeakerUrl = speakerUrl.startsWith('http') 
		? speakerUrl 
		: `${origin}${speakerUrl}`;

	console.log('Replicate request:', { text: text.slice(0, 50), speakerUrl: absoluteSpeakerUrl });

	// Create prediction
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			version: '684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e',
			input: {
				text: text.slice(0, 2000),
				speaker: absoluteSpeakerUrl,
				language: 'en',
				cleanup_voice: false
			}
		})
	});

	if (!createResponse.ok) {
		const errorText = await createResponse.text();
		console.error('Replicate create error:', createResponse.status, errorText);
		return json({ error: 'Replicate creation failed', details: errorText, status: createResponse.status }, { status: createResponse.status });
	}

	const prediction = await createResponse.json();
	
	// Poll for completion (max 90 seconds)
	const maxAttempts = 45;
	let attempts = 0;
	let result = prediction;

	while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
			headers: {
				'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
			}
		});
		
		if (!pollResponse.ok) {
			console.error('Replicate poll error:', pollResponse.status);
			return json({ error: 'Replicate polling failed' }, { status: pollResponse.status });
		}
		
		result = await pollResponse.json();
		attempts++;
	}

	if (result.status === 'failed') {
		console.error('Replicate generation failed:', result.error);
		return json({ error: 'Replicate generation failed', details: result.error }, { status: 500 });
	}

	if (result.status !== 'succeeded') {
		return json({ error: 'Replicate timeout - generation took too long' }, { status: 504 });
	}

	// Fetch the audio from the output URL
	const audioResponse = await fetch(result.output);
	if (!audioResponse.ok) {
		return json({ error: 'Failed to fetch generated audio' }, { status: 500 });
	}

	const audioBuffer = await audioResponse.arrayBuffer();
	const base64Audio = Buffer.from(audioBuffer).toString('base64');

	return json({ audioContent: base64Audio, format: 'wav' });
}
