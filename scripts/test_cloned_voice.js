/**
 * Qwen3-TTS Cloned Voice Synthesis Test
 * 
 * Tests voice cloning by synthesizing audio with an enrolled voice.
 * Reads voice IDs from scripts/voice_ids.json
 * 
 * Usage:
 *   node --env-file=.env scripts/test_cloned_voice.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QWEN_API_KEY = process.env.QWEN_SPEECH_KEY;
const SYNTHESIS_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const SYNTHESIS_MODEL = 'qwen3-tts-vc-2026-01-22';
const VOICE_IDS_FILE = path.join(__dirname, 'voice_ids.json');

if (!QWEN_API_KEY) {
  console.error('ERROR: QWEN_SPEECH_KEY environment variable not set');
  process.exit(1);
}

if (!fs.existsSync(VOICE_IDS_FILE)) {
  console.error(`ERROR: Voice IDs file not found: ${VOICE_IDS_FILE}`);
  console.error('Run scripts/enroll_voices.js first to create voice clones.');
  process.exit(1);
}

// Load voice IDs
let voiceIds;
try {
  voiceIds = JSON.parse(fs.readFileSync(VOICE_IDS_FILE, 'utf-8'));
} catch (err) {
  console.error(`ERROR: Could not parse ${VOICE_IDS_FILE}`);
  process.exit(1);
}

if (!voiceIds.malawi_female) {
  console.error('ERROR: malawi_female voice ID not found in voice_ids.json');
  process.exit(1);
}

// Test synthesis with cloned voice
async function testClonedVoice() {
  console.log('='.repeat(70));
  console.log('QWEN3-TTS CLONED VOICE SYNTHESIS TEST');
  console.log(`Date:     ${new Date().toISOString()}`);
  console.log(`Endpoint: ${SYNTHESIS_ENDPOINT}`);
  console.log(`Model:    ${SYNTHESIS_MODEL}`);
  console.log('='.repeat(70));

  const testText = 'Good morning. Today we will practice interviewing a government official.';
  const voiceId = voiceIds.malawi_female;

  console.log(`\nTest Parameters:`);
  console.log(`  Voice ID: ${voiceId}`);
  console.log(`  Text:     "${testText}"`);
  console.log(`  Length:   ${testText.length} characters`);

  const requestBody = {
    model: SYNTHESIS_MODEL,
    input: {
      text: testText,
      voice: voiceId,
      language_type: 'English'
    }
  };

  console.log(`\nSending synthesis request...`);
  const startTime = Date.now();

  try {
    const response = await fetch(SYNTHESIS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';

    console.log(`\nResponse:`);
    console.log(`  Status:       ${response.status}`);
    console.log(`  Content-Type: ${contentType}`);
    console.log(`  Time:         ${elapsed}ms`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`  Body:         ${errorText}`);
      console.log(`\n❌ FAILED: HTTP ${response.status}`);
      process.exit(1);
    }

    // Parse response
    let audioUrl = null;
    let audioData = null;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log(`  Body (JSON):  ${JSON.stringify(data, null, 2)}`);

      // Check for error in response
      if (data.code && data.code !== 'Success') {
        console.log(`\n❌ FAILED: API returned error code: ${data.code}`);
        console.log(`   Message: ${data.message || 'N/A'}`);
        process.exit(1);
      }

      // Extract audio URL from output
      if (data.output && data.output.audio && data.output.audio.url) {
        audioUrl = data.output.audio.url;
      }
    } else {
      // Binary response
      audioData = await response.arrayBuffer();
      console.log(`  Body:         [Binary audio data, ${audioData.byteLength} bytes]`);
    }

    if (!audioUrl && !audioData) {
      console.log(`\n❌ FAILED: No audio URL or data in response`);
      process.exit(1);
    }

    // If we got a URL, download the audio
    if (audioUrl) {
      console.log(`\nAudio URL received: ${audioUrl}`);
      console.log(`Downloading audio...`);

      const downloadStart = Date.now();
      const audioResponse = await fetch(audioUrl);
      const downloadElapsed = Date.now() - downloadStart;

      if (!audioResponse.ok) {
        console.log(`\n❌ FAILED: Could not download audio from URL (HTTP ${audioResponse.status})`);
        process.exit(1);
      }

      audioData = await audioResponse.arrayBuffer();
      console.log(`  Downloaded:   ${audioData.byteLength} bytes in ${downloadElapsed}ms`);
    }

    // Save audio file
    const outputPath = path.join(__dirname, 'test_clone_output.wav');
    fs.writeFileSync(outputPath, Buffer.from(audioData));
    const fileSizeKB = (audioData.byteLength / 1024).toFixed(1);

    console.log(`\n✅ SUCCESS`);
    console.log(`  File saved:   ${outputPath}`);
    console.log(`  File size:    ${fileSizeKB} KB`);
    console.log(`\n📝 Next steps:`);
    console.log(`  1. Listen to ${outputPath} to verify voice quality`);
    console.log(`  2. Confirm the voice sounds like the original sample`);
    console.log(`  3. If satisfied, proceed to Phase 2 (backend integration)`);
    console.log(`\n` + '='.repeat(70));

  } catch (err) {
    console.log(`\n❌ NETWORK ERROR: ${err.message}`);
    console.log(`\n` + '='.repeat(70));
    process.exit(1);
  }
}

testClonedVoice();
