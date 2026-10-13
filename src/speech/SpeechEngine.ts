import { ISpeechEngine } from './speech-types';
import { WebSpeechEngine } from './WebSpeechEngine';
import { LocalWhisperEngine } from './LocalWhisperEngine';

export class SpeechEngineFactory {
  private static instance: ISpeechEngine | null = null;
  private static customEngine: ISpeechEngine | null = null;

  static getInstance(type: 'web-speech' | 'local-whisper' = 'web-speech'): ISpeechEngine {
    if (this.customEngine) {
      return this.customEngine;
    }
    if (!this.instance || this.instance.id !== type) {
      if (type === 'local-whisper') {
        this.instance = new LocalWhisperEngine();
      } else {
        this.instance = new WebSpeechEngine();
      }
    }
    return this.instance;
  }

  static setCustomEngine(engine: ISpeechEngine | null) {
    this.customEngine = engine;
    this.instance = engine;
  }
}

export * from './speech-types';
export * from './WebSpeechEngine';
export * from './LocalWhisperEngine';
export * from './text-formatter';
