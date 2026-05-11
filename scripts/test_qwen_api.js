/**
 * Qwen3-TTS API Smoke Test
 * 
 * Tests basic API connectivity with a system voice (no cloning).
 * Uses free quota: qwen3-tts-vc-realtime-2026-01-15
 * 
 * Usage:
 *   node --env-file=.env scripts/test_qwen_api.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QWEN_API_KEY = process.env.QWEN_SPEECH_KEY;
const SYNTHESIS_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

if (!QWEN_API_KEY) {
  console.error('ERROR: QWEN_SPEECH_KEY environment variable not set');
  process.exit(1);
}

async function testQwenAPI() {
  console.log('='.repeat(70));
  console.log('QWEN3-TTS API SMOKE TEST');
  console.log(`Date:     ${new Date().toISOString()}`);
  console.log(`Endpoint: ${SYNTHESIS_ENDPOINT}`);
  console.log(`API Key:  ${QWEN_API_KEY.slice(0, 12)}...${QWEN_API_KEY.slice(-6)} (${QWEN_API_KEY.length} chars)`);
  console.log('='.repeat(70));

  const testText = 'Hello, this is a test.';
  const testVoice = 'Cherry';
  const testModel = 'qwen3-tts-flash';

  console.log(`\nTest Parameters:`);
  console.log(`  Model:  ${testModel}`);
  console.log(`  Voice:  ${testVoice}`);
  console.log(`  Text:   "${testText}"`);
  console.log(`  Language: English`);

  const requestBody = {
    model: testModel,
    input: {
      text: testText,
      voice: testVoice,
      language_type: 'English'
    }
  };

  console.log(`\nSending request...`);
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
    const outputPath = path.join(__dirname, 'test_qwen_output.wav');
    fs.writeFileSync(outputPath, Buffer.from(audioData));
    const fileSizeKB = (audioData.byteLength / 1024).toFixed(1);

    console.log(`\n✅ SUCCESS`);
    console.log(`  File saved:   ${outputPath}`);
    console.log(`  File size:    ${fileSizeKB} KB`);
    console.log(`\n` + '='.repeat(70));

  } catch (err) {
    console.log(`\n❌ NETWORK ERROR: ${err.message}`);
    console.log(`\n` + '='.repeat(70));
    process.exit(1);
  }
}

testQwenAPI();
