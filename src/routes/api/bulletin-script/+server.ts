import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BULLETIN_PROMPT, EXPLAINER_PROMPT } from '$lib/server/bulletinPrompts';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
	const { text, scriptLength, scriptType } = await request.json();

	if (!text || !scriptLength || !scriptType) {
		throw error(400, 'Missing required fields: text, scriptLength, scriptType');
	}

	const GEMINI_API_KEY = env.GEMINI_API_KEY?.trim();
	if (!GEMINI_API_KEY) {
		console.error('[BulletinScript] GEMINI_API_KEY not configured');
		throw error(502, 'Script generation is not configured');
	}

	const targetWords = Math.round(scriptLength * 2.5);
	const basePrompt = scriptType === 'summary' ? BULLETIN_PROMPT : EXPLAINER_PROMPT;
	const systemPrompt = basePrompt
		.replace('{TARGET_WORDS}', String(targetWords))
		.replace('{TARGET_SECONDS}', String(scriptLength));

	// Note: system_instruction is incompatible with googleSearch grounding tool.
	// Fold the system prompt into the user turn instead.
	const userMessage = `${systemPrompt}\n\n---\n\n${text}`;

	const geminiResponse = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{
						role: 'user',
						parts: [{ text: userMessage }]
					}
				],
				tools: [{ googleSearch: {} }]
			})
		}
	);

	if (!geminiResponse.ok) {
		const errBody = await geminiResponse.text();
		console.error('[BulletinScript] Gemini error:', errBody);

		// Surface quota errors clearly
		if (geminiResponse.status === 429) {
			throw error(429, 'Gemini API quota exceeded. Add billing at https://aistudio.google.com or wait for quota reset.');
		}
		if (geminiResponse.status === 403) {
			throw error(403, 'Gemini API key invalid or Generative Language API not enabled for this project.');
		}

		throw error(502, `Gemini API request failed (HTTP ${geminiResponse.status})`);
	}

	const geminiData = await geminiResponse.json();

	// Extract text from Gemini response (filter out non-text parts e.g. grounding metadata)
	const script =
		geminiData?.candidates?.[0]?.content?.parts
			?.filter((p: { text?: string }) => typeof p.text === 'string')
			?.map((p: { text: string }) => p.text)
			?.join('') ?? '';

	if (!script) {
		console.error('[BulletinScript] Empty script returned:', JSON.stringify(geminiData));
		throw error(502, 'Gemini returned an empty script');
	}

	return json({ script });
};
