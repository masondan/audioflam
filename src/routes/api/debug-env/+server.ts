import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const region = env.AZURE_SPEECH_REGION ?? '';
	const key = env.AZURE_SPEECH_KEY ?? '';

	return json({
		region,
		regionCharCodes: Array.from(region).map(c => c.charCodeAt(0)),
		keyLength: key.length,
		keyFirst4: key.slice(0, 4),
		keyLast4: key.slice(-4),
		hasYarnGPT: !!env.YARNGPT_API_KEY
	});
};
