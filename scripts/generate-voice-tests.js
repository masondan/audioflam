#!/usr/bin/env node
/**
 * Generate test MP3s for all YarnGPT voices
 * Usage: node scripts/generate-voice-tests.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = __dirname;

const TEST_SCRIPT = `Nigeria has imposed a seven-year ban on new federal universities. Here's why.
According to Education Minister Tunji Alausa, a rapid rise in new schools has hit budgets and teaching quality.
He said Nigeria already has 72 federal, 108 state and 159 private universities, but many struggle with low student numbers. One northern university is reported to have fewer than 800 students and over 1,200 staff.
Unions insist that funding cuts have led to dire conditions for lecturers and students across the country.
So instead of building new universities, the Government plans to funnel cash into upgrading facilities, hiring qualified teachers and raising standards.`;

const YARN_VOICES = ['Idera', 'Tayo', 'Regina', 'Femi'];

async function generateVoiceTests() {
	const timestamp = new Date().toISOString().slice(0, 10);

	console.log('\n🎤 Generating YarnGPT voice test files...');
	console.log('Output: ' + outputDir + '\n');

	let count = 0;

	for (const voice of YARN_VOICES) {
		try {
			process.stdout.write(`[${count + 1}/4] ${voice}... `);

			const response = await fetch('http://localhost:5174/api/tts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: TEST_SCRIPT,
					voiceName: voice,
					provider: 'yarngpt'
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();
			const buffer = Buffer.from(data.audioContent, 'base64');
			const filename = `voice-test-${voice}-${timestamp}.mp3`;
			const filepath = path.join(outputDir, filename);
			fs.writeFileSync(filepath, buffer);

			console.log(`✅ (${(buffer.length / 1024).toFixed(0)} KB)`);
			count++;
		} catch (error) {
			console.log(`❌ ${error.message}`);
		}
	}

	console.log(`\n✨ Generated ${count}/4 files in ${outputDir}\n`);
}

generateVoiceTests();
