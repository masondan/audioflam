import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

async function checkBeta() {
    console.log("Checking v1beta1...");
    const url = `https://texttospeech.googleapis.com/v1beta1/voices?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.voices) {
            console.log("No beta voices found");
            return;
        }

        const nigeria = data.voices.filter(v =>
            v.languageCodes.some(c => c.includes('NG')) ||
            v.name.includes('Nigeria')
        );

        const sa = data.voices.filter(v => v.languageCodes.some(c => c.includes('ZA')));

        console.log(`v1beta1 Total: ${data.voices.length}`);
        console.log(`Nigeria Matches: ${nigeria.length}`);
        console.log(`South Africa Matches: ${sa.length}`);

        if (nigeria.length > 0) {
            console.log("Found Nigerian voices in BETA:");
            console.log(JSON.stringify(nigeria, null, 2));
        }

    } catch (e) {
        console.error(e);
    }
}

checkBeta();
