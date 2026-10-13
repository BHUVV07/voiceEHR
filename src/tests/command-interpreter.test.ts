import { describe, it, expect, beforeEach } from 'vitest';
import { CommandInterpreter } from '../content/commands/CommandInterpreter';

describe('CommandInterpreter', () => {
  let interpreter: CommandInterpreter;

  beforeEach(() => {
    interpreter = new CommandInterpreter();
  });

  describe('Session Control Commands', () => {
    it('recognizes start voice control commands', () => {
      const phrases = [
        'start voice control',
        'start voice',
        'start listening',
        'activate voice control',
        'start voice control please',
      ];
      for (const phrase of phrases) {
        const result = interpreter.parse(phrase, 'DICTATION');
        expect(result.isCommand).toBe(true);
        expect(result.type).toBe('START_VOICE');
      }
    });

    it('recognizes stop voice control commands', () => {
      const phrases = [
        'stop voice control',
        'stop voice',
        'stop listening',
        'turn off voice control',
        'stop listening please',
      ];
      for (const phrase of phrases) {
        const result = interpreter.parse(phrase, 'DICTATION');
        expect(result.isCommand).toBe(true);
        expect(result.type).toBe('STOP_VOICE');
      }
    });

    it('recognizes pause and resume commands', () => {
      expect(interpreter.parse('pause listening').type).toBe('PAUSE_VOICE');
      expect(interpreter.parse('pause').type).toBe('PAUSE_VOICE');
      expect(interpreter.parse('resume listening').type).toBe('RESUME_VOICE');
      expect(interpreter.parse('resume').type).toBe('RESUME_VOICE');
    });
  });

  describe('Interaction Mode Switching', () => {
    it('recognizes mode switch to Dictation mode', () => {
      const res = interpreter.parse('dictation mode');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('SET_MODE');
      expect(res.modeChange).toBe('DICTATION');
    });

    it('recognizes mode switch to Navigation mode', () => {
      const res = interpreter.parse('navigation mode');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('SET_MODE');
      expect(res.modeChange).toBe('NAVIGATION');
    });

    it('recognizes mode switch to Command mode', () => {
      const res = interpreter.parse('command mode');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('SET_MODE');
      expect(res.modeChange).toBe('COMMAND');
    });
  });

  describe('Field Navigation Commands', () => {
    it('recognizes next field variants', () => {
      const variants = [
        'next field',
        'go to next field',
        'go to the next field',
        'move to next field',
        'next input',
        'next',
        'next field please',
      ];
      for (const v of variants) {
        const res = interpreter.parse(v);
        expect(res.isCommand).toBe(true);
        expect(res.type).toBe('NAVIGATE_NEXT');
      }
    });

    it('recognizes previous field variants', () => {
      const variants = [
        'previous field',
        'go to previous field',
        'go to the previous field',
        'go back one field',
        'go back a field',
        'previous',
        'previous field please',
      ];
      for (const v of variants) {
        const res = interpreter.parse(v);
        expect(res.isCommand).toBe(true);
        expect(res.type).toBe('NAVIGATE_PREVIOUS');
      }
    });

    it('recognizes targeted label navigation', () => {
      const res1 = interpreter.parse('go to patient name');
      expect(res1.isCommand).toBe(true);
      expect(res1.type).toBe('NAVIGATE_TO_LABEL');
      expect(res1.targetLabel).toBe('patient name');

      const res2 = interpreter.parse('focus chief complaint');
      expect(res2.isCommand).toBe(true);
      expect(res2.type).toBe('NAVIGATE_TO_LABEL');
      expect(res2.targetLabel).toBe('chief complaint');

      const res3 = interpreter.parse('go to the medical history');
      expect(res3.isCommand).toBe(true);
      expect(res3.type).toBe('NAVIGATE_TO_LABEL');
      expect(res3.targetLabel).toBe('medical history');
    });
  });

  describe('Text Formatting Commands', () => {
    it('recognizes new line and new paragraph', () => {
      expect(interpreter.parse('new line').type).toBe('FORMAT_NEW_LINE');
      expect(interpreter.parse('new paragraph').type).toBe('FORMAT_NEW_PARAGRAPH');
    });

    it('recognizes punctuation formatting', () => {
      expect(interpreter.parse('insert comma').type).toBe('FORMAT_COMMA');
      expect(interpreter.parse('comma').type).toBe('FORMAT_COMMA');
      expect(interpreter.parse('insert full stop').type).toBe('FORMAT_PERIOD');
      expect(interpreter.parse('period').type).toBe('FORMAT_PERIOD');
    });

    it('recognizes select all', () => {
      expect(interpreter.parse('select all').type).toBe('SELECT_ALL');
      expect(interpreter.parse('select this field').type).toBe('SELECT_ALL');
    });
  });

  describe('Text Editing & Correction Commands', () => {
    it('recognizes clear field commands', () => {
      expect(interpreter.parse('clear this field').type).toBe('CLEAR_FIELD');
      expect(interpreter.parse('clear field').type).toBe('CLEAR_FIELD');
      expect(interpreter.parse('empty this field').type).toBe('CLEAR_FIELD');
    });

    it('recognizes replace field commands with payload', () => {
      const res = interpreter.parse('replace this field with forty-six');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('REPLACE_FIELD');
      expect(res.textPayload).toBe('forty-six');
    });

    it('recognizes replace last sentence with payload', () => {
      const res = interpreter.parse('replace the last sentence with follow-up required in 3 days');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('REPLACE_LAST_SENTENCE');
      expect(res.textPayload).toBe('follow-up required in 3 days');
    });

    it('recognizes undo and repeat commands', () => {
      expect(interpreter.parse('undo last insertion').type).toBe('UNDO_INSERTION');
      expect(interpreter.parse('undo').type).toBe('UNDO_INSERTION');
      expect(interpreter.parse('repeat last insertion').type).toBe('REPEAT_INSERTION');
      expect(interpreter.parse('repeat').type).toBe('REPEAT_INSERTION');
    });

    it('recognizes copy field commands', () => {
      expect(interpreter.parse('copy this field').type).toBe('COPY_FIELD');
      expect(interpreter.parse('copy text').type).toBe('COPY_FIELD');
    });
  });

  describe('Distinguishing Commands from Dictation (Critical Feature)', () => {
    it('treats embedded command words as dictated text in Dictation mode', () => {
      const embeddedSentence = 'The report recommends moving to the next field';
      const res = interpreter.parse(embeddedSentence, 'DICTATION');
      expect(res.isCommand).toBe(false);
      expect(res.type).toBe('NOT_A_COMMAND');
      expect(res.rawTranscript).toBe(embeddedSentence);
    });

    it('treats clinical narratives mentioning punctuation or labels as dictated text', () => {
      const clinicalNarrative = 'Patient has no previous allergy and reported acute back pain';
      const res = interpreter.parse(clinicalNarrative, 'DICTATION');
      expect(res.isCommand).toBe(false);
      expect(res.type).toBe('NOT_A_COMMAND');
    });

    it('allows explicit dictation prefixes in Navigation mode', () => {
      const res1 = interpreter.parse('type Rahul Sharma', 'NAVIGATION');
      expect(res1.isCommand).toBe(true);
      expect(res1.type).toBe('EXPLICIT_DICTATION');
      expect(res1.textPayload).toBe('Rahul Sharma');

      const res2 = interpreter.parse('dictate 45', 'NAVIGATION');
      expect(res2.isCommand).toBe(true);
      expect(res2.type).toBe('EXPLICIT_DICTATION');
      expect(res2.textPayload).toBe('45');
    });

    it('in Command mode, marks unrecognized utterances as NOT_A_COMMAND with LOW confidence', () => {
      const res = interpreter.parse('Hello world this is some random talk', 'COMMAND');
      expect(res.isCommand).toBe(false);
      expect(res.type).toBe('NOT_A_COMMAND');
      expect(res.confidence).toBe('LOW');
      expect(res.explanation).toContain('Unrecognized command in Command Mode');
    });
  });
});
