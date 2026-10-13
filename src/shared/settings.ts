import { DEFAULT_LANGUAGE, STORAGE_KEYS } from './constants';
export { STORAGE_KEYS };

export type VoiceMode = 'DICTATION' | 'NAVIGATION' | 'COMMAND';

export interface UserSettings {
  language: string;
  autoPunctuation: boolean;
  autoCapitalize: boolean;
  floatingWidgetVisible: boolean; // whether floating widget is enabled
  floatingWidgetMode: 'always' | 'while-recording' | 'hidden';
  soundEffects: boolean;
  theme: 'light' | 'dark' | 'system';
  retainTranscripts: boolean; // opt-in storage of recent transcripts
  defaultMode: VoiceMode;
  enableCommandsInDictation: boolean; // allow unambiguous commands in dictation mode
  navigationCaretPolicy: 'end' | 'select' | 'preserve';
  fieldHighlightEnabled: boolean; // subtle visual glow on currently navigated field
  engineType: 'web-speech' | 'local-whisper'; // speech recognition backend engine
}

export const DEFAULT_SETTINGS: UserSettings = {
  language: DEFAULT_LANGUAGE,
  autoPunctuation: true,
  autoCapitalize: true,
  floatingWidgetVisible: true,
  floatingWidgetMode: 'while-recording',
  soundEffects: true,
  theme: 'system',
  retainTranscripts: false, // Default false for user privacy
  defaultMode: 'DICTATION',
  enableCommandsInDictation: true,
  navigationCaretPolicy: 'end',
  fieldHighlightEnabled: true,
  engineType: 'web-speech',
};

export async function loadSettings(): Promise<UserSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      if (result && result[STORAGE_KEYS.SETTINGS]) {
        return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
      }
    } else if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    }
  } catch (err) {
    console.warn('[VoiceFlow AI] Failed to load settings, using defaults', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  const current = await loadSettings();
  const updated: UserSettings = { ...current, ...settings };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('[VoiceFlow AI] Failed to save settings', err);
  }

  return updated;
}
