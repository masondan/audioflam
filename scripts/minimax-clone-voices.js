/**
 * MiniMax Voice Cloning Script
 * Two-step process: (1) upload WAV file → get file_id, (2) clone voice with file_id
 *
 * API notes discovered during implementation (April 2026):
 * - Base URL: https://api.minimax.io (international, NOT api.minimax.chat which is China)
 * - voice_id: minimum 10 chars, alphanumeric only (no underscores, no hyphens)
 * - file_id: send as number (not string) in clone request
 * - Requires paid subscription (Standard tier or above) for voice cloning
 *
 * Usage:
 *   node --env-file=.env scripts/minimax-clone-voices.js
 *
 * Current cloned voice IDs (April 2026):
 *   chisomom01  — Chisomo, Malawi English male
 *   mercyf0001  — Mercy, Malawi English female
 *   tawandam01  — Tawanda, Zimbabwe English male
 *   preciousf1  — Precious, Zimbabwe English female
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MINIMAX_API_KEY = process.env.MINIMAX_SPEECH_KEY || process.env.MINIMAX_API_KEY;
const VOICE_SAMPLES_DIR = path.join(__dirname, '..', 'static', 'voice-samples');
const BASE_URL = 'https://api.minimax.io';

if (!MINIMAX_API_KEY) {
	console.error('❌ Error: MINIMAX_SPEECH_KEY not found in environment.');
	console.error('   Run with: node --env-file=.env scripts/minimax-clone-voices.js');
	process.exit(1);
}

// voice_id rules: min 10 chars, alphanumeric only (no underscores/hyphens)
const voiceFiles = [
	{ file: 'chisomo.wav', voiceId: 'chisomom01', name: 'Chisomo', gender: 'MALE' },
	{ file: 'mercy.wav',   voiceId: 'mercyf0001', name: 'Mercy',   gender: 'FEMALE' },
	{ file: 'tawanda.wav', voiceId: 'tawandam01', name: 'Tawanda', gender: 'MALE' },
	{ file: 'precious.wav',voiceId: 'preciousf1', name: 'Precious',gender: 'FEMALE' }
];

async function uploadFile(filePath, fileName) {
	const buf = fs.readFileSync(filePath);
	const formData = new FormData();
	formData.append('file', new Blob([buf], { type: 'audio/wav' }), fileName);
	formData.append('purpose', 'voice_clone');

	const response = await fetch(`${BASE_URL}/v1/files/upload`, {
		method: 'POST',
		headers: { 'Authorization': `Bearer ${MINIMAX_API_KEY}` },
		body: formData
	});

	const data = await response.json();
	if (data.base_resp?.status_code !== 0) {
		throw new Error(`File upload failed: ${data.base_resp?.status_msg}`);
	}
	// Return as number (required by voice_clone endpoint)
	return data.file.file_id;
}

async function cloneVoice(fileId, voiceId) {
	const response = await fetch(`${BASE_URL}/v1/voice_clone`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${MINIMAX_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			file_id: fileId,   // number, not string
			voice_id: voiceId  // min 10 chars, alphanumeric only
		})
	});

	const data = await response.json();
	if (data.base_resp?.status_code !== 0) {
		throw new Error(`Voice clone failed: ${data.base_resp?.status_msg}`);
	}
	return voiceId;
}

async function cloneAllVoices() {
	console.log('🎙️  MiniMax Voice Cloning Script');
	console.log('=================================');
	console.log(`📁 Samples: ${VOICE_SAMPLES_DIR}`);
	console.log(`🔑 Key: ${MINIMAX_API_KEY.slice(0, 15)}...`);
	console.log('');

	// Verify all files exist
	for (const { file } of voiceFiles) {
		const filePath = path.join(VOICE_SAMPLES_DIR, file);
		if (!fs.existsSync(filePath)) {
			console.error(`❌ File not found: ${filePath}`);
			process.exit(1);
		}
	}
	console.log('✅ All 4 WAV files found\n');

	const results = [];

	for (const { file, voiceId, name, gender } of voiceFiles) {
		const filePath = path.join(VOICE_SAMPLES_DIR, file);
		console.log(`⏳ Processing ${name} (${gender})...`);

		try {
			// Step 1: Upload file
			console.log(`   Step 1: Uploading ${file}...`);
			const fileId = await uploadFile(filePath, file);
			console.log(`   ✅ Uploaded → file_id: ${fileId}`);

			await new Promise(r => setTimeout(r, 2000));

			// Step 2: Clone voice
			console.log(`   Step 2: Cloning as voice_id: "${voiceId}"...`);
			await cloneVoice(fileId, voiceId);
			console.log(`   ✅ Cloned → voice_id: ${voiceId}`);

			results.push({ name, gender, voiceId });
			console.log('');

		} catch (error) {
			console.error(`❌ ${name}: ${error.message}`);
			console.log('');
		}

		await new Promise(r => setTimeout(r, 2000));
	}

	console.log('=================================');
	console.log('📋 SUMMARY — Lines for MINIMAX_VOICES in src/lib/stores.ts:');
	console.log('=================================\n');

	if (results.length === 0) {
		console.error('❌ No voices cloned. Check errors above.');
		process.exit(1);
	}

	results.forEach(({ name, voiceId, gender }) => {
		const label = name === 'Chisomo' ? 'Malawi English male' :
		              name === 'Mercy'   ? 'Malawi English female' :
		              name === 'Tawanda' ? 'Zimbabwe English male' :
		                                  'Zimbabwe English female';
		console.log(`  { name: '${voiceId}', ssmlGender: '${gender}', displayName: '${name}', description: '${label}', provider: 'minimax' },`);
	});

	console.log('\n=================================');
	if (results.length < 4) {
		console.warn(`⚠️  Only ${results.length}/4 voices cloned.`);
	} else {
		console.log('✅ All 4 voices cloned successfully!');
	}
	console.log('\nAlso update VOICE_IDS in src/routes/api/minimax-refresh/+server.ts');

	return results;
}

cloneAllVoices();
