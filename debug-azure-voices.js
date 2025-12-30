import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

if (!key || !region) {
    console.error("Missing keys in .env");
    process.exit(1);
}

console.log(`Checking region: ${region}`);

const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

function listVoices() {
    return new Promise((resolve, reject) => {
        synthesizer.getVoicesAsync(
            "", // empty locale
            (result) => {
                if (result.reason === sdk.ResultReason.VoicesListRetrieved) {
                    console.log(`Found ${result.voices.length} voices.`);
                    const relevant = result.voices.filter(v => v.locale.includes("NG"));
                    relevant.forEach(v => console.log(`- ${v.name} (${v.shortName})`));
                    resolve(result.voices);
                } else {
                    console.error("Error: " + result.errorDetails);
                    reject(result.errorDetails);
                }
                synthesizer.close();
            },
            (err) => {
                console.error("Fatal: " + err);
                synthesizer.close();
                reject(err);
            }
        );
    });
}

listVoices()
    .then(() => console.log("Done"))
    .catch((e) => console.error(e));
