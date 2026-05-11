/**
 * MiniMax TTS API Diagnostic Test Script
 * 
 * Usage:
 *   node --env-file=.env scripts/minimax-test.js
 * 
 * Or with key inline:
 *   MINIMAX_SPEECH_KEY=your_key MINIMAX_GROUP_ID=your_group_id node scripts/minimax-test.js
 */

const API_KEY = process.env.MINIMAX_SPEECH_KEY;
const GROUP_ID = process.env.MINIMAX_GROUP_ID || '2047407150375903982';
const BASE_URL = 'https://api.minimax.io/v1/text_to_speech';

if (!API_KEY) {
  console.error('ERROR: MINIMAX_SPEECH_KEY environment variable not set');
  process.exit(1);
}

async function testVoice(label, voiceId) {
  console.log(`\n--- TEST: ${label} (voice_id: ${voiceId}) ---`);
  console.log(`Endpoint: ${BASE_URL}?GroupId=${GROUP_ID}`);
  console.log(`Model: speech-02`);
  console.log(`Text: "Hello, this is a test message."`);
  console.log(`Sending request...`);

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}?GroupId=${GROUP_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'speech-02',
        text: 'Hello, this is a test message.',
        voice_id: voiceId,
        emotion: 'neutral',
        response_format: 'mp3'
      })
    });

    const elapsed = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || '';
    const traceId = response.headers.get('trace-id') || 'N/A';
    const requestId = response.headers.get('minimax-request-id') || 'N/A';

    console.log(`HTTP Status:    ${response.status}`);
    console.log(`Content-Type:   ${contentType}`);
    console.log(`Trace-ID:       ${traceId}`);
    console.log(`Request-ID:     ${requestId}`);
    console.log(`Response Time:  ${elapsed}ms`);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log(`Response Body:  ${JSON.stringify(data)}`);

      if (data.base_resp) {
        const code = data.base_resp.status_code;
        const msg = data.base_resp.status_msg;
        if (code === 0) {
          const audioLen = data.audio_content ? data.audio_content.length : 0;
          console.log(`RESULT: ✅ SUCCESS - Audio received (${audioLen} base64 chars)`);
        } else {
          console.log(`RESULT: ❌ FAILED - status_code: ${code}, message: "${msg}"`);
        }
      }
    } else {
      // Binary audio response
      const buffer = await response.arrayBuffer();
      console.log(`Response Body:  [Binary audio data, ${buffer.byteLength} bytes]`);
      console.log(`RESULT: ✅ SUCCESS - Binary audio received`);
    }

  } catch (err) {
    console.log(`RESULT: ❌ NETWORK ERROR - ${err.message}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('MINIMAX TTS API DIAGNOSTIC TEST');
  console.log(`Date:     ${new Date().toISOString()}`);
  console.log(`GroupID:  ${GROUP_ID}`);
  console.log(`API Key:  ${API_KEY.slice(0, 12)}...${API_KEY.slice(-6)} (${API_KEY.length} chars)`);
  console.log('='.repeat(60));

  // Test 1: Built-in voice
  await testVoice('Built-in Voice (Calm_Woman)', 'Calm_Woman');

  // Small delay between requests
  await new Promise(r => setTimeout(r, 1000));

  // Test 2: Cloned voice
  await testVoice('Cloned Voice (chisomom01 - Malawi English male)', 'chisomom01');

  console.log('\n' + '='.repeat(60));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(60));
}

main();
