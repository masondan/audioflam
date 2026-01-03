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
	{ name: 'Idera', ssmlGender: 'FEMALE', displayName: 'Idera', description: 'Melodic, gentle', provider: 'yarngpt' },
	{ name: 'Chinenye', ssmlGender: 'FEMALE', displayName: 'Chinenye', description: 'Engaging, warm', provider: 'yarngpt' },
	{ name: 'Jude', ssmlGender: 'MALE', displayName: 'Jude', description: 'Warm, confident', provider: 'yarngpt' },
	{ name: 'Emma', ssmlGender: 'MALE', displayName: 'Emma', description: 'Authoritative, deep', provider: 'yarngpt' },
	{ name: 'Umar', ssmlGender: 'MALE', displayName: 'Umar', description: 'Calm, smooth', provider: 'yarngpt' },
	{ name: 'Zainab', ssmlGender: 'FEMALE', displayName: 'Zainab', description: 'Soothing, gentle', provider: 'yarngpt' },
	{ name: 'Osagie', ssmlGender: 'MALE', displayName: 'Osagie', description: 'Smooth, calm', provider: 'yarngpt' },
	{ name: 'Remi', ssmlGender: 'FEMALE', displayName: 'Remi', description: 'Melodious, warm', provider: 'yarngpt' },
	{ name: 'Tayo', ssmlGender: 'MALE', displayName: 'Tayo', description: 'Upbeat, energetic', provider: 'yarngpt' },
	{ name: 'Regina', ssmlGender: 'FEMALE', displayName: 'Regina', description: 'Mature, warm', provider: 'yarngpt' },
	{ name: 'Femi', ssmlGender: 'MALE', displayName: 'Femi', description: 'Rich, reassuring', provider: 'yarngpt' },
	{ name: 'Wura', ssmlGender: 'FEMALE', displayName: 'Wura', description: 'Young, sweet', provider: 'yarngpt' },
	{ name: 'Adaora', ssmlGender: 'FEMALE', displayName: 'Adaora', description: 'Warm, engaging', provider: 'yarngpt' },
	{ name: 'Nonso', ssmlGender: 'MALE', displayName: 'Nonso', description: 'Bold, resonant', provider: 'yarngpt' },
	{ name: 'Mary', ssmlGender: 'FEMALE', displayName: 'Mary', description: 'Energetic, youthful', provider: 'yarngpt' },
	{ name: 'Adam', ssmlGender: 'MALE', displayName: 'Adam', description: 'Deep, clear', provider: 'yarngpt' }
];

// Azure TTS Nigerian English Voices
export const AZURE_VOICES: VoiceOption[] = [
	{ name: 'en-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo', description: 'Azure Nigerian male', provider: 'azure' },
	{ name: 'en-NG-EzinneNeural', ssmlGender: 'FEMALE', displayName: 'Ezinne', description: 'Azure Nigerian female', provider: 'azure' },
	{ name: 'en-US-JennyNeural', ssmlGender: 'FEMALE', displayName: 'Jenny (US)', description: 'Test US voice', provider: 'azure' },
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
