/**
 * Qwen3-TTS Welsh Voice Enrollment Script
 *
 * Enrolls Ffion (F) and Owain (M) Welsh English voice samples.
 * Passes transcript text to improve clone quality.
 * Stores voice IDs in scripts/voice_ids.json and appends to .env
 *
 * Cost: $0.02 total (2 × $0.01 per enrollment)
 * Requires: QWEN_SPEECH_KEY set in .env
 *
 * Usage:
 *   node --env-file=.env scripts/enroll_welsh_voices.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QWEN_API_KEY = process.env.QWEN_SPEECH_KEY;
const ENROLLMENT_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization';
const TARGET_MODEL = 'qwen3-tts-vc-2026-01-22';
const ENROLLMENT_MODEL = 'qwen-voice-enrollment';

if (!QWEN_API_KEY) {
  console.error('ERROR: QWEN_SPEECH_KEY environment variable not set');
  process.exit(1);
}

// Welsh voices with transcript text for improved clone quality
const VOICES = [
  {
    key: 'wales_female',
    file: 'ffion.wav',
    country: 'Wales',
    gender: 'Female',
    preferredName: 'ffion',
    transcript: fs.readFileSync(
      path.join(__dirname, '..', 'static', 'voice-transcripts', 'ffion_transcript.txt'),
      'utf-8'
    ).trim()
  },
  {
    key: 'wales_male',
    file: 'owain.wav',
    country: 'Wales',
    gender: 'Male',
    preferredName: 'owain',
    transcript: fs.readFileSync(
      path.join(__dirname, '..', 'static', 'voice-transcripts', 'owain_transcript.txt'),
      'utf-8'
    ).trim()
  }
];

const VOICE_IDS_FILE = path.join(__dirname, 'voice_ids.json');
const ENV_FILE = path.join(__dirname, '..', '.env');

// Load existing voice IDs if available
function loadExistingVoiceIds() {
  if (fs.existsSync(VOICE_IDS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VOICE_IDS_FILE, 'utf-8'));
    } catch (err) {
      console.warn(`Warning: Could not parse ${VOICE_IDS_FILE}, starting fresh`);
      return {};
    }
  }
  return {};
}

// Save voice IDs to JSON file (merges with existing)
function saveVoiceIds(voiceIds) {
  fs.writeFileSync(VOICE_IDS_FILE, JSON.stringify(voiceIds, null, 2));
  console.log(`\n✅ Voice IDs saved to ${VOICE_IDS_FILE}`);
}

// Append Welsh voice IDs to .env file
function appendToEnv(voiceIds) {
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  }

  // Remove existing VOICE_WALES_* entries only
  envContent = envContent
    .split('\n')
    .filter(line => !line.startsWith('VOICE_WALES_'))
    .join('\n')
    .trim();

  // Add new Welsh entries
  const newEntries = [
    `VOICE_WALES_FEMALE=${voiceIds.wales_female || ''}`,
    `VOICE_WALES_MALE=${voiceIds.wales_male || ''}`
  ];

  envContent = envContent + '\n\n# Qwen3-TTS Welsh Voice Clone IDs (enrolled via scripts/enroll_welsh_voices.js)\n' + newEntries.join('\n') + '\n';
  fs.writeFileSync(ENV_FILE, envContent);
  console.log(`✅ Voice IDs appended to ${ENV_FILE}`);
}

// Enroll a single voice
async function enrollVoice(voiceConfig, existingIds) {
  const { key, file, country, gender, preferredName, transcript } = voiceConfig;

  // Skip if already enrolled
  if (existingIds[key]) {
    console.log(`\n⏭️  SKIPPED: ${key} (already enrolled: ${existingIds[key]})`);
    return existingIds[key];
  }

  console.log(`\n--- ENROLLING: ${key} (${country} ${gender}) ---`);
  console.log(`File: ${file}`);
  console.log(`Transcript: "${transcript.slice(0, 80)}..."`);

  // Read audio file
  const audioPath = path.join(__dirname, '..', 'static', 'voice-samples', file);
  if (!fs.existsSync(audioPath)) {
    console.error(`❌ ERROR: Audio file not found: ${audioPath}`);
    return null;
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString('base64');
  console.log(`Audio file size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

  // Prepare enrollment request — include transcript text for better clone quality
  const requestBody = {
    model: ENROLLMENT_MODEL,
    input: {
      action: 'create',
      target_model: TARGET_MODEL,
      preferred_name: preferredName,
      language: 'en',
      text: transcript,
      audio: {
        data: `data:audio/wav;base64,${base64Audio}`
      }
    }
  };

  console.log(`Sending enrollment request...`);
  const startTime = Date.now();

  try {
    const response = await fetch(ENROLLMENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    console.log(`Response time: ${elapsed}ms`);
    console.log(`Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ FAILED: HTTP ${response.status}`);
      console.error(`Error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);

    // Check for API error
    if (data.code && data.code !== 'Success') {
      console.error(`❌ FAILED: API error code: ${data.code}`);
      console.error(`Message: ${data.message || 'N/A'}`);
      return null;
    }

    // Extract voice ID
    const voiceId = data.output?.voice;
    if (!voiceId) {
      console.error(`❌ FAILED: No voice ID in response`);
      console.error(`Full response: ${JSON.stringify(data)}`);
      return null;
    }

    console.log(`✅ SUCCESS: Voice ID = ${voiceId}`);
    return voiceId;

  } catch (err) {
    console.error(`❌ NETWORK ERROR: ${err.message}`);
    return null;
  }
}

// Main enrollment flow
async function main() {
  console.log('='.repeat(70));
  console.log('QWEN3-TTS WELSH VOICE ENROLLMENT');
  console.log(`Date:     ${new Date().toISOString()}`);
  console.log(`Endpoint: ${ENROLLMENT_ENDPOINT}`);
  console.log(`API Key:  ${QWEN_API_KEY.slice(0, 12)}...${QWEN_API_KEY.slice(-6)}`);
  console.log(`Target Model: ${TARGET_MODEL}`);
  console.log('='.repeat(70));

  const existingIds = loadExistingVoiceIds();
  const newIds = { ...existingIds };
  let successCount = 0;

  // Enroll each voice
  for (const voiceConfig of VOICES) {
    const voiceId = await enrollVoice(voiceConfig, existingIds);
    if (voiceId) {
      newIds[voiceConfig.key] = voiceId;
      successCount++;
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`ENROLLMENT COMPLETE: ${successCount}/${VOICES.length} voices enrolled`);
  console.log('='.repeat(70));

  if (successCount > 0) {
    saveVoiceIds(newIds);
    appendToEnv(newIds);
    console.log('\n📋 Voice IDs Summary:');
    Object.entries(newIds).forEach(([key, id]) => {
      console.log(`  ${key}: ${id}`);
    });
    console.log('\n📝 Next steps:');
    console.log('  1. Copy the wales_female and wales_male IDs above');
    console.log('  2. Add them to QWEN_VOICES in src/lib/stores.ts');
    console.log('  3. Add Welsh flag support to src/lib/components/VoiceDropdown.svelte');
  } else {
    console.error('\n❌ No voices were successfully enrolled. Check errors above.');
    process.exit(1);
  }
}

main();
