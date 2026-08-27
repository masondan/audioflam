// Re-clone all 6 production voices under the new voice-enrollment API
// (target_model: qwen-audio-3.0-tts-flash), replacing the retiring
// qwen3-tts-vc-2026-01-22 enrollments.
//
// Run with: node --env-file=.env scripts/reclone_production_voices.js
import { AwsClient } from 'aws4fetch';
import { readFile, writeFile } from 'node:fs/promises';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, QWEN_SPEECH_KEY } = process.env;

const client = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

// prefix: alphanumeric only, max 10 chars
const VOICES = [
  { key: 'chisomo', prefix: 'chisomo', file: 'static/voice-samples/chisomo.wav' },
  { key: 'mercy', prefix: 'mercy', file: 'static/voice-samples/mercy.wav' },
  { key: 'tawanda', prefix: 'tawanda', file: 'static/voice-samples/tawanda.wav' },
  { key: 'precious', prefix: 'precious', file: 'static/voice-samples/precious.wav' },
  { key: 'ffion', prefix: 'ffion', file: 'static/voice-samples/ffion.wav' },
  { key: 'owain', prefix: 'owain', file: 'static/voice-samples/owain.wav' },
];

async function uploadAndEnroll({ key, prefix, file }) {
  const fileBuf = await readFile(file);
  const filename = `${prefix}-prod-${Date.now()}.wav`;
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${filename}`;

  console.log(`\n[${key}] Uploading ${file} to R2...`);
  const putRes = await client.fetch(endpoint, {
    method: 'PUT',
    body: fileBuf,
    headers: { 'Content-Type': 'audio/wav' },
  });
  if (!putRes.ok) {
    throw new Error(`[${key}] R2 upload failed: ${putRes.status} ${await putRes.text()}`);
  }

  const publicUrl = `${R2_PUBLIC_URL}/${filename}`;
  await new Promise((r) => setTimeout(r, 300));

  console.log(`[${key}] Enrolling voice (prefix=${prefix})...`);
  const enrollRes = await fetch('https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${QWEN_SPEECH_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voice-enrollment',
      input: {
        action: 'create_voice',
        target_model: 'qwen-audio-3.0-tts-flash',
        prefix,
        url: publicUrl,
        language_hints: ['en'],
      },
    }),
  });

  const enrollData = await enrollRes.json();

  // Cleanup R2 object regardless of outcome
  await client.fetch(endpoint, { method: 'DELETE' });

  if (!enrollRes.ok || !enrollData?.output?.voice_id) {
    throw new Error(`[${key}] Enrollment failed: ${JSON.stringify(enrollData)}`);
  }

  console.log(`[${key}] ✅ voice_id: ${enrollData.output.voice_id}`);
  return enrollData.output.voice_id;
}

const results = {};
for (const voice of VOICES) {
  try {
    results[voice.key] = await uploadAndEnroll(voice);
  } catch (err) {
    console.error(err.message);
    results[voice.key] = null;
  }
}

console.log('\n\n=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));

await writeFile('scripts/new_voice_ids.json', JSON.stringify(results, null, 2));
console.log('\nSaved to scripts/new_voice_ids.json');

const failed = Object.entries(results).filter(([, v]) => !v);
if (failed.length > 0) {
  console.error(`\n❌ ${failed.length} voice(s) failed: ${failed.map(([k]) => k).join(', ')}`);
  process.exit(1);
} else {
  console.log('\n✅ All 6 voices re-enrolled successfully.');
}
