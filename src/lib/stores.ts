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

export const CLONE_RECORDING_SCRIPT = "Listen, I've got some REALLY good news for you. Do you remember the project to make life better for people of all ages, the one we've been fighting for? Well, it finally starts next week. I can't wait to see the difference it makes for everyone across the region. Have a great day!";

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

// Qwen-Audio-TTS Voice Clones (Malawi + Zimbabwe English)
// Re-enrolled via: node --env-file=.env scripts/reclone_production_voices.js (August 27, 2026)
// Migrated from retiring qwen3-tts-vc-2026-01-22 to qwen-audio-3.0-tts-flash
// (voice-enrollment API). See docs/plans/qwen-migration-final.md.
export const QWEN_VOICES: VoiceOption[] = [
	// Malawi English
	{ name: 'qwen-audio-3.0-tts-flash-chisomo-45771b023d074d2fbe3e68ae747eb58c', ssmlGender: 'FEMALE', displayName: 'Chisomo (Malawi)', description: 'Malawi English female', provider: 'qwen' },
	{ name: 'qwen-audio-3.0-tts-flash-mercy-f6c5f1bc09104f9e85cedf251cd94952', ssmlGender: 'MALE', displayName: 'Mercy (Malawi)', description: 'Malawi English male', provider: 'qwen' },
	// Zimbabwe English
	{ name: 'qwen-audio-3.0-tts-flash-tawanda-1c274d46e7f04fdba0beb3c393855b86', ssmlGender: 'FEMALE', displayName: 'Tawanda (Zimbabwe)', description: 'Zimbabwe English female', provider: 'qwen' },
	{ name: 'qwen-audio-3.0-tts-flash-precious-6fc1a1aedef14b44a0bfb0503aa7c9ef', ssmlGender: 'MALE', displayName: 'Precious (Zimbabwe)', description: 'Zimbabwe English male', provider: 'qwen' }
];

// Qwen-Audio-TTS Voice Clones (Welsh English)
// Owain re-enrolled via: node --env-file=.env scripts/reclone_production_voices.js (August 27, 2026)
// Migrated from retiring qwen3-tts-vc-2026-01-22 to qwen-audio-3.0-tts-flash
// Carys re-enrolled via: node --env-file=.env scripts/enroll_carys_test.js (September 2026)
// — replaces the retired "Ffion" enrollment, which suffered from an intermittent
// reference-audio leak (fragments of its own ~20s enrollment sample bleeding into
// synthesis output — confirmed root cause, see AGENTS.md "Recently Fixed"). Carys
// uses a short (<=10s) clean reference clip plus enable_preprocess: true, which
// resolved the leak across 20+ test generations. Ffion's old voice_id is retired
// and no longer used anywhere in the app.
export const QWEN_WELSH_VOICES: VoiceOption[] = [
	// Welsh English
	{ name: 'qwen-audio-3.0-tts-flash-carys-835aeeced1df40648d6b529323a66def', ssmlGender: 'FEMALE', displayName: 'Carys (Wales)', description: 'Wales English female', provider: 'qwen' },
	{ name: 'qwen-audio-3.0-tts-flash-owain-20ca1a2fc3714f738054d38d9d73c149', ssmlGender: 'MALE', displayName: 'Owain (Wales)', description: 'Wales English male', provider: 'qwen' }
];

// Combined voices for the UI (Nigerian first, then YarnGPT, then Qwen Malawi/Zim, then British, then Welsh)
// Note: MINIMAX_VOICES hidden from dropdown (API currently non-functional)
export const ALL_VOICES: VoiceOption[] = [
	...AZURE_VOICES.filter(v => v.name.startsWith('en-NG')),
	...YARNGPT_VOICES,
	...QWEN_VOICES,
	...AZURE_VOICES.filter(v => v.name.startsWith('en-GB')),
	...QWEN_WELSH_VOICES,
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
