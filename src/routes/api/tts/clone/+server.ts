import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// POST /api/tts/clone — Register a new voice clone with DashScope
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { audioBase64, audioFormat, preferredName, text } = await request.json();

		if (!audioBase64) {
			return json({ error: 'audioBase64 is required' }, { status: 400 });
		}
		if (!audioFormat) {
			return json({ error: 'audioFormat is required' }, { status: 400 });
		}
		if (!preferredName) {
			return json({ error: 'preferredName is required' }, { status: 400 });
		}

		const QWEN_SPEECH_KEY = env.QWEN_SPEECH_KEY;
		if (!QWEN_SPEECH_KEY) {
			return json({ error: 'Voice cloning is not configured' }, { status: 503 });
		}

		const response = await fetch(
			'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${QWEN_SPEECH_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'qwen-voice-enrollment',
					input: {
						action: 'create',
						target_model: 'qwen3-tts-vc-2026-01-22',
						preferred_name: preferredName,
						language: 'en',
						text: text,
						audio: {
							data: `data:${audioFormat};base64,${audioBase64}`
						}
					}
				})
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('[TTS Clone] DashScope registration error:', response.status, errorText);
			return json({ error: 'Voice clone registration failed' }, { status: 502 });
		}

		const data = await response.json();
		const cloneId = data?.output?.voice;

		if (!cloneId) {
			console.error('[TTS Clone] No clone ID in response:', JSON.stringify(data));
			return json({ error: 'No clone ID returned from provider' }, { status: 502 });
		}

		console.log('[TTS Clone] Registered clone:', cloneId);
		return json({ cloneId });

	} catch (error) {
		console.error('[TTS Clone] POST error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal server error', details: message }, { status: 500 });
	}
};

// DELETE /api/tts/clone — Remove a voice clone from DashScope (best-effort)
export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { cloneId } = await request.json();

		if (!cloneId) {
			return json({ error: 'cloneId is required' }, { status: 400 });
		}

		const QWEN_SPEECH_KEY = env.QWEN_SPEECH_KEY;
		if (!QWEN_SPEECH_KEY) {
			// No key configured — localStorage removal is source of truth; succeed silently
			return json({ success: true });
		}

		try {
			const response = await fetch(
				'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${QWEN_SPEECH_KEY}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						model: 'qwen-voice-enrollment',
						input: {
							action: 'delete',
							voice: cloneId
						}
					})
				}
			);

			if (!response.ok) {
				// Log but don't fail — localStorage removal is source of truth
				const errorText = await response.text();
				console.warn('[TTS Clone] DashScope deletion warning:', response.status, errorText);
			} else {
				console.log('[TTS Clone] Deleted clone:', cloneId);
			}
		} catch (fetchError) {
			// Network error — log and continue; localStorage removal is source of truth
			console.warn('[TTS Clone] Deletion fetch failed (non-blocking):', fetchError);
		}

		return json({ success: true });

	} catch (error) {
		console.error('[TTS Clone] DELETE error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
