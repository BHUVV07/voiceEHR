import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';

describe('TextEditing & Undo Engine', () => {
  let container: HTMLDivElement;
  let focusManager: FocusManager;
  let insertionEngine: TextInsertionEngine;
  let inputEl: HTMLInputElement;
  let textareaEl: HTMLTextAreaElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.id = 'patient-name';
    inputEl.value = 'Initial Patient Name';
    container.appendChild(inputEl);

    textareaEl = document.createElement('textarea');
    textareaEl.id = 'clinical-notes';
    textareaEl.value = 'Patient reports fever for three days. No known allergies.';
    container.appendChild(textareaEl);

    focusManager = new FocusManager();
    insertionEngine = new TextInsertionEngine(focusManager);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Clear Field', () => {
    it('clears an input field completely and dispatches input events', async () => {
      inputEl.focus();
      let inputDispatched = false;
      inputEl.addEventListener('input', () => {
        inputDispatched = true;
      });

      const success = await insertionEngine.clearField();
      expect(success).toBe(true);
      expect(inputEl.value).toBe('');
      expect(inputDispatched).toBe(true);
    });

    it('clears a textarea field completely', async () => {
      textareaEl.focus();
      const success = await insertionEngine.clearField();
      expect(success).toBe(true);
      expect(textareaEl.value).toBe('');
    });
  });

  describe('Replace Field', () => {
    it('replaces input field content with new value', async () => {
      inputEl.focus();
      const success = await insertionEngine.replaceField('Rahul Sharma');
      expect(success).toBe(true);
      expect(inputEl.value).toBe('Rahul Sharma');
    });

    it('replaces textarea content with new multiline text', async () => {
      textareaEl.focus();
      const success = await insertionEngine.replaceField('Patient is stable.\nDischarged home.');
      expect(success).toBe(true);
      expect(textareaEl.value).toBe('Patient is stable.\nDischarged home.');
    });
  });

  describe('Replace Last Sentence', () => {
    it('replaces only the trailing sentence in a multi-sentence textarea', async () => {
      textareaEl.focus();
      // Original: "Patient reports fever for three days. No known allergies."
      const success = await insertionEngine.replaceLastSentence('Patient reports mild cough.');
      expect(success).toBe(true);
      expect(textareaEl.value).toBe('Patient reports fever for three days. Patient reports mild cough.');
    });
  });

  describe('Undo Behavior', () => {
    it('successfully undos a clear field action', async () => {
      inputEl.focus();
      expect(inputEl.value).toBe('Initial Patient Name');

      await insertionEngine.clearField();
      expect(inputEl.value).toBe('');

      const undone = await insertionEngine.undoLastAction();
      expect(undone).toBe(true);
      expect(inputEl.value).toBe('Initial Patient Name');
    });

    it('successfully undos a replace field action', async () => {
      inputEl.focus();
      await insertionEngine.replaceField('New Value');
      expect(inputEl.value).toBe('New Value');

      const undone = await insertionEngine.undoLastAction();
      expect(undone).toBe(true);
      expect(inputEl.value).toBe('Initial Patient Name');
    });

    it('supports multiple sequential undo operations in the stack', async () => {
      inputEl.focus();
      await insertionEngine.replaceField('Step 1');
      await insertionEngine.replaceField('Step 2');
      await insertionEngine.replaceField('Step 3');
      expect(inputEl.value).toBe('Step 3');

      await insertionEngine.undoLastAction();
      expect(inputEl.value).toBe('Step 2');

      await insertionEngine.undoLastAction();
      expect(inputEl.value).toBe('Step 1');

      await insertionEngine.undoLastAction();
      expect(inputEl.value).toBe('Initial Patient Name');
    });
  });

  describe('Repeat Last Insertion', () => {
    it('repeats the last inserted string', async () => {
      inputEl.focus();
      inputEl.value = '';
      await insertionEngine.insert('Echo text');
      expect(inputEl.value).toBe('Echo text');

      await insertionEngine.repeatLastInsertion();
      expect(inputEl.value).toBe('Echo text Echo text');
    });
  });

  describe('Formatting Commands', () => {
    it('inserts comma formatting', async () => {
      inputEl.focus();
      inputEl.value = 'First';
      await insertionEngine.format('COMMA');
      expect(inputEl.value).toBe('First, ');
    });

    it('inserts period formatting', async () => {
      inputEl.focus();
      inputEl.value = 'Diagnosis confirmed';
      await insertionEngine.format('PERIOD');
      expect(inputEl.value).toBe('Diagnosis confirmed. ');
    });

    it('inserts new paragraph in textarea', async () => {
      textareaEl.focus();
      textareaEl.value = 'Paragraph 1';
      await insertionEngine.format('NEW_PARAGRAPH');
      expect(textareaEl.value).toBe('Paragraph 1\n\n');
    });
  });

  describe('Copy Field', () => {
    it('copies current field text to clipboard', async () => {
      inputEl.focus();
      const copied = await insertionEngine.copyCurrentField();
      expect(copied).toBe('Initial Patient Name');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Initial Patient Name');
    });
  });

  describe('Deduplication Prevention', () => {
    it('prevents rapid duplicate insertions within 250ms window', async () => {
      inputEl.focus();
      inputEl.value = '';

      const res1 = await insertionEngine.insert('Unique text');
      const res2 = await insertionEngine.insert('Unique text');

      expect(res1.strategy).not.toBe('deduplicated');
      expect(res2.strategy).toBe('deduplicated');
    });
  });
});
