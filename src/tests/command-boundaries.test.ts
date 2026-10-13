import { describe, it, expect, beforeEach } from 'vitest';
import { CommandInterpreter } from '../content/commands/CommandInterpreter';

describe('Command Boundaries & Dictation Isolation', () => {
  let interpreter: CommandInterpreter;

  beforeEach(() => {
    interpreter = new CommandInterpreter();
  });

  describe('Explicit Command-Boundary Rules', () => {
    it('"next field" executes navigation when recognized as an unambiguous standalone command', () => {
      const res = interpreter.parse('next field', 'DICTATION');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('NAVIGATE_NEXT');
    });

    it('"type next field" inserts the words "next field" without executing navigation', () => {
      // In Dictation mode:
      const resDict = interpreter.parse('type next field', 'DICTATION');
      expect(resDict.isCommand).toBe(true);
      expect(resDict.type).toBe('EXPLICIT_DICTATION');
      expect(resDict.textPayload).toBe('next field');

      // In Navigation mode:
      const resNav = interpreter.parse('type next field', 'NAVIGATION');
      expect(resNav.isCommand).toBe(true);
      expect(resNav.type).toBe('EXPLICIT_DICTATION');
      expect(resNav.textPayload).toBe('next field');

      // In Command mode:
      const resCmd = interpreter.parse('type next field', 'COMMAND');
      expect(resCmd.isCommand).toBe(true);
      expect(resCmd.type).toBe('EXPLICIT_DICTATION');
      expect(resCmd.textPayload).toBe('next field');
    });

    it('"The report says to move to the next field" remains dictated text', () => {
      const narrative = 'The report says to move to the next field';
      const res = interpreter.parse(narrative, 'DICTATION');
      expect(res.isCommand).toBe(false);
      expect(res.type).toBe('NOT_A_COMMAND');
      expect(res.rawTranscript).toBe(narrative);
    });

    it('"enter forty-five" extracts "forty-five" as explicit dictation', () => {
      const res = interpreter.parse('enter forty-five', 'NAVIGATION');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('EXPLICIT_DICTATION');
      expect(res.textPayload).toBe('forty-five');
    });

    it('"dictate Rahul Sharma" extracts "Rahul Sharma" preserving original casing', () => {
      const res = interpreter.parse('dictate Rahul Sharma', 'NAVIGATION');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('EXPLICIT_DICTATION');
      expect(res.textPayload).toBe('Rahul Sharma');
    });
  });

  describe('Single Recognition Event Isolation', () => {
    it('ensures that parsed results are strictly either isCommand: true OR isCommand: false', () => {
      const phrases = [
        'next field',
        'previous field',
        'go to patient name',
        'type next field',
        'The doctor ordered twenty milligrams',
        'new line',
        'clear this field',
        'Patient reports fever for three days',
      ];

      for (const phrase of phrases) {
        const res = interpreter.parse(phrase, 'DICTATION');
        if (res.isCommand) {
          expect(res.type).not.toBe('NOT_A_COMMAND');
        } else {
          expect(res.type).toBe('NOT_A_COMMAND');
        }
      }
    });
  });
});
