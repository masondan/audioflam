import { AZURE_SPEECH_KEY, AZURE_SPEECH_REGION } from '$env/static/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { text, voiceName } = await request.json();

		if (!text) {
			return json({ error: 'Text is required' }, { status: 400 });
		}
		if (!voiceName) {
			return json({ error: 'Voice Name is required' }, { status: 400 });
		}

		if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
			console.error('AZURE credentials missing');
			return json({ error: 'Server configuration error' }, { status: 500 });
		}

		// Configure Azure Speech
		const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
		speechConfig.speechSynthesisVoiceName = voiceName;
		speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

		// Create Synthesizer
		const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

		return new Promise((resolve) => {
			synthesizer.speakTextAsync(
				text,
				(result) => {
					if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
						// Success: return audio buffer
						const audioBuffer = result.audioData;
						const base64Audio = Buffer.from(audioBuffer).toString('base64');
						synthesizer.close();
						resolve(json({ audioContent: base64Audio }));
					} else {
						console.error('Speech synthesis canceled/failed:', result.errorDetails);
						synthesizer.close();
						resolve(json({ error: 'Synthesis failed', details: result.errorDetails }, { status: 500 }));
					}
				},
				(err) => {
					console.error('SDK Error:', err);
					synthesizer.close();
					resolve(json({ error: 'SDK Error' }, { status: 500 }));
				}
			);
		});

	} catch (error) {
		console.error('Server Error:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
