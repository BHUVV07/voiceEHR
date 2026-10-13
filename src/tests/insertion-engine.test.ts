import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';

describe('TextInsertionEngine', () => {
  let focusManager: FocusManager;
  let insertionEngine: TextInsertionEngine;

  beforeEach(() => {
    document.body.innerHTML = '';
    focusManager = new FocusManager();
    insertionEngine = new TextInsertionEngine(focusManager);
  });

  it('inserts text into an HTMLInputElement at caret position', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'Hello world';
    document.body.appendChild(input);

    input.focus();
    input.setSelectionRange(5, 5); // Right after "Hello"

    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    const result = await insertionEngine.insert('there', { smartSpacing: true });

    expect(result.success).toBe(true);
    expect(result.strategy).toBe('input-textarea');
    expect(input.value).toBe('Hello there world');
    expect(onInput).toHaveBeenCalled();
  });

  it('replaces selected text in a textarea', async () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'The quick brown fox';
    document.body.appendChild(textarea);

    textarea.focus();
    // Select "brown" (index 10 to 15)
    textarea.setSelectionRange(10, 15);

    const result = await insertionEngine.insert('red', { smartSpacing: false });

    expect(result.success).toBe(true);
    expect(textarea.value).toBe('The quick red fox');
  });

  it('inserts multiline text into contenteditable div', async () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.tabIndex = 0;
    div.innerHTML = 'Initial text';
    document.body.appendChild(div);

    div.focus();

    // Setup selection
    const range = document.createRange();
    range.selectNodeContents(div);
    range.collapse(false); // Move to end
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const result = await insertionEngine.insert('Line 1\nLine 2', { smartSpacing: true });

    expect(result.success).toBe(true);
    expect(div.textContent).toContain('Line 1');
    expect(div.textContent).toContain('Line 2');
  });

  it('falls back to clipboard when no editable field is present', async () => {
    // No inputs on body
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');

    const result = await insertionEngine.insert('Important note dictated by user');

    expect(result.success).toBe(false);
    expect(result.strategy).toBe('clipboard-fallback');
    expect(result.insertedText).toBe('Important note dictated by user');
    expect(clipboardSpy).toHaveBeenCalledWith('Important note dictated by user');
  });

  it('handles smart spacing: adds space after a word, not before punctuation', async () => {
    const input = document.createElement('input');
    input.value = 'Hello';
    document.body.appendChild(input);

    input.focus();
    input.setSelectionRange(5, 5);

    // Adding punctuation should NOT add leading space
    await insertionEngine.insert('.', { smartSpacing: true });
    expect(input.value).toBe('Hello.');

    // Adding word should add leading space
    await insertionEngine.insert('world', { smartSpacing: true });
    expect(input.value).toBe('Hello. world');
  });
});
