export const EXTENSION_NAME = 'VoiceFlow AI';
export const EXTENSION_TAGLINE = 'Universal Voice Dictation';

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'en-CA', label: 'English (Canada)', flag: '🇨🇦' },
  { code: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
  { code: 'en-IN', label: 'English (India)', flag: '🇮🇳' },
] as const;

export const DEFAULT_LANGUAGE = 'en-US';

export const COMMAND_TOGGLE_DICTATION = 'toggle-dictation';

export const STORAGE_KEYS = {
  SETTINGS: 'voiceflow_settings',
  LAST_TRANSCRIPT: 'voiceflow_last_transcript',
  WIDGET_POSITION: 'voiceflow_widget_pos',
} as const;

export const WIDGET_CONTAINER_ID = 'voiceflow-ai-root';
export const WIDGET_SHADOW_HOST_ID = 'voiceflow-ai-host';
