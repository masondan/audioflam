import { writable } from 'svelte/store';

// App State
export const splashScreenVisible = writable(true);

// TTS Provider Types
export type TTSProvider = 'yarngpt' | 'azure';

export interface VoiceOption {
	name: string;
	ssmlGender: 'MALE' | 'FEMALE';
	displayName: string;
	description: string;
	provider: TTSProvider;
}

// YarnGPT Nigerian Voices (native, slower ~30s)
export const YARNGPT_VOICES: VoiceOption[] = [
	{ name: 'Idera', ssmlGender: 'FEMALE', displayName: 'Idera', description: 'Nigerian, melodic', provider: 'yarngpt' },
	{ name: 'Tayo', ssmlGender: 'MALE', displayName: 'Tayo', description: 'Nigerian, upbeat', provider: 'yarngpt' },
	{ name: 'Regina', ssmlGender: 'FEMALE', displayName: 'Regina', description: 'Nigerian, mature', provider: 'yarngpt' },
	{ name: 'Femi', ssmlGender: 'MALE', displayName: 'Femi', description: 'Nigerian, reassuring', provider: 'yarngpt' }
];

// Azure TTS Voices (Nigerian + British English)
export const AZURE_VOICES: VoiceOption[] = [
	// Nigerian English
	{ name: 'en-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo (Nigerian)', description: 'Azure Nigerian male', provider: 'azure' },
	{ name: 'en-NG-EzinneNeural', ssmlGender: 'FEMALE', displayName: 'Ezinne (Nigerian)', description: 'Azure Nigerian female', provider: 'azure' },
	// British English
	{ name: 'en-GB-RyanNeural', ssmlGender: 'MALE', displayName: 'Ryan', description: 'British male', provider: 'azure' },
	{ name: 'en-GB-BellaNeural', ssmlGender: 'FEMALE', displayName: 'Bella', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-HollieNeural', ssmlGender: 'FEMALE', displayName: 'Hollie', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-OliverNeural', ssmlGender: 'MALE', displayName: 'Oliver', description: 'British male', provider: 'azure' },
];

// Combined voices for the UI
export const ALL_VOICES: VoiceOption[] = [
	...AZURE_VOICES,
	...YARNGPT_VOICES
];

export const selectedVoice = writable<VoiceOption>(AZURE_VOICES[0]);
export const textInput = writable('');

// Audio State
export const isGenerating = writable(false);
export const audioResult = writable<string | null>(null);
