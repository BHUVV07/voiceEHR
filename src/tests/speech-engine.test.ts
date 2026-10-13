import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatTranscript } from '../speech/text-formatter';
import { WebSpeechEngine } from '../speech/WebSpeechEngine';

describe('Speech & Formatting Engine', () => {
  describe('formatTranscript', () => {
    it('converts spoken punctuation words into symbols', () => {
      const raw = 'the patient reported mild headache comma followed by nausea period';
      const formatted = formatTranscript(raw, { autoPunctuation: true, autoCapitalize: true });

      expect(formatted).toBe('The patient reported mild headache, followed by nausea.');
    });

    it('formats question marks, exclamation points, and newlines', () => {
      const raw = 'did the fever decrease question mark yes exclamation mark newline patient is improving';
      const formatted = formatTranscript(raw, { autoPunctuation: true, autoCapitalize: true });

      expect(formatted).toContain('?');
      expect(formatted).toContain('!');
      expect(formatted).toContain('\n');
    });

    it('capitalizes standalone "i" and sentence beginnings', () => {
      const raw = 'when i arrived at the hospital period i was admitted';
      const formatted = formatTranscript(raw, { autoPunctuation: true, autoCapitalize: true });

      expect(formatted).toBe('When I arrived at the hospital. I was admitted');
    });

    it('preserves clean spacing around punctuation', () => {
      const raw = 'blood pressure normal . pulse stable , temperature 98.6';
      const formatted = formatTranscript(raw, { autoPunctuation: true });

      expect(formatted).toContain('normal.');
      expect(formatted).toContain('stable,');
    });
  });

  describe('WebSpeechEngine State Machine', () => {
    it('initializes in IDLE state', () => {
      const engine = new WebSpeechEngine();
      expect(engine.getState()).toBe('IDLE');
    });

    it('registers state change callbacks', () => {
      const engine = new WebSpeechEngine();
      const callback = vi.fn();
      const unsub = engine.onStateChange(callback);

      expect(typeof unsub).toBe('function');
    });

    it('safely handles stop when in IDLE without throwing', async () => {
      const engine = new WebSpeechEngine();
      await expect(engine.stop()).resolves.toBeUndefined();
      expect(engine.getState()).toBe('IDLE');
    });
  });
});
