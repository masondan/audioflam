/**
 * Generate MiniMax voice preview MP3s for static/voices/
 * Run this after the TPM rate limit resets (usually within an hour of heavy usage).
 *
 * Usage:
 *   node --env-file=.env scripts/generate-minimax-samples.js
 *
 * Output: static/voices/chisomo.mp3, mercy.mp3, tawanda.mp3, precious.mp3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MINIMAX_API_KEY = process.env.MINIMAX_SPEECH_KEY || process.env.MINIMAX_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'static', 'voices');
const BASE_URL = 'https://api.minimax.io';

if (!MINIMAX_API_KEY) {
	console.error('❌ MINIMAX_SPEECH_KEY not found. Run with: node --env-file=.env scripts/generate-minimax-samples.js');
	process.exit(1);
}

const voices = [
	{ id: 'chisomom01', name: 'Chisomo', file: 'chisomo.mp3', text: 'Hello, my name is Chisomo. Welcome to AudioFlam.' },
	{ id: 'mercyf0001', name: 'Mercy',   file: 'mercy.mp3',   text: 'Hello, my name is Mercy. Welcome to AudioFlam.' },
	{ id: 'tawandam01', name: 'Tawanda', file: 'tawanda.mp3', text: 'Hello, my name is Tawanda. Welcome to AudioFlam.' },
	{ id: 'preciousf1', name: 'Precious',file: 'precious.mp3',text: 'Hello, my name is Precious. Welcome to AudioFlam.' }
];

async function generateSamples() {
	console.log('🎙️  Generating MiniMax voice preview samples');
	console.log('============================================');
	console.log(`📁 Output: ${OUTPUT_DIR}`);
	console.log('');

	let successCount = 0;

	for (const { id, name, file, text } of voices) {
		const outputPath = path.join(OUTPUT_DIR, file);
		console.log(`⏳ Generating ${name} (${id})...`);

		try {
			const res = await fetch(`${BASE_URL}/v1/text_to_speech`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${MINIMAX_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'speech-02-turbo',
					text,
					voice_id: id,
					emotion: 'neutral',
					response_format: 'mp3'
				})
			});

			const data = await res.json();

			if (data.base_resp?.status_code !== 0) {
				console.error(`  ❌ Failed: ${data.base_resp?.status_msg}`);
				if (data.base_resp?.status_msg?.includes('rate limit')) {
					console.error('  ⚠️  TPM rate limit still active. Wait a few minutes and retry.');
				}
				continue;
			}

			if (!data.audio_content) {
				console.error(`  ❌ No audio_content in response`);
				continue;
			}

			const buf = Buffer.from(data.audio_content, 'base64');
			fs.writeFileSync(outputPath, buf);
			console.log(`  ✅ Saved ${file} (${buf.length} bytes)`);
			successCount++;

		} catch (error) {
			console.error(`  ❌ Error: ${error.message}`);
		}

		// 15s between requests to stay under TPM limit
		if (successCount < voices.length) {
			await new Promise(r => setTimeout(r, 15000));
		}
	}

	console.log('\n============================================');
	console.log(`✅ ${successCount}/${voices.length} samples generated`);
	if (successCount < voices.length) {
		console.warn('⚠️  Some samples failed. Re-run this script to retry failed voices.');
	}
}

generateSamples();
