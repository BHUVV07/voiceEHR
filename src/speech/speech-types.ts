export type SpeechEngineState = 'IDLE' | 'STARTING' | 'LISTENING' | 'PAUSED' | 'RECOVERING' | 'STOPPING' | 'ERROR';

export interface SpeechRecognitionConfig {
  lang: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  autoPunctuation?: boolean;
  autoCapitalize?: boolean;
}

export interface SpeechTranscriptEvent {
  interim: string;
  final: string;
  rawFinal: string;
  timestamp: number;
}

export interface SpeechErrorEvent {
  code: string;
  message: string;
  actionable: string;
}

export interface ISpeechEngine {
  readonly id: string;
  readonly name: string;
  isSupported(): boolean;
  getState(): SpeechEngineState;
  start(config?: Partial<SpeechRecognitionConfig>): Promise<void>;
  stop(): Promise<void>;
  abort(): void;
  onStateChange(cb: (state: SpeechEngineState) => void): () => void;
  onTranscript(cb: (event: SpeechTranscriptEvent) => void): () => void;
  onError(cb: (event: SpeechErrorEvent) => void): () => void;
}
