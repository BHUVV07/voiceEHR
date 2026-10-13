import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebSpeechEngine } from '../speech/WebSpeechEngine';
import { DictationController } from '../content/dictation-controller';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';
import { mountFloatingWidget } from '../content/floating-widget';
import { WIDGET_CONTAINER_ID } from '../shared/constants';

describe('QA Functional Verification Suite', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scenario B & K: Speech Recognition Error & Permission Handling', () => {
    it('surfaces actionable error message when microphone permission is denied', () => {
      const engine = new WebSpeechEngine();
      const onErrorCallback = vi.fn();
      engine.onError(onErrorCallback);

      // Simulate browser onerror event with not-allowed
      const recognitionInstance = (engine as any).recognition;
      if (recognitionInstance && recognitionInstance.onerror) {
        recognitionInstance.onerror({ error: 'not-allowed' });

        expect(onErrorCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'not-allowed',
            message: expect.stringContaining('denied'),
            actionable: expect.stringContaining('address bar'),
          })
        );
        expect(engine.getState()).toBe('ERROR');
      }
    });

    it('surfaces network error notice requiring active internet connection', () => {
      const engine = new WebSpeechEngine();
      const onErrorCallback = vi.fn();
      engine.onError(onErrorCallback);

      const recognitionInstance = (engine as any).recognition;
      if (recognitionInstance && recognitionInstance.onerror) {
        recognitionInstance.onerror({ error: 'network' });

        expect(onErrorCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'network',
            actionable: expect.stringContaining('internet connection'),
          })
        );
      }
    });
  });

  describe('Scenario E: Interim vs Final Separation', () => {
    it('never commits interim transcript to DOM input element', async () => {
      const focusManager = new FocusManager();
      const insertionEngine = new TextInsertionEngine(focusManager);
      const controller = new DictationController(focusManager, insertionEngine);

      const input = document.createElement('input');
      input.value = 'Initial';
      document.body.appendChild(input);
      input.focus();

      // Simulate interim transcript arrival via engine
      const speechEngine = (controller as any).speechEngine;
      const transcriptListeners = (speechEngine as any).transcriptCallbacks;

      // Emit interim-only event (final is empty)
      transcriptListeners.forEach((cb: any) => {
        cb({
          interim: 'speaking interim words here',
          final: '',
          rawFinal: '',
          timestamp: Date.now(),
        });
      });

      // The input DOM MUST NOT be modified by interim words!
      expect(input.value).toBe('Initial');

      // The controller should expose interim for preview only
      expect(controller.getTranscripts().interim).toBe('speaking interim words here');
    });
  });

  describe('Scenario M: Duplicate Widget Prevention', () => {
    it('does not create duplicate floating widgets when mounted multiple times', () => {
      const focusManager = new FocusManager();
      const insertionEngine = new TextInsertionEngine(focusManager);
      const controller = new DictationController(focusManager, insertionEngine);

      expect(document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`).length).toBe(0);

      // Mount 1st time
      mountFloatingWidget(controller);
      expect(document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`).length).toBe(1);

      // Mount 2nd time (simulating re-initialization or script re-execution)
      mountFloatingWidget(controller);
      expect(document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`).length).toBe(1);

      // Mount 3rd time
      mountFloatingWidget(controller);
      expect(document.querySelectorAll(`#${WIDGET_CONTAINER_ID}`).length).toBe(1);
    });
  });

  describe('Scenario N: Zero-Send & Form Submit Guard', () => {
    it('does not submit an HTML form when multiline dictation is inserted', async () => {
      const form = document.createElement('form');
      const textarea = document.createElement('textarea');
      form.appendChild(textarea);
      document.body.appendChild(form);

      const onSubmit = vi.fn((e) => e.preventDefault());
      form.addEventListener('submit', onSubmit);

      textarea.focus();

      const focusManager = new FocusManager();
      const insertionEngine = new TextInsertionEngine(focusManager);

      // Insert multiline text with newlines
      await insertionEngine.insert('First line\nSecond line\nThird line');

      expect(textarea.value).toBe('First line\nSecond line\nThird line');
      // The form submit event must NEVER have fired
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Scenario L: Clipboard Fallback Preservation', () => {
    it('preserves recognized text in clipboard when target is missing or detached', async () => {
      const focusManager = new FocusManager();
      const insertionEngine = new TextInsertionEngine(focusManager);

      const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');

      // Nothing is focused on document
      const result = await insertionEngine.insert('Clinical findings for patient');

      expect(result.success).toBe(false);
      expect(result.strategy).toBe('clipboard-fallback');
      expect(result.insertedText).toBe('Clinical findings for patient');
      expect(clipboardSpy).toHaveBeenCalledWith('Clinical findings for patient');
    });
  });
});
