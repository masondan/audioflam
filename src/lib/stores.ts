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
	{ name: 'en-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo', description: 'Azure Nigerian male', provider: 'azure' },
	{ name: 'en-NG-EzinneNeural', ssmlGender: 'FEMALE', displayName: 'Ezinne', description: 'Azure Nigerian female', provider: 'azure' },
	// British English
	{ name: 'en-GB-RyanNeural', ssmlGender: 'MALE', displayName: 'Ryan', description: 'British male', provider: 'azure' },
	{ name: 'en-GB-BellaNeural', ssmlGender: 'FEMALE', displayName: 'Bella', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-HollieNeural', ssmlGender: 'FEMALE', displayName: 'Hollie', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-OliverNeural', ssmlGender: 'MALE', displayName: 'Oliver', description: 'British male', provider: 'azure' },
];

// Combined voices for the UI (Nigerian first, then British)
export const ALL_VOICES: VoiceOption[] = [
	...AZURE_VOICES.filter(v => v.name.startsWith('en-NG')),
	...YARNGPT_VOICES,
	...AZURE_VOICES.filter(v => v.name.startsWith('en-GB')),
];

export const selectedVoice = writable<VoiceOption | null>(null);
export const textInput = writable('');

// Audio State
export const isGenerating = writable(false);
export const audioResult = writable<string | null>(null);

// ============================================
// SESSION AUDIO CACHE - Feature: Faster iterations
// Cache is cleared when app is closed or input is cleared
// Safe to rollback: Remove audioCache and its usages
// ============================================

export interface CacheKey {
	text: string;
	voiceName: string;
	provider: TTSProvider;
}

function createCacheKey(text: string, voiceName: string, provider: TTSProvider): string {
	// Normalize text: trim and create hash-friendly key
	const normalized = text.trim();
	return `${provider}:${voiceName}:${normalized}`;
}

export function createAudioCache() {
	const cache = new Map<string, string>(); // Maps cacheKey → base64 audio

	return {
		get: (text: string, voiceName: string, provider: TTSProvider): string | null => {
			const key = createCacheKey(text, voiceName, provider);
			return cache.get(key) || null;
		},
		set: (text: string, voiceName: string, provider: TTSProvider, audioBase64: string): void => {
			const key = createCacheKey(text, voiceName, provider);
			cache.set(key, audioBase64);
		},
		clear: (): void => {
			cache.clear();
		},
		size: (): number => cache.size
	};
}

export const audioCache = createAudioCache();
