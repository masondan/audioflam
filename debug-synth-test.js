import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

if (!key || !region) {
    console.error("Missing keys");
    process.exit(1);
}

const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
// Output to null (don't play audio, just check success)
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

const voicesToTest = [
    "ha-NG-AminaNeural",
    "ha-NG-BelloNeural",
    "en-NG-EzinneNeural",
    "en-NG-AbeoNeural",
    "en-US-JennyNeural" // Control: Should definitely work
];

async function testVoice(voiceName) {
    return new Promise((resolve) => {
        speechConfig.speechSynthesisVoiceName = voiceName;
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null); // null audio config

        console.log(`Testing: ${voiceName}...`);

        synthesizer.speakTextAsync(
            "Test",
            (result) => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    console.log(`✅ SUCCESS: ${voiceName}`);
                } else if (result.reason === sdk.ResultReason.Canceled) {
                    console.log(`❌ FAILED: ${voiceName} - ${result.errorDetails}`);
                }
                synthesizer.close();
                resolve();
            },
            (err) => {
                console.log(`❌ ERROR: ${voiceName} - ${err}`);
                synthesizer.close();
                resolve();
            }
        );
    });
}

async function run() {
    for (const v of voicesToTest) {
        await testVoice(v);
    }
}

await run();
process.exit(0);
