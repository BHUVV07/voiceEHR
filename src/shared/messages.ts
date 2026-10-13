import { UserSettings, VoiceMode } from './settings';
export type { VoiceMode };

export type DictationState = 'IDLE' | 'STARTING' | 'LISTENING' | 'PAUSED' | 'RECOVERING' | 'STOPPING' | 'ERROR';

export interface DictationError {
  code: string;
  message: string;
  actionable?: string;
}

export interface FocusTargetInfo {
  hasTarget: boolean;
  tagName?: string;
  inputType?: string;
  isContentEditable?: boolean;
  placeholder?: string;
  label?: string;
  adapterName?: string;
  fieldIndex?: number;
  totalFields?: number;
}

export interface LastCommandFeedback {
  command: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';
  message: string;
  timestamp: number;
}

export interface FieldSummaryInfo {
  index: number;
  id: string;
  label: string;
  type: string;
  role: string;
}

export type ExtensionMessage =
  | { type: 'TOGGLE_DICTATION' }
  | { type: 'START_DICTATION'; language?: string }
  | { type: 'STOP_DICTATION' }
  | { type: 'PAUSE_DICTATION' }
  | { type: 'RESUME_DICTATION' }
  | { type: 'SET_MODE'; mode: VoiceMode }
  | { type: 'GET_STATE' }
  | {
      type: 'STATE_UPDATE';
      state: DictationState;
      mode: VoiceMode;
      error?: DictationError | null;
      language?: string;
      focusTarget?: FocusTargetInfo;
      lastCommand?: LastCommandFeedback | null;
      discoveredFields?: FieldSummaryInfo[];
    }
  | {
      type: 'TRANSCRIPT_UPDATE';
      interim: string;
      final: string;
      allFinal: string;
    }
  | { type: 'INSERT_TEXT'; text: string }
  | { type: 'CLEAR_CURRENT_FIELD' }
  | { type: 'UNDO_LAST_ACTION' }
  | { type: 'NAVIGATE_NEXT_FIELD' }
  | { type: 'NAVIGATE_PREV_FIELD' }
  | { type: 'NAVIGATE_TO_FIELD'; label: string }
  | { type: 'COPY_CLIPBOARD'; text: string }
  | { type: 'CHECK_FOCUS' }
  | { type: 'SETTINGS_CHANGED'; settings: UserSettings };

export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
