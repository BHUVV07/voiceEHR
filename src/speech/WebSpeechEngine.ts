import {
  ISpeechEngine,
  SpeechEngineState,
  SpeechRecognitionConfig,
  SpeechTranscriptEvent,
  SpeechErrorEvent,
} from './speech-types';
import { formatTranscript } from './text-formatter';

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface RecentFinalRecord {
  raw: string;
  formatted: string;
  timestamp: number;
}

export class WebSpeechEngine implements ISpeechEngine {
  readonly id = 'web-speech';
  readonly name = 'Chrome Web Speech API';

  private recognition: any = null;
  private state: SpeechEngineState = 'IDLE';
  private config: SpeechRecognitionConfig = {
    lang: 'en-US',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    autoPunctuation: true,
    autoCapitalize: true,
  };

  private stateChangeCallbacks: Set<(state: SpeechEngineState) => void> = new Set();
  private transcriptCallbacks: Set<(event: SpeechTranscriptEvent) => void> = new Set();
  private errorCallbacks: Set<(event: SpeechErrorEvent) => void> = new Set();

  // Session state & single-session enforcement
  private currentSessionId = 0;
  private intentionalStop = false;
  private isRestarting = false;
  private restartTimeout: number | null = null;
  private healthyListenTimeout: number | null = null;

  // Bounded retry parameters
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAYS_MS = [150, 300, 600, 1200, 2400];
  private consecutiveErrors = 0;

  // Finalized result deduplication cache (1000ms window)
  private recentFinals: RecentFinalRecord[] = [];
  private readonly DEDUP_WINDOW_MS = 1000;

  constructor() {
    this.initRecognition();
  }

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as IWindowWithSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  getState(): SpeechEngineState {
    return this.state;
  }

  getSessionId(): number {
    return this.currentSessionId;
  }

