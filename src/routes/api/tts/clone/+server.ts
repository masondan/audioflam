import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { AwsClient } from 'aws4fetch';
import type { RequestHandler } from './$types';

// ── R2 helpers ──────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

function getR2Client(): AwsClient {
	return new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID!,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
		service: 's3',
		region: 'auto'
	});
}

async function uploadToR2(audioBytes: Uint8Array, filename: string): Promise<string> {
	const client = getR2Client();
	const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${filename}`;

	const response = await client.fetch(endpoint, {
		method: 'PUT',
		headers: { 'Content-Type': 'audio/wav' },
		body: audioBytes as BodyInit
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`R2 upload failed: ${response.status} ${errorText}`);
	}

	return `${env.R2_PUBLIC_URL}/${filename}`;
}

async function deleteFromR2(filename: string): Promise<void> {
	try {
		const client = getR2Client();
		const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${filename}`;
		await client.fetch(endpoint, { method: 'DELETE' });
	} catch (err) {
		// Best-effort cleanup — don't fail the request if this fails
		console.warn('[TTS Clone] R2 cleanup warning:', err);
	}
}

// POST /api/tts/clone — Register a new voice clone with DashScope (voice-enrollment / qwen-audio-3.0-tts-flash)
export const POST: RequestHandler = async ({ request }) => {
	let r2Filename: string | null = null;

	try {
		const { audioBase64, audioFormat, preferredName } = await request.json();

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

		if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME || !env.R2_PUBLIC_URL) {
			console.error('[TTS Clone] R2 configuration missing');
			return json({ error: 'Voice cloning storage is not configured' }, { status: 503 });
		}

		// Prefix must be alphanumeric only, max 10 chars per API spec
		const prefix = preferredName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'voice';

		// Step 1: Upload prepared audio to R2 to get a publicly fetchable URL
		const audioBytes = base64ToUint8Array(audioBase64);
		r2Filename = `${prefix}-${Date.now()}.wav`;
		const audioUrl = await uploadToR2(audioBytes, r2Filename);

		// Step 2: Call new voice-enrollment API
		const response = await fetch(
			'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${QWEN_SPEECH_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'voice-enrollment',
					input: {
						action: 'create_voice',
						target_model: 'qwen-audio-3.0-tts-flash',
						prefix,
						url: audioUrl,
						language_hints: ['en']
					}
				})
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('[TTS Clone] DashScope registration error:', response.status, errorText);
			return json({ error: 'Voice clone registration failed' }, { status: 502 });
		}

		const data = await response.json() as { output?: { voice_id?: string } };
		const cloneId = data?.output?.voice_id;

		if (!cloneId) {
			console.error('[TTS Clone] No voice_id in response:', JSON.stringify(data));
			return json({ error: 'No clone ID returned from provider' }, { status: 502 });
		}

		console.log('[TTS Clone] Registered clone:', cloneId);

		// Step 3: Clean up R2 object — only needed transiently for enrollment
		await deleteFromR2(r2Filename);

		return json({ cloneId });

	} catch (error) {
		console.error('[TTS Clone] POST error:', error);
		// Best-effort cleanup on failure too
		if (r2Filename) await deleteFromR2(r2Filename);
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
						model: 'voice-enrollment',
						input: {
							action: 'delete_voice',
							voice_id: cloneId
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
