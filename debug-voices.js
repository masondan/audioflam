import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

async function listVoices() {
    const url = `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.voices) {
            console.log("No voices found");
            return;
        }

        const hausa = data.voices.filter(v =>
            v.languageCodes.some(c => c.toLowerCase().includes('ha')) ||
            v.name.toLowerCase().includes('hausa')
        );

        const yoruba = data.voices.filter(v =>
            v.languageCodes.some(c => c.toLowerCase().includes('yo')) ||
            v.name.toLowerCase().includes('yoruba')
        );

        const nigeria = data.voices.filter(v =>
            v.languageCodes.some(c => c.toLowerCase().includes('ng')) ||
            v.name.toLowerCase().includes('nigeria')
        );

        console.log(`Hausa matches: ${hausa.length}`);
        if (hausa.length > 0) console.log(JSON.stringify(hausa, null, 2));

        console.log(`Yoruba matches: ${yoruba.length}`);
        if (yoruba.length > 0) console.log(JSON.stringify(yoruba, null, 2));

        console.log(`Nigeria (NG) matches: ${nigeria.length}`);
        // We already know this was 0, but checking again with stricter/looser logic

    } catch (e) {
        console.error(e);
    }
}

listVoices();
