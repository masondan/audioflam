import { writable } from 'svelte/store';

// App State
export const splashScreenVisible = writable(true);

// TTS Provider Types
export type TTSProvider = 'yarngpt' | 'replicate';

export interface VoiceOption {
	name: string;
	ssmlGender: 'MALE' | 'FEMALE';
	displayName: string;
	description: string;
	provider: TTSProvider;
	speakerUrl?: string; // For Replicate voice cloning
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

// Replicate XTTS-v2 Voices (cloned, faster ~7s)
// Add your Nigerian voice samples to static/voices/ and reference them here

export const REPLICATE_VOICES: VoiceOption[] = [
  { 
    name: 'osas', 
    ssmlGender: 'FEMALE', 
    displayName: 'Osas', 
    description: 'Cloned Nigerian voice', 
    provider: 'replicate',
    speakerUrl: '/voices/test-voice.mp3'
  },
];

// Combined voices for the UI
export const ALL_VOICES: VoiceOption[] = [
	...YARNGPT_VOICES,
	...REPLICATE_VOICES
];

export const selectedVoice = writable<VoiceOption>(YARNGPT_VOICES[0]);
export const textInput = writable('');

// Audio State
export const isGenerating = writable(false);
export const audioResult = writable<string | null>(null);
