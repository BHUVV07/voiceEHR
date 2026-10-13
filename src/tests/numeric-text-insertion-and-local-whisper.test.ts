import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';
import { StandardInputAdapter } from '../content/adapters/StandardInputAdapter';
import { LocalWhisperEngine } from '../speech/LocalWhisperEngine';
import { SpeechEngineFactory } from '../speech/SpeechEngine';

describe('Numeric and Text Insertion & Local Whisper Engine Verification', () => {
  let focusManager: FocusManager;
  let insertionEngine: TextInsertionEngine;
  let standardAdapter: StandardInputAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    focusManager = new FocusManager();
    insertionEngine = new TextInsertionEngine(focusManager);
    standardAdapter = new StandardInputAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('Standard Text Fields & ContentEditable (Preserving Spoken Meaning)', () => {
    it('preserves spoken number phrases in standard text inputs without arbitrary conversion', async () => {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      document.body.appendChild(textInput);
      textInput.focus();

      const phrase = 'I have three children and two dogs';
      const result = await standardAdapter.insertText(textInput, phrase);

      expect(result.success).toBe(true);
      expect(textInput.value).toBe('I have three children and two dogs');
    });

    it('preserves spoken clinical text with number words in textarea', async () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const clinicalNote = 'Patient reports fever for three days with two episodes of chills';
      const result = await standardAdapter.insertText(textarea, clinicalNote);

      expect(result.success).toBe(true);
      expect(textarea.value).toBe(clinicalNote);
    });

    it('preserves phone number input without arbitrary mangling', async () => {
      const telInput = document.createElement('input');
      telInput.type = 'tel';
      document.body.appendChild(telInput);
      telInput.focus();

      const spokenPhone = 'Nine eight seven six five four three two one zero';
      const result = await standardAdapter.insertText(telInput, spokenPhone);

      expect(result.success).toBe(true);
      expect(telInput.value).toBe('Nine eight seven six five four three two one zero');
    });
  });

  describe('Numeric Fields (<input type="number"> Spoken Conversion)', () => {
    it('converts spoken compound whole numbers into digits', async () => {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      document.body.appendChild(numInput);
      numInput.focus();

      await standardAdapter.insertText(numInput, 'forty-five');
      expect(numInput.value).toBe('45');
    });

    it('converts spoken decimal numbers into valid numeric strings ("ninety eight point six" -> "98.6")', async () => {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      document.body.appendChild(numInput);
      numInput.focus();

      await standardAdapter.insertText(numInput, 'ninety eight point six');
      expect(numInput.value).toBe('98.6');
    });

    it('converts spoken decimal numbers with "dot" ("one point two five" -> "1.25")', async () => {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      document.body.appendChild(numInput);
      numInput.focus();

      await standardAdapter.insertText(numInput, 'one point two five');
      expect(numInput.value).toBe('1.25');
    });

    it('converts negative numbers ("minus five" -> "-5")', async () => {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      document.body.appendChild(numInput);
      numInput.focus();

      await standardAdapter.insertText(numInput, 'minus five');
      expect(numInput.value).toBe('-5');
    });

    it('preserves pre-formatted numeric strings ("45.5")', async () => {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      document.body.appendChild(numInput);
      numInput.focus();

      await standardAdapter.insertText(numInput, '45.5');
      expect(numInput.value).toBe('45.5');
    });
  });

  describe('Existing Text, Cursor Positioning, Multiline Notes & Undo', () => {
    it('inserts text at existing cursor position in standard input', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Hello World';
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(5, 5); // Right after "Hello"

      await insertionEngine.insert(' Beautiful', { smartSpacing: false });
      expect(input.value).toBe('Hello Beautiful World');
    });

    it('replaces active selection when inserting into standard input', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Diagnosis: Inconclusive';
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(11, 23); // Select "Inconclusive"

      await insertionEngine.insert('Confirmed Positive', { smartSpacing: false });
      expect(input.value).toBe('Diagnosis: Confirmed Positive');
    });

    it('handles multiline notes with paragraph breaks in textarea', async () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      await insertionEngine.insert('First observation note.', { smartSpacing: false });
      await insertionEngine.format('NEW_PARAGRAPH');
      await insertionEngine.insert('Follow-up observation note.', { smartSpacing: false });

      expect(textarea.value).toBe('First observation note.\n\nFollow-up observation note.');
    });

    it('undo restores previous value after replaceField', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Initial Value';
      document.body.appendChild(input);
      input.focus();

      await insertionEngine.replaceField('Replaced Value');
      expect(input.value).toBe('Replaced Value');

      const undoOk = await insertionEngine.undoLastAction();
      expect(undoOk).toBe(true);
      expect(input.value).toBe('Initial Value');
    });

    it('undo restores previous value after clearField', async () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'Vital Sign 120/80';
      document.body.appendChild(input);
      input.focus();

      await insertionEngine.clearField();
      expect(input.value).toBe('');

      const undoOk = await insertionEngine.undoLastAction();
      expect(undoOk).toBe(true);
      expect(input.value).toBe('Vital Sign 120/80');
    });
  });

  describe('Local Whisper Engine Security & Privacy Guarantees', () => {
    it('implements ISpeechEngine interface with id="local-whisper"', () => {
      const whisper = new LocalWhisperEngine();
      expect(whisper.id).toBe('local-whisper');
      expect(whisper.name).toContain('Local Whisper');
      expect(whisper.getState()).toBe('IDLE');
    });

    it('strictly refuses to silently fall back to cloud Web Speech API when audio capture is unsupported', async () => {
      const whisper = new LocalWhisperEngine();
      let capturedError: any = null;

      whisper.onError((err) => {
        capturedError = err;
      });

      await expect(whisper.start()).rejects.toThrow();

      expect(whisper.getState()).toBe('ERROR');
      expect(capturedError).not.toBeNull();
      expect(capturedError.code).toBe('local-whisper-unsupported');
    });

    it('strictly refuses to silently fall back to cloud Web Speech API when on-device model is pending', async () => {
      // Mock mediaDevices to reach the model check
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn() },
        configurable: true,
      });

      const whisper = new LocalWhisperEngine();
      let capturedError: any = null;

      whisper.onError((err) => {
        capturedError = err;
      });

      await expect(whisper.start()).rejects.toThrow();

      expect(whisper.getState()).toBe('ERROR');
      expect(capturedError).not.toBeNull();
      expect(capturedError.code).toBe('local-whisper-model-pending');
      expect(capturedError.actionable).toContain('will NOT silently fall back to cloud servers');

      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
    });

    it('factory produces separate instances for web-speech and local-whisper when requested', () => {
      SpeechEngineFactory.setCustomEngine(null);
      const webEngine = SpeechEngineFactory.getInstance('web-speech');
      const localEngine = SpeechEngineFactory.getInstance('local-whisper');

      expect(webEngine.id).toBe('web-speech');
      expect(localEngine.id).toBe('local-whisper');
      expect(webEngine).not.toBe(localEngine);
    });
  });
});
