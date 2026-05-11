/**
 * Qwen3-TTS Voice Enrollment Script
 * 
 * Enrolls 4 voice samples to create permanent voice clones.
 * Stores voice IDs in scripts/voice_ids.json and appends to .env
 * 
 * Cost: $0.04 total (4 × $0.01 per enrollment)
 * Requires: Payment method added to Alibaba Cloud account
 * 
 * Usage:
 *   node --env-file=.env scripts/enroll_voices.js
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

// Voice identity map (corrected: Mercy=Female, Tawanda=Male per MiniMax definitions)
const VOICES = [
  { key: 'malawi_female', file: 'chisomo.wav', country: 'Malawi', gender: 'Female' },
  { key: 'malawi_male', file: 'mercy.wav', country: 'Malawi', gender: 'Male' },
  { key: 'zim_female', file: 'tawanda.wav', country: 'Zimbabwe', gender: 'Female' },
  { key: 'zim_male', file: 'precious.wav', country: 'Zimbabwe', gender: 'Male' }
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

// Save voice IDs to JSON file
function saveVoiceIds(voiceIds) {
  fs.writeFileSync(VOICE_IDS_FILE, JSON.stringify(voiceIds, null, 2));
  console.log(`\n✅ Voice IDs saved to ${VOICE_IDS_FILE}`);
}

// Append voice IDs to .env file
function appendToEnv(voiceIds) {
  let envContent = '';
  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  }

  // Remove existing VOICE_* entries
  envContent = envContent
    .split('\n')
    .filter(line => !line.startsWith('VOICE_MALAWI_') && !line.startsWith('VOICE_ZIM_'))
    .join('\n')
    .trim();

  // Add new entries
  const newEntries = [
    `VOICE_MALAWI_FEMALE=${voiceIds.malawi_female || ''}`,
    `VOICE_MALAWI_MALE=${voiceIds.malawi_male || ''}`,
    `VOICE_ZIM_FEMALE=${voiceIds.zim_female || ''}`,
    `VOICE_ZIM_MALE=${voiceIds.zim_male || ''}`
  ];

  envContent = envContent + '\n\n# Qwen3-TTS Voice Clone IDs (enrolled via scripts/enroll_voices.js)\n' + newEntries.join('\n');
  fs.writeFileSync(ENV_FILE, envContent);
  console.log(`✅ Voice IDs appended to ${ENV_FILE}`);
}

// Enroll a single voice
async function enrollVoice(voiceConfig, existingIds) {
  const { key, file, country, gender } = voiceConfig;

  // Skip if already enrolled
  if (existingIds[key]) {
    console.log(`\n⏭️  SKIPPED: ${key} (already enrolled: ${existingIds[key]})`);
    return existingIds[key];
  }

  console.log(`\n--- ENROLLING: ${key} (${country} ${gender}) ---`);
  console.log(`File: ${file}`);

  // Read audio file
  const audioPath = path.join(__dirname, '..', 'static', 'voice-samples', file);
  if (!fs.existsSync(audioPath)) {
    console.error(`❌ ERROR: Audio file not found: ${audioPath}`);
    return null;
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const base64Audio = audioBuffer.toString('base64');
  console.log(`Audio file size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);

  // Prepare enrollment request
  const requestBody = {
    model: ENROLLMENT_MODEL,
    input: {
      action: 'create',
      target_model: TARGET_MODEL,
      preferred_name: key.split('_')[0],  // Use just the first part: "malawi", "zim"
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
  console.log('QWEN3-TTS VOICE ENROLLMENT');
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
  } else {
    console.error('\n❌ No voices were successfully enrolled. Check errors above.');
    process.exit(1);
  }
}

main();
