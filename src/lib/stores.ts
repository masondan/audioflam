import { writable } from 'svelte/store';

// Voice Cloning
export interface CustomVoice {
	id: string;           // Qwen clone ID from DashScope (e.g. "qwen-vc-xxxx")
	name: string;         // Max 15 chars, e.g. "Amara"
	country: string;      // Free text, e.g. "Ghana"
	previewAudio: string; // Base64 MP3 (NOT WAV) — generated once at clone time
	createdAt: number;    // Date.now() timestamp
}

export const MAX_CUSTOM_VOICES = 4;

export const CLONE_PREVIEW_SCRIPT = "They say change begins at the end of your comfort zone. So are you ready to change your story?";

export const CLONE_RECORDING_SCRIPT = "Hello and welcome. Today we're bringing you good news from across the region. A new project that aims to make life better for people of all ages has started after a major community campaign. Leaders say the project will deliver exciting benefits for everyone.";

function loadCustomVoices(): CustomVoice[] {
	// SSR guard: localStorage only exists in browser
	if (typeof window === 'undefined') return [];
	try {
		return JSON.parse(localStorage.getItem('audioflam_custom_voices') ?? '[]');
	} catch {
		return [];
	}
}

export const customVoices = writable<CustomVoice[]>(loadCustomVoices());

customVoices.subscribe(val => {
	// SSR guard: only save in browser
	if (typeof window !== 'undefined') {
		localStorage.setItem('audioflam_custom_voices', JSON.stringify(val));
	}
});

// App State
export const splashScreenVisible = writable(true);

// TTS Provider Types
export type TTSProvider = 'yarngpt' | 'azure' | 'minimax' | 'qwen';

export interface VoiceOption {
	name: string;
	ssmlGender: 'MALE' | 'FEMALE';
	displayName: string;
	description: string;
	provider: TTSProvider;
}

// YarnGPT Nigerian Voices (native, slower ~30s) - Adaora, Idera, Tayo, Femi
export const YARNGPT_VOICES: VoiceOption[] = [
	{ name: 'Adaora', ssmlGender: 'FEMALE', displayName: 'Adaora (Nigeria)', description: 'Warm, engaging', provider: 'yarngpt' },
	{ name: 'Idera', ssmlGender: 'FEMALE', displayName: 'Idera (Nigeria)', description: 'Nigerian, melodic', provider: 'yarngpt' },
	{ name: 'Tayo', ssmlGender: 'MALE', displayName: 'Tayo (Nigeria)', description: 'Nigerian, upbeat', provider: 'yarngpt' },
	{ name: 'Femi', ssmlGender: 'MALE', displayName: 'Femi (Nigeria)', description: 'Nigerian, reassuring', provider: 'yarngpt' }
];

