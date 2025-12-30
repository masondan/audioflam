import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

async function testGender(lang, gender, text) {
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const body = {
        input: { text },
        voice: {
            languageCode: lang,
            ssmlGender: gender // MALE or FEMALE
        },
        audioConfig: {
            audioEncoding: 'MP3'
        }
    };

    console.log(`Testing ${lang} (${gender})...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const data = await response.json();
            // Just checking if it works. Note: We can't easily hear the difference in a script result, 
            // but success means the API accepted the gender constraint.
            console.log(`✅ SUCCESS`);
        } else {
            console.log(`❌ FAILED`);
        }
    } catch (e) {
        console.error(e);
    }
}

async function run() {
    await testGender('en-NG', 'MALE', 'Hello');
    await testGender('en-NG', 'FEMALE', 'Hello');
    await testGender('ha-NG', 'MALE', 'Sannu');
    await testGender('ha-NG', 'FEMALE', 'Sannu');
}

run();
