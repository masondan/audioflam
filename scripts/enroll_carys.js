// "Carys" voice enrollment — replaces the retired "Ffion" Welsh voice.
//
// Background: Ffion's enrollment (20.35s reference clip, no enable_preprocess)
// suffered from an intermittent bug where fragments of its own enrollment
// audio ("Explore the ice-carved slopes...") leaked into unrelated synthesis
// output. Root cause confirmed via raw-WAV-dump diagnostics — see AGENTS.md
// "Recently Fixed" for full history. Carys was enrolled as a controlled fix
// using two changes simultaneously (not isolated, but both are proven-safe
// practices worth keeping regardless):
//   - a short (<=10s), manually trimmed, clean reference clip that avoids any
//     short/distinctive opening phrase
//   - enable_preprocess: true (noise reduction/enhancement/normalization of
//     the reference sample before cloning — was omitted, defaulting to
//     false, for all 6 original production voices)
//   - enable_volume_normalization: 'false' (explicit string, per docs — left
//     disabled; not implicated in the bug)
//
// Confirmed clean across 20+ test generations (including phrases deliberately
// echoing Carys's own enrollment transcript) — voice_id is now live in
// src/lib/stores.ts as "Carys (Wales)", replacing Ffion everywhere in the app.
// Ffion's old voice_id is retired and unused.
//
// Run with: node --env-file=.env scripts/enroll_carys.js
import { AwsClient } from 'aws4fetch';
import { readFile, writeFile } from 'node:fs/promises';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL, QWEN_SPEECH_KEY } = process.env;

const client = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

const KEY = 'carys';
const PREFIX = 'carys';
const FILE = 'static/voice-samples/carys.wav';

async function uploadAndEnroll() {
  const fileBuf = await readFile(FILE);
  const filename = `${PREFIX}-test-${Date.now()}.wav`;
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${filename}`;

  console.log(`[${KEY}] Uploading ${FILE} to R2...`);
  const putRes = await client.fetch(endpoint, {
    method: 'PUT',
    body: fileBuf,
    headers: { 'Content-Type': 'audio/wav' },
  });
  if (!putRes.ok) {
    throw new Error(`[${KEY}] R2 upload failed: ${putRes.status} ${await putRes.text()}`);
  }

  const publicUrl = `${R2_PUBLIC_URL}/${filename}`;
  await new Promise((r) => setTimeout(r, 300));

  console.log(`[${KEY}] Enrolling voice (prefix=${PREFIX}, enable_preprocess=true)...`);
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
        prefix: PREFIX,
        url: publicUrl,
        language_hints: ['en'],
        enable_preprocess: true,
        enable_volume_normalization: 'false',
      },
    }),
  });

  const enrollData = await enrollRes.json();

  // Cleanup R2 object regardless of outcome
  await client.fetch(endpoint, { method: 'DELETE' });

  if (!enrollRes.ok || !enrollData?.output?.voice_id) {
    throw new Error(`[${KEY}] Enrollment failed: ${JSON.stringify(enrollData)}`);
  }

  console.log(`[${KEY}] ✅ voice_id: ${enrollData.output.voice_id}`);
  return enrollData.output.voice_id;
}

try {
  const voiceId = await uploadAndEnroll();
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify({ carys: voiceId }, null, 2));
  await writeFile('scripts/carys_voice_id.json', JSON.stringify({ carys: voiceId, enrolledAt: new Date().toISOString() }, null, 2));
  console.log('\nSaved to scripts/carys_voice_id.json');
  console.log('\nNOTE: remember to update the voice_id in src/lib/stores.ts (QWEN_WELSH_VOICES)');
  console.log('if this is a re-enrollment. Test directly first via POST /api/tts with');
  console.log('{ text, voiceName: "' + voiceId + '", provider: "qwen" }');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
