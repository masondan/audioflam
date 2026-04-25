import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Voice clone IDs to keep alive (MiniMax clones expire after 7 days of inactivity)
// Cloned via scripts/minimax-clone-voices.js (April 2026)
const VOICE_IDS = [
	'chisomom01',   // Chisomo — Malawi English male
	'mercyf0001',   // Mercy   — Malawi English female
	'tawandam01',   // Tawanda — Zimbabwe English male
	'preciousf1'    // Precious — Zimbabwe English female
];

// POST /api/minimax-refresh
// Called weekly (via external cron or Cloudflare Worker trigger) to prevent clone expiry.
// Sends a single-character TTS request per voice — cost is negligible (~$0.000002/week total).
export const POST: RequestHandler = async () => {
	const MINIMAX_API_KEY = env.MINIMAX_SPEECH_KEY;
	const MINIMAX_GROUP_ID = env.MINIMAX_GROUP_ID;
	if (!MINIMAX_API_KEY) {
		console.error('[MiniMax] MINIMAX_SPEECH_KEY not configured');
		return json({ error: 'MiniMax API key not configured' }, { status: 500 });
	}
	if (!MINIMAX_GROUP_ID) {
		console.error('[MiniMax] MINIMAX_GROUP_ID not configured');
		return json({ error: 'MiniMax Group ID not configured' }, { status: 500 });
	}

	console.log('[MiniMax] Starting weekly voice clone refresh...');
	const results: { voiceId: string; status: string }[] = [];

	for (const voiceId of VOICE_IDS) {
		try {
			const response = await fetch(`https://api.minimax.io/v1/text_to_speech?GroupId=${MINIMAX_GROUP_ID}`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${MINIMAX_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'speech-2.8-turbo',
					text: 'a', // Single character — minimal cost, just enough to reset TTL
					voice_id: voiceId,
					emotion: 'neutral',
					response_format: 'mp3'
				})
			});

			if (response.ok) {
				console.log(`[MiniMax] Refreshed: ${voiceId}`);
				results.push({ voiceId, status: 'refreshed' });
			} else {
				const errorText = await response.text();
				console.error(`[MiniMax] Refresh failed for ${voiceId}: ${response.status} ${errorText}`);
				results.push({ voiceId, status: `failed (${response.status})` });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error(`[MiniMax] Refresh error for ${voiceId}:`, message);
			results.push({ voiceId, status: `error: ${message}` });
		}
	}

	const allOk = results.every(r => r.status === 'refreshed');
	console.log(`[MiniMax] Refresh complete. ${results.filter(r => r.status === 'refreshed').length}/${VOICE_IDS.length} voices refreshed.`);

	return json(
		{ message: 'Voice clone refresh complete', results },
		{ status: allOk ? 200 : 207 } // 207 Multi-Status if some failed
	);
};
