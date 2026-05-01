import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const STRIP_TAGS = /<(script|style|nav|footer|header|aside|noscript|iframe|form)[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_ALL_TAGS = /<[^>]+>/g;
const MAX_CHARS = 50000;

const SYSTEM_PROMPT = `You are an article text extractor for a journalism tool.
Extract ONLY the main article body text from the provided HTML.
Rules:
- Return plain text only. No markdown, no headings, no bullet points.
- Exclude: navigation, ads, related stories, captions, author bios, comment sections, cookie notices, subscription prompts.
- Preserve paragraph breaks with a single blank line between paragraphs.
- If the content appears to be a paywall stub or login prompt (less than 150 words of article body), respond with exactly: PAYWALL
- If no article content can be found, respond with exactly: NO_CONTENT`;

export const POST: RequestHandler = async ({ request }) => {
	const { url } = await request.json();

	if (!url || !url.startsWith('http')) {
		throw error(400, 'Invalid URL');
	}

	// Fetch the page server-side (bypasses CORS)
	let html: string;
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AudioFlam/1.0)' },
			signal: AbortSignal.timeout(10000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		html = await res.text();
	} catch (e: any) {
		return json({ error: 'FETCH_FAILED', message: e.message });
	}

	// Strip heavy tags, then all remaining tags, truncate
	const stripped = html
		.replace(STRIP_TAGS, ' ')
		.replace(STRIP_ALL_TAGS, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_CHARS);

	// Send to Gemini 2.5 Flash
	const geminiApiKey = env.GEMINI_API_KEY?.trim();
	if (!geminiApiKey) {
		return json({ error: 'SERVER_ERROR', message: 'Gemini API key not configured' });
	}

	let geminiRes: Response;
	try {
		geminiRes = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
					contents: [{ parts: [{ text: stripped }] }]
				})
			}
		);
	} catch (e: any) {
		return json({ error: 'GEMINI_FAILED', message: 'Failed to reach Gemini API' });
	}

	if (!geminiRes.ok) {
		return json({ error: 'GEMINI_FAILED', message: `Gemini API error: ${geminiRes.status}` });
	}

	const geminiData = await geminiRes.json();
	const extracted = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

	if (!extracted || extracted === 'NO_CONTENT') {
		return json({ error: 'NO_CONTENT' });
	}
	if (extracted === 'PAYWALL') {
		return json({ error: 'PAYWALL' });
	}

	return json({ text: extracted });
};
