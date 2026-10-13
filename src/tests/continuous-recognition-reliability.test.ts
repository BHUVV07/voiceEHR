import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSpeechEngine } from '../speech/WebSpeechEngine';
import { LocalWhisperEngine } from '../speech/LocalWhisperEngine';

// Mock Web Speech API in JSDOM
class MockSpeechRecognition {
  continuous = true;
  interimResults = true;
  lang = 'en-US';
  onstart: (() => void) | null = null;
  onresult: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onend: (() => void) | null = null;

  start = vi.fn().mockImplementation(() => {
    setTimeout(() => {
      if (this.onstart) this.onstart();
    }, 10);
  });

  stop = vi.fn().mockImplementation(() => {
    setTimeout(() => {
      if (this.onend) this.onend();
    }, 10);
  });

  abort = vi.fn().mockImplementation(() => {
    setTimeout(() => {
      if (this.onend) this.onend();
    }, 10);
  });
}

describe('Continuous Recognition Reliability', () => {
  let originalWebkit: any;
  let engine: WebSpeechEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWebkit = (window as any).webkitSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    engine = new WebSpeechEngine();
  });

  afterEach(() => {
    engine.stop();
    (window as any).webkitSpeechRecognition = originalWebkit;
    vi.useRealTimers();
  });

  describe('Session Lifecycle & Single Session Enforcement', () => {
    it('allocates distinct session IDs across multiple start calls', async () => {
      const startPromise1 = engine.start();
      await vi.runAllTimersAsync();
      await startPromise1;
      const id1 = engine.getSessionId();
      expect(id1).toBeGreaterThan(0);

      await engine.stop();
      await vi.runAllTimersAsync();

      const startPromise2 = engine.start();
      await vi.runAllTimersAsync();
      await startPromise2;
      const id2 = engine.getSessionId();
      expect(id2).toBeGreaterThan(id1);
    });

    it('ignores duplicate start requests when already starting or listening', async () => {
      const p1 = engine.start();
      await vi.runAllTimersAsync();
      await p1;
      const currentId = engine.getSessionId();

      // Calling start again while listening should be a no-op
      await engine.start();
      expect(engine.getSessionId()).toBe(currentId);
      expect(engine.getState()).toBe('LISTENING');
    });
  });

  describe('Controlled Recovery & Bounded Retries', () => {
    it('transitions to RECOVERING and triggers retry when onend fires unexpectedly', async () => {
      await engine.start();
      await vi.runAllTimersAsync();
      expect(engine.getState()).toBe('LISTENING');

      const mockRecognition = (engine as any).recognition as MockSpeechRecognition;

      // Simulate unexpected disconnection by browser
      if (mockRecognition.onend) {
        mockRecognition.onend();
      }

      expect(engine.getState()).toBe('RECOVERING');

      // Fast-forward backoff delay (150ms)
      await vi.advanceTimersByTimeAsync(160);
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('immediately aborts recovery if stop() is called while reconnect is scheduled', async () => {
      await engine.start();
      await vi.runAllTimersAsync();
      expect(engine.getState()).toBe('LISTENING');

      const mockRecognition = (engine as any).recognition as MockSpeechRecognition;

      // Trigger unexpected disconnect
      if (mockRecognition.onend) {
        mockRecognition.onend();
      }
      expect(engine.getState()).toBe('RECOVERING');

      // User explicitly stops during the reconnect window
      await engine.stop();
      expect(engine.getState()).toBe('STOPPING');

      await vi.runAllTimersAsync();
      expect(engine.getState()).toBe('IDLE');
    });

    it('treats no-speech error gracefully without incrementing consecutive error count', async () => {
      await engine.start();
      await vi.runAllTimersAsync();

      const mockRecognition = (engine as any).recognition as MockSpeechRecognition;

      let errorEmitted = false;
      engine.onError(() => {
        errorEmitted = true;
      });

      // Fire no-speech
      if (mockRecognition.onerror) {
        mockRecognition.onerror({ error: 'no-speech' });
      }

      expect(errorEmitted).toBe(false);
      expect(engine.getState()).toBe('LISTENING');
    });
  });

  describe('Finalized-Result Deduplication & Interim Isolation', () => {
    it('suppresses duplicate finalized text received within the 1000ms window', async () => {
      await engine.start();
      await vi.runAllTimersAsync();

      const mockRecognition = (engine as any).recognition as MockSpeechRecognition;
      const transcriptEvents: any[] = [];
      engine.onTranscript((ev) => transcriptEvents.push(ev));

      const eventPayload = {
        resultIndex: 0,
        results: [
          [{ transcript: 'Rahul Sharma' }],
        ],
      };
      (eventPayload.results[0] as any).isFinal = true;

      // First final emission
      mockRecognition.onresult?.(eventPayload);
      expect(transcriptEvents.length).toBe(1);
      expect(transcriptEvents[0].final).toBe('Rahul Sharma');

      // Rapid duplicate emission (simulating browser restart artifact)
      mockRecognition.onresult?.(eventPayload);
      expect(transcriptEvents.length).toBe(1); // duplicate suppressed!
    });
  });

  describe('Local Whisper Engine Privacy Safeguards', () => {
    it('strictly refuses to silently fall back to cloud speech servers when local model is unavailable', async () => {
      const localEngine = new LocalWhisperEngine();
      expect(localEngine.id).toBe('local-whisper');

      let errorCaught: any = null;
      try {
        await localEngine.start();
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).toBeTruthy();
      expect(localEngine.getState()).toBe('ERROR');
    });
  });
});