// Azure TTS Voices (Nigerian + British English)
export const AZURE_VOICES: VoiceOption[] = [
	// Nigerian English
	{ name: 'en-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo (Nigeria)', description: 'Azure Nigerian male', provider: 'azure' },
	{ name: 'en-NG-EzinneNeural', ssmlGender: 'FEMALE', displayName: 'Ezinne (Nigeria)', description: 'Azure Nigerian female', provider: 'azure' },
	// British English
	{ name: 'en-GB-RyanNeural', ssmlGender: 'MALE', displayName: 'Ryan (UK)', description: 'British male', provider: 'azure' },
	{ name: 'en-GB-BellaNeural', ssmlGender: 'FEMALE', displayName: 'Bella (UK)', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-HollieNeural', ssmlGender: 'FEMALE', displayName: 'Hollie (UK)', description: 'British female', provider: 'azure' },
	{ name: 'en-GB-OliverNeural', ssmlGender: 'MALE', displayName: 'Oliver (UK)', description: 'British male', provider: 'azure' },
];

// MiniMax Voice Clones (Malawi + Zimbabwe English)
// Cloned via: node --env-file=.env scripts/minimax-clone-voices.js (April 2026)
// voice_id rules: min 10 chars, alphanumeric only (no underscores)
export const MINIMAX_VOICES: VoiceOption[] = [
	// Malawi English
	{ name: 'chisomom01', ssmlGender: 'MALE', displayName: 'Chisomo', description: 'Malawi English male', provider: 'minimax' },
	{ name: 'mercyf0001', ssmlGender: 'FEMALE', displayName: 'Mercy', description: 'Malawi English female', provider: 'minimax' },
	// Zimbabwe English
	{ name: 'tawandam01', ssmlGender: 'MALE', displayName: 'Tawanda', description: 'Zimbabwe English male', provider: 'minimax' },
	{ name: 'preciousf1', ssmlGender: 'FEMALE', displayName: 'Precious', description: 'Zimbabwe English female', provider: 'minimax' }
];

// Qwen3-TTS Voice Clones (Malawi + Zimbabwe English)
// Enrolled via: node --env-file=.env scripts/enroll_voices.js (May 11, 2026)
// Voice IDs stored in .env as VOICE_MALAWI_FEMALE, VOICE_MALAWI_MALE, VOICE_ZIM_FEMALE, VOICE_ZIM_MALE
// Note: Synthesis with cloned voices requires paid subscription (enrollment was $0.04 total)
export const QWEN_VOICES: VoiceOption[] = [
	// Malawi English
	{ name: 'qwen-tts-vc-malawi-voice-20260511195848208-4632', ssmlGender: 'FEMALE', displayName: 'Chisomo (Malawi)', description: 'Malawi English female', provider: 'qwen' },
	{ name: 'qwen-tts-vc-malawi-voice-20260511195853398-146d', ssmlGender: 'MALE', displayName: 'Mercy (Malawi)', description: 'Malawi English male', provider: 'qwen' },
	// Zimbabwe English
	{ name: 'qwen-tts-vc-zim-voice-20260511195858837-d2b5', ssmlGender: 'FEMALE', displayName: 'Tawanda (Zimbabwe)', description: 'Zimbabwe English female', provider: 'qwen' },
	{ name: 'qwen-tts-vc-zim-voice-20260511195904106-121a', ssmlGender: 'MALE', displayName: 'Precious (Zimbabwe)', description: 'Zimbabwe English male', provider: 'qwen' }
];

// Combined voices for the UI (Nigerian first, then YarnGPT, then Qwen Malawi/Zim, then British)
// Note: MINIMAX_VOICES hidden from dropdown (API currently non-functional)
export const ALL_VOICES: VoiceOption[] = [
	...AZURE_VOICES.filter(v => v.name.startsWith('en-NG')),
	...YARNGPT_VOICES,
	...QWEN_VOICES,
	...AZURE_VOICES.filter(v => v.name.startsWith('en-GB')),
];

export const selectedVoice = writable<VoiceOption | null>(null);
export const textInput = writable('');

// Audio State
export const isGenerating = writable(false);
export const audioResult = writable<string | null>(null);

// TTS → Audiogram Integration
export interface PreloadedTTSAudio {
	buffer: AudioBuffer;
	voiceName: string;
}
export const preloadedTTSAudio = writable<PreloadedTTSAudio | null>(null);

// Transcription State
export const transcriptionSettingsStore = writable({
	multilingualEnabled: false,
	quantized: true,
	selectedLanguage: 'auto',
	showTimestamps: false,
});

// Helper: convert CustomVoice to VoiceOption for dropdown integration
export function customVoiceToVoiceOption(voice: CustomVoice): VoiceOption {
	return {
		name: voice.id,           // Use clone ID as the voice name for TTS API
		ssmlGender: 'FEMALE',     // Placeholder; not used for Qwen clones
		displayName: voice.name,  // User-friendly name for dropdown
		description: `Custom (${voice.country})`,
		provider: 'qwen'
	};
}
