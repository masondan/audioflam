import { writable } from 'svelte/store';

// App State
export const splashScreenVisible = writable(true);

// TTS Settings
export type LanguageCode = 'en-NG'; // | 'ha-NG' | 'yo-NG';

export interface VoiceOption {
    name: string; // Azure Voice ID (Required)
    ssmlGender: 'MALE' | 'FEMALE';
    displayName: string;
}

export const selectedLanguage = writable<LanguageCode>('en-NG');
export const selectedVoice = writable<VoiceOption | null>(null);
export const textInput = writable('');

// Audio State
export const isGenerating = writable(false);
export const audioResult = writable<string | null>(null); // Blob URL

// Azure Neural Voices
export const NIGERIAN_VOICES: Record<LanguageCode, VoiceOption[]> = {
    'en-NG': [
        { name: 'en-NG-EzinneNeural', ssmlGender: 'FEMALE', displayName: 'Ezinne (Female)' },
        { name: 'en-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo (Male)' }
    ],
    'ha-NG': [
        { name: 'ha-NG-AminaNeural', ssmlGender: 'FEMALE', displayName: 'Amina (Female)' },
        { name: 'ha-NG-BelloNeural', ssmlGender: 'MALE', displayName: 'Bello (Male)' }
    ],
    'yo-NG': [
        { name: 'yo-NG-KemiNeural', ssmlGender: 'FEMALE', displayName: 'Kemi (Female)' },
        { name: 'yo-NG-AbeoNeural', ssmlGender: 'MALE', displayName: 'Abeo (Male)' }
    ]
};
