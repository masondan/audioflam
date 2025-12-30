import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

async function listAllVoices() {
    const url = `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.voices) {
            console.log("No voices found");
            return;
        }

        console.log(`Total voices: ${data.voices.length}`);

        // Write to file
        fs.writeFileSync('all_voices.json', JSON.stringify(data.voices, null, 2));
        console.log("Saved to all_voices.json");

    } catch (e) {
        console.error(e);
    }
}

listAllVoices();
