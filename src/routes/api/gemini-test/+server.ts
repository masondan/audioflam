import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
	const GEMINI_API_KEY = env.GEMINI_API_KEY?.trim();

	if (!GEMINI_API_KEY) {
		return json({ error: 'GEMINI_API_KEY not set in environment' }, { status: 500 });
	}

	const keyPreview = `${GEMINI_API_KEY.slice(0, 6)}...${GEMINI_API_KEY.slice(-4)}`;

	// Minimal Gemini request — no tools, no system instruction
	const geminiResponse = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{
						role: 'user',
						parts: [{ text: 'Say "API working" and nothing else.' }]
					}
				]
			})
		}
	);

	const status = geminiResponse.status;
	const body = await geminiResponse.text();

	let parsed: unknown = null;
	try {
		parsed = JSON.parse(body);
	} catch {
		// body is not JSON
	}

	return json({
		keyPreview,
		geminiStatus: status,
		geminiOk: geminiResponse.ok,
		geminiResponse: parsed ?? body
	});
};