  private setState(newState: SpeechEngineState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeCallbacks.forEach((cb) => {
        try {
          cb(newState);
        } catch (e) {
          console.error('[WebSpeechEngine] State callback error', e);
        }
      });
    }
  }

  private initRecognition() {
    if (!this.isSupported()) return;

    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = this.config.continuous ?? true;
      this.recognition.interimResults = this.config.interimResults ?? true;
      this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;
      this.recognition.lang = this.config.lang;

      this.recognition.onstart = () => {
        // Discard events if an explicit stop occurred
        if (this.intentionalStop) {
          return;
        }

        this.isRestarting = false;
        this.consecutiveErrors = 0;
        this.setState('LISTENING');

        // If listening remains healthy for > 4000ms, reset retry count
        if (this.healthyListenTimeout) clearTimeout(this.healthyListenTimeout);
        this.healthyListenTimeout = window.setTimeout(() => {
          if (this.state === 'LISTENING' && !this.intentionalStop) {
            this.retryCount = 0;
          }
        }, 4000);
      };

      this.recognition.onresult = (event: any) => {
        if (this.intentionalStop) {
          return;
        }

        let interimText = '';
        let newFinalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';

          if (result.isFinal) {
            newFinalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        const now = Date.now();
        let trimmedRawFinal = newFinalText.trim();

        // Finalized result deduplication check
        let formattedFinal = '';
        if (trimmedRawFinal) {
          // Check if this exact text was already emitted recently
          const isDuplicate = this.recentFinals.some(
            (r) => r.raw.toLowerCase() === trimmedRawFinal.toLowerCase() && now - r.timestamp < this.DEDUP_WINDOW_MS
          );

          if (!isDuplicate) {
            formattedFinal = formatTranscript(trimmedRawFinal, {
              autoPunctuation: this.config.autoPunctuation,
              autoCapitalize: this.config.autoCapitalize,
            });

            this.recentFinals.push({
              raw: trimmedRawFinal,
              formatted: formattedFinal,
              timestamp: now,
            });

            // Keep cache trimmed
            if (this.recentFinals.length > 20) {
              this.recentFinals.shift();
            }
          } else {
            // Duplicate finalized text suppressed
            trimmedRawFinal = '';
          }
        }

        if (formattedFinal || interimText) {
          const transcriptEvent: SpeechTranscriptEvent = {
            interim: interimText.trim(),
            final: formattedFinal,
            rawFinal: trimmedRawFinal,
            timestamp: now,
          };

          this.transcriptCallbacks.forEach((cb) => {
            try {
              cb(transcriptEvent);
            } catch (e) {
              console.error('[WebSpeechEngine] Transcript callback error', e);
            }
          });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (this.intentionalStop) {
          return;
        }

        const errorCode = event.error || 'unknown';

        // 'no-speech' is normal during user pauses; do not treat as a hard error
        if (errorCode === 'no-speech') {
          return;
        }

        // 'aborted' during intentional shutdown is normal
        if (errorCode === 'aborted' && this.intentionalStop) {
          return;
        }

        this.consecutiveErrors++;

        let message = `Speech recognition error: ${errorCode}`;
        let actionable = 'Please try again.';

        switch (errorCode) {
          case 'not-allowed':
          case 'service-not-allowed':
            message = 'Microphone access was denied or blocked.';
            actionable = 'Please click the lock/tune icon in your address bar to grant microphone permissions.';
            break;
          case 'audio-capture':
            message = 'No microphone device was detected.';
            actionable = 'Ensure your microphone is plugged in, powered on, and selected in system sound settings.';
            break;
          case 'network':
            message = 'Speech server network connection error.';
            actionable = 'Web Speech API requires an active internet connection to contact Google speech servers.';
            break;
          case 'language-not-supported':
            message = `Selected language (${this.config.lang}) is not supported.`;
            actionable = 'Try selecting English (US) in settings.';
            break;
          case 'aborted':
            message = 'Speech recognition session was aborted.';
            actionable = 'Click Start to begin voice control again.';
            break;
        }

        const errorPayload: SpeechErrorEvent = {
          code: errorCode,
          message,
          actionable,
        };

        this.errorCallbacks.forEach((cb) => {
          try {
            cb(errorPayload);
          } catch (e) {
            console.error('[WebSpeechEngine] Error callback failed', e);
          }
        });

        // Fatal errors that cannot be recovered with retry
        if (errorCode === 'not-allowed' || errorCode === 'audio-capture') {
          this.intentionalStop = true;
          this.setState('ERROR');
        }
      };

      this.recognition.onend = () => {
        if (this.healthyListenTimeout) {
          clearTimeout(this.healthyListenTimeout);
          this.healthyListenTimeout = null;
        }

        // If user intentionally stopped, return to IDLE
        if (this.intentionalStop) {
          this.setState('IDLE');
          return;
        }

        // Unexpected termination while we intended to be listening:
        // (Browser speech engines drop connection after silence or ~60s)
        if (this.state === 'LISTENING' || this.state === 'RECOVERING') {
          if (this.retryCount < this.MAX_RETRIES && this.consecutiveErrors < 4) {
            const delay = this.RETRY_DELAYS_MS[this.retryCount] || 1500;
            this.retryCount++;
            this.isRestarting = true;
            this.setState('RECOVERING');

            const sessionAtEnd = this.currentSessionId;
            if (this.restartTimeout) clearTimeout(this.restartTimeout);
            this.restartTimeout = window.setTimeout(() => {
              if (
                !this.intentionalStop &&
                sessionAtEnd === this.currentSessionId &&
                (this.state === 'RECOVERING' || this.state === 'LISTENING')
              ) {
                try {
                  this.recognition.start();
                } catch (err: any) {
                  if (err.name === 'InvalidStateError') {
                    // Already running
                    this.setState('LISTENING');
                  } else {
                    this.setState('IDLE');
                  }
                }
              }
            }, delay);
          } else {
            // Retries exhausted
            this.setState('ERROR');
            const errorPayload: SpeechErrorEvent = {
              code: 'max-retries-exceeded',
              message: 'Voice recognition connection lost after repeated reconnect attempts.',
              actionable: 'Please check your internet connection or restart voice control.',
            };
            this.errorCallbacks.forEach((cb) => cb(errorPayload));
          }
        } else if (this.state === 'STOPPING') {
          this.setState('IDLE');
        }
      };
    } catch (err) {
      console.error('[WebSpeechEngine] Initialization error', err);
    }
  }

  async start(config?: Partial<SpeechRecognitionConfig>): Promise<void> {
    if (!this.isSupported()) {
      const error: SpeechErrorEvent = {
        code: 'unsupported',
        message: 'Web Speech API is not supported in this browser.',
        actionable: 'Please use Google Chrome, Brave, or Microsoft Edge.',
      };
      this.errorCallbacks.forEach((cb) => cb(error));
      this.setState('ERROR');
      throw new Error(error.message);
    }

    // Single-session enforcement: if already listening or starting, ignore duplicate start call
    if (this.state === 'LISTENING' || this.state === 'STARTING') {
      return;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Cancel any pending restart from previous session
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.healthyListenTimeout) {
      clearTimeout(this.healthyListenTimeout);
      this.healthyListenTimeout = null;
    }

    // Allocate new explicit session ID
    this.currentSessionId++;
    this.intentionalStop = false;
    this.isRestarting = false;
    this.consecutiveErrors = 0;
    this.retryCount = 0;

    // Re-initialize recognition instance if language changed
    if (!this.recognition || this.recognition.lang !== this.config.lang) {
      this.initRecognition();
    }

    this.setState('STARTING');

    return new Promise((resolve, reject) => {
      try {
        this.recognition.start();
        resolve();
      } catch (err: any) {
        if (err.name === 'InvalidStateError') {
          // Already running in the background
          this.setState('LISTENING');
          resolve();
        } else {
          this.setState('ERROR');
          reject(err);
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (this.state === 'IDLE' || this.state === 'STOPPING') {
      return;
    }

    this.intentionalStop = true;
    this.isRestarting = false;

    // Cancel pending restart immediately
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.healthyListenTimeout) {
      clearTimeout(this.healthyListenTimeout);
      this.healthyListenTimeout = null;
    }

    this.setState('STOPPING');

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        this.setState('IDLE');
      }
    } else {
      this.setState('IDLE');
    }
  }

  abort(): void {
    this.intentionalStop = true;
    this.isRestarting = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.healthyListenTimeout) {
      clearTimeout(this.healthyListenTimeout);
      this.healthyListenTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
    }
    this.setState('IDLE');
  }

  onStateChange(cb: (state: SpeechEngineState) => void): () => void {
    this.stateChangeCallbacks.add(cb);
    return () => this.stateChangeCallbacks.delete(cb);
  }

  onTranscript(cb: (event: SpeechTranscriptEvent) => void): () => void {
    this.transcriptCallbacks.add(cb);
    return () => this.transcriptCallbacks.delete(cb);
  }

  onError(cb: (event: SpeechErrorEvent) => void): () => void {
    this.errorCallbacks.add(cb);
    return () => this.errorCallbacks.delete(cb);
  }
}
