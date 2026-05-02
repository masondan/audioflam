// src/lib/stores/bulletin.ts
// Bulletin Engine store — full state with localStorage persistence

import { writable } from 'svelte/store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScriptType = 'summary' | 'explainer';
export type ScriptLength = 20 | 30 | 60 | 90;

export interface BulletinStory {
	id: string;
	originalText: string;
	script: string;
	scriptActive: boolean;
	scriptLength: ScriptLength;
	scriptType: ScriptType;
	ttsAudio: string | null;
}

export interface BulletinState {
	stories: BulletinStory[];
	selectedVoice: string | null;
	introScript: string;
	outroScript: string;
	introOutroVoice: string;
	introOutroEnabled: boolean;
	introOutroSpeed: number;  // 1.0 = default, 1.25 = lively, 1.5 = fast
	introOutroSilence: 'default' | 'trim' | 'tight';
	soundsEnabled: boolean;
	selectedIntroOutroSound: string | null;  // filename or null
	selectedTransitionSound: string | null;  // filename or null
	introTtsAudio: string | null;
	outroTtsAudio: string | null;
	bulletinAudio: string | null;
	mainVoiceSpeed: number;  // 1.0 = default, 1.15 = lively, 1.25 = fast (applies to all story segments)
	mainVoiceSilence: 'default' | 'trim' | 'tight';  // silence removal level for story segments
}

// ─── Sound file constants ─────────────────────────────────────────────────────

export const INTRO_OUTRO_SOUNDS = ['intro1.mp3', 'intro2.mp3', 'intro3.mp3'];
export const TRANSITION_SOUNDS  = ['transition1.mp3', 'transition2.mp3', 'transition3.mp3'];
// All served from /sounds/

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_STATE: BulletinState = {
	stories: [],
	selectedVoice: null,
	introScript: '',
	outroScript: '',
	introOutroVoice: '',
	introOutroEnabled: false,
	introOutroSpeed: 1.0,
	introOutroSilence: 'default',
	soundsEnabled: false,
	selectedIntroOutroSound: null,
	selectedTransitionSound: null,
	introTtsAudio: null,
	outroTtsAudio: null,
	bulletinAudio: null,
	mainVoiceSpeed: 1.0,
	mainVoiceSilence: 'default',
};

const STORAGE_KEY = 'audioflam_bulletin';

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadFromStorage(): BulletinState {
	if (typeof localStorage === 'undefined') return { ...DEFAULT_STATE };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_STATE };
		const parsed = JSON.parse(raw) as Partial<BulletinState>;
		// Merge with defaults to handle schema additions gracefully
		const merged = { ...DEFAULT_STATE, ...parsed };
		return merged;
	} catch {
		return { ...DEFAULT_STATE };
	}
}

function saveToStorage(state: BulletinState): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage quota exceeded or unavailable — fail silently
	}
}

// ─── Store ────────────────────────────────────────────────────────────────────

function createBulletinStore() {
	const { subscribe, set, update } = writable<BulletinState>(loadFromStorage());

	// Persist every update to localStorage
	subscribe((state) => {
		saveToStorage(state);
	});

	return {
		subscribe,
		set,
		update,

		/** Add a new story to the list */
		addStory(story: BulletinStory) {
			update((s) => ({ ...s, stories: [...s.stories, story] }));
		},

		/** Replace an existing story by id */
		updateStory(story: BulletinStory) {
			update((s) => ({
				...s,
				stories: s.stories.map((st) => (st.id === story.id ? story : st)),
			}));
		},

		/** Remove a story by id */
		deleteStory(id: string) {
			update((s) => ({ ...s, stories: s.stories.filter((st) => st.id !== id) }));
		},

		/** Swap two stories by index (for reorder chevrons) */
		reorderStories(fromIndex: number, toIndex: number) {
			update((s) => {
				const stories = [...s.stories];
				const [moved] = stories.splice(fromIndex, 1);
				stories.splice(toIndex, 0, moved);
				return { ...s, stories };
			});
		},

		/** Clear the assembled bulletin audio + intro/outro TTS (e.g. after editing stories or changing settings) */
		clearBulletinAudio() {
			update((s) => ({
				...s,
				bulletinAudio: null,
				introTtsAudio: null,
				outroTtsAudio: null,
			}));
		},
	
		/** Clear stories only (keep intro/outro, sounds, voice, and adjustments) */
		clearStoriesOnly() {
			update((s) => ({
				...s,
				stories: [],
				bulletinAudio: null,
			}));
		},
	
		/** Reset entire store to defaults */
		reset() {
			set({ ...DEFAULT_STATE });
		},
	};
}

export const bulletinStore = createBulletinStore();

// ─── Panel state store (for auto-collapse) ────────────────────────────────────

export type OpenPanel = 'intro-outro' | 'sounds' | 'adjust-voice' | null;

function createPanelStore() {
	const { subscribe, set } = writable<OpenPanel>(null);

	return {
		subscribe,
		setOpen(panel: OpenPanel) {
			set(panel);
		},
		close() {
			set(null);
		},
	};
}

export const bulletinPanelStore = createPanelStore();

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Returns the text that should be used as the TTS source for a story.
 * If scriptActive is true AND a script exists, use the script.
 * Otherwise fall back to originalText.
 */
export function getStorySource(story: Pick<BulletinStory, 'originalText' | 'script' | 'scriptActive'>): string {
	if (story.scriptActive && story.script.trim()) {
		return story.script;
	}
	return story.originalText;
}

/** Generate a unique story ID */
export function generateStoryId(): string {
	return `story_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
