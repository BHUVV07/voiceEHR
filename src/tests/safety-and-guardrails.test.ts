import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandInterpreter } from '../content/commands/CommandInterpreter';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';
import { DictationController } from '../content/dictation-controller';
import { SpeechEngineFactory } from '../speech/SpeechEngine';

describe('Safety and Consequential Actions Guardrails', () => {
  let interpreter: CommandInterpreter;

  beforeEach(() => {
    interpreter = new CommandInterpreter();
  });

  describe('Autonomous Form Submission & Message Dispatch Guardrails', () => {
    it('routes "submit form" to confirmation-required request, never executing autonomously', () => {
      const res = interpreter.parse('submit form', 'COMMAND');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('REQUEST_SUBMIT_FORM');
      expect(res.explanation).toContain('requires confirmation');
    });

    it('routes "send message" to confirmation-required request, never executing autonomously', () => {
      const res = interpreter.parse('send message', 'COMMAND');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('REQUEST_SUBMIT_FORM');
      expect(res.explanation).toContain('requires confirmation');
    });

    it('routes "clear all fields" to confirmation-required request', () => {
      const res = interpreter.parse('clear all fields', 'COMMAND');
      expect(res.isCommand).toBe(true);
      expect(res.type).toBe('REQUEST_CLEAR_ALL');
      expect(res.explanation).toContain('requires confirmation');
    });

    it('recognizes explicit confirmation and cancellation commands', () => {
      const confirmRes = interpreter.parse('confirm', 'COMMAND');
      expect(confirmRes.isCommand).toBe(true);
      expect(confirmRes.type).toBe('CONFIRM_PENDING');

      const cancelRes = interpreter.parse('cancel', 'COMMAND');
      expect(cancelRes.isCommand).toBe(true);
      expect(cancelRes.type).toBe('CANCEL_PENDING');
    });

    it('never recognizes arbitrary irreversible clinical deletion phrases as valid commands', () => {
      const phrases = [
        'finalize patient record',
        'sign and submit chart',
        'delete all patient records',
        'submit EHR encounter',
      ];
      for (const phrase of phrases) {
        const res = interpreter.parse(phrase, 'COMMAND');
        expect(res.isCommand).toBe(false);
        expect(res.type).toBe('NOT_A_COMMAND');
      }
    });

    it('in Dictation Mode, high-consequence phrases embedded in sentences remain pure text without executing actions', () => {
      const note = 'Physician will review and submit form after lab results return';
      const res = interpreter.parse(note, 'DICTATION');
      expect(res.isCommand).toBe(false);
      expect(res.type).toBe('NOT_A_COMMAND');
      expect(res.rawTranscript).toBe(note);
    });
  });

  describe('Pending Destructive Actions Execution Guardrails', () => {
    let focusManager: FocusManager;
    let insertionEngine: TextInsertionEngine;
    let controller: DictationController;
    let mockEngine: MockSafetySpeechEngine;
    let field1: HTMLInputElement;
    let field2: HTMLInputElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <form id="test-safety-form">
          <input id="field-1" name="field1" type="text" value="Original Value 1" />
          <input id="field-2" name="field2" type="text" value="Original Value 2" />
        </form>
      `;

      field1 = document.getElementById('field-1') as HTMLInputElement;
      field2 = document.getElementById('field-2') as HTMLInputElement;

      mockEngine = new MockSafetySpeechEngine();
      SpeechEngineFactory.setCustomEngine(mockEngine as any);

      focusManager = new FocusManager();
      insertionEngine = new TextInsertionEngine(focusManager);
      controller = new DictationController(focusManager, insertionEngine);
    });

    afterEach(() => {
      SpeechEngineFactory.setCustomEngine(null as any);
      document.body.innerHTML = '';
    });

    it('invalidates pending action when user navigates away before confirming', async () => {
      await controller.start();
      field1.focus();

      // 1. User requests clear all fields
      mockEngine.emitFinal('clear all fields');

      // 2. Instead of confirming, user navigates to next field
      mockEngine.emitFinal('next field');

      // 3. User later says "confirm"
      mockEngine.emitFinal('confirm');

      // Assert: Fields should NOT be cleared because navigation invalidated the pending action
      expect(field1.value).toBe('Original Value 1');
      expect(field2.value).toBe('Original Value 2');
    });

    it('invalidates pending action when user begins dictating text before confirming', async () => {
      await controller.start();
      field1.focus();

      // 1. User requests clear all fields
      mockEngine.emitFinal('clear all fields');

      // 2. Instead of confirming, user dictates text
      mockEngine.emitFinal('Patient is doing well');

      // 3. User says "confirm"
      mockEngine.emitFinal('confirm');

      // Assert: Fields are preserved
      expect(field1.value).toContain('Original Value 1');
      expect(field2.value).toBe('Original Value 2');
    });

    it('rejects stale confirmation after timeout (20 seconds)', async () => {
      await controller.start();
      field1.focus();

      // Mock Date.now to test expiration
      const realNow = Date.now;
      let mockTime = 100000;
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // 1. Request clear all
      mockEngine.emitFinal('clear all fields');

      // 2. Advance time past 20-second timeout
      mockTime += 25000;

      // 3. Confirm after timeout
      mockEngine.emitFinal('confirm');

      // Assert: Fields should NOT be cleared
      expect(field1.value).toBe('Original Value 1');
      expect(field2.value).toBe('Original Value 2');

      vi.spyOn(Date, 'now').mockImplementation(realNow);
    });

    it('clears all fields when immediately confirmed within window', async () => {
      await controller.start();
      field1.focus();

      mockEngine.emitFinal('clear all fields');
      mockEngine.emitFinal('confirm');

      expect(field1.value).toBe('');
      expect(field2.value).toBe('');
    });

    it('"clear this field" only clears the active element and preserves adjacent inputs', async () => {
      await controller.start();
      field1.focus();

      mockEngine.emitFinal('clear this field');

      expect(field1.value).toBe('');
      expect(field2.value).toBe('Original Value 2');
    });
  });
});

class MockSafetySpeechEngine {
  readonly id = 'mock-safety-speech';
  readonly name = 'Mock Safety Speech Engine';
  state = 'IDLE';
  private transcriptCb?: (ev: any) => void;
  private stateChangeCb?: (st: string) => void;

  isSupported() { return true; }
  getState() { return this.state; }
  async start() {
    this.state = 'LISTENING';
    this.stateChangeCb?.('LISTENING');
  }
  async stop() {
    this.state = 'IDLE';
    this.stateChangeCb?.('IDLE');
  }
  abort() {
    this.state = 'IDLE';
  }
  onStateChange(cb: any) { this.stateChangeCb = cb; return () => {}; }
  onTranscript(cb: any) { this.transcriptCb = cb; return () => {}; }
  onError() { return () => {}; }

  emitFinal(text: string) {
    this.transcriptCb?.({
      interim: '',
      final: text,
      rawFinal: text,
      timestamp: Date.now(),
    });
  }
}
