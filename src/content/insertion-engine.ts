import { FocusManager, SavedCaretState } from './focus-manager';
import { AdapterRegistry } from './adapters/AdapterRegistry';

export interface InsertionOptions {
  target?: SavedCaretState | null;
  smartSpacing?: boolean;
  forceClipboard?: boolean;
  bypassDedup?: boolean;
}

export interface InsertionResult {
  success: boolean;
  strategy: string;
  insertedText: string;
  fallbackNotice?: string;
  requiresPasteAction?: boolean;
  error?: string;
}

export interface UndoHistoryRecord {
  element: HTMLElement;
  action: 'INSERT' | 'CLEAR' | 'REPLACE' | 'FORMAT';
  previousValue?: string;
  previousHTML?: string;
  previousSelection?: { start: number; end: number };
  insertedText?: string;
  timestamp: number;
}

export class TextInsertionEngine {
  private focusManager: FocusManager;
  private registry = AdapterRegistry.getInstance();

  // Deduplication cache to prevent duplicate insertion
  private lastInsertionText = '';
  private lastInsertionTimestamp = 0;
  private readonly DEDUP_WINDOW_MS = 250;

  // Undo history stack
  private undoStack: UndoHistoryRecord[] = [];
  private readonly MAX_UNDO_STACK = 50;

  constructor(focusManager: FocusManager) {
    this.focusManager = focusManager;
  }

  /**
   * Universal text insertion entrypoint.
   */
  async insert(rawText: string, options: InsertionOptions = {}): Promise<InsertionResult> {
    if (!rawText) {
      return {
        success: false,
        strategy: 'clipboard-fallback',
        insertedText: '',
        error: 'Empty text provided',
      };
    }

    // Deduplication safeguard: ignore rapid accidental identical insertions (unless explicitly bypassed)
    const now = Date.now();
    if (
      !options.bypassDedup &&
      this.lastInsertionText === rawText &&
      now - this.lastInsertionTimestamp < this.DEDUP_WINDOW_MS
    ) {
      return {
        success: true,
        strategy: 'deduplicated',
        insertedText: rawText,
      };
    }

    if (options.forceClipboard) {
      return this.fallbackToClipboard(rawText, 'Forced clipboard fallback');
    }

    // 1. Resolve target element with dynamic reconnection recovery
    let target = options.target || this.focusManager.getActiveTarget();
    if (!target || !target.element || !target.element.isConnected) {
      target = this.focusManager.getActiveTarget();
    }

    if (!target || !target.element || !target.element.isConnected) {
      return this.fallbackToClipboard(rawText, 'No active editable field found on page');
    }

    const el = target.element;

    // 2. Ensure element is focused
    try {
      this.focusManager.restoreFocus(target);
    } catch (e) {
      console.warn('[VoiceFlow AI] Could not restore focus before insert', e);
    }

    // Record undo snapshot before mutating
    this.snapshotForUndo(el, 'INSERT', rawText);

    // 3. Smart spacing: Add leading space if needed
    const textToInsert = this.applySmartSpacing(rawText, target, options.smartSpacing ?? true);

    // 4. Resolve compatibility adapter
    const adapter = this.registry.getAdapter(el);

    try {
      const result = await adapter.insertText(el, textToInsert, target.selectionState);

      // Record successful insertion for deduplication
      if (result.success) {
        this.lastInsertionText = rawText;
        this.lastInsertionTimestamp = Date.now();
      }

      // If adapter required clipboard action (e.g. Google Docs / Office Canvas)
      if (result.requiresPasteAction) {
        return {
          success: true,
          strategy: result.strategy,
          insertedText: textToInsert,
          fallbackNotice: result.fallbackNotice,
          requiresPasteAction: true,
        };
      }

      if (!result.success && !result.strategy.includes('clipboard')) {
        return this.fallbackToClipboard(textToInsert, result.error || 'Adapter insertion failed');
      }

      return {
        success: result.success,
        strategy: result.strategy,
        insertedText: textToInsert,
        fallbackNotice: result.fallbackNotice,
        error: result.error,
      };
    } catch (err: any) {
      console.error(`[VoiceFlow AI] Insertion failed with adapter ${adapter.name}:`, err);
      return this.fallbackToClipboard(textToInsert, err.message);
    }
  }

  /**
   * Clears the current field with full undo snapshot preservation.
   */
  async clearField(target?: SavedCaretState | null): Promise<boolean> {
    const active = target || this.focusManager.getActiveTarget();
    if (!active || !active.element || !active.element.isConnected) return false;

    const el = active.element;
    this.snapshotForUndo(el, 'CLEAR');

    try {
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const tracker = (el as any)._valueTracker;
        if (tracker) tracker.setValue(el.value);

        const proto = el instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, '');
        } else {
          el.value = '';
        }

        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Contenteditable
        el.innerHTML = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Replaces entire field contents with the provided new text.
   */
  async replaceField(newText: string, target?: SavedCaretState | null): Promise<boolean> {
    const active = target || this.focusManager.getActiveTarget();
    if (!active || !active.element || !active.element.isConnected) return false;

    const el = active.element;
    this.snapshotForUndo(el, 'REPLACE', newText);

    try {
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = newText;
        el.setSelectionRange(newText.length, newText.length);

        // React valueTracker support
        const tracker = (el as any)._valueTracker;
        if (tracker) tracker.setValue('');

        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: newText }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Contenteditable / Lexical
        const adapter = this.registry.getAdapter(el);
        if (adapter.id === 'whatsapp-web' || typeof document.execCommand === 'function') {
          // Select all then execCommand
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand('insertText', false, newText);
        } else {
          el.textContent = newText;
        }
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: newText }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Replaces the last sentence in the active field with new text.
   */
  async replaceLastSentence(newSentence: string, target?: SavedCaretState | null): Promise<boolean> {
    const active = target || this.focusManager.getActiveTarget();
    if (!active || !active.element || !active.element.isConnected) return false;

    const el = active.element;
    this.snapshotForUndo(el, 'REPLACE', newSentence);

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const text = el.value;
      // Split on sentence boundaries (., !, ?)
      const match = text.match(/^(.*[.!?]\s*)([^.!?]+[.!?]?)$/s);
      if (match) {
        const updated = match[1] + newSentence;
        el.value = updated;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } else {
        // Only one sentence exists, replace entirely
        return this.replaceField(newSentence, active);
      }
    } else {
      const text = el.textContent || '';
      const match = text.match(/^(.*[.!?]\s*)([^.!?]+[.!?]?)$/s);
      if (match) {
        const updated = match[1] + newSentence;
        return this.replaceField(updated, active);
      } else {
        return this.replaceField(newSentence, active);
      }
    }
  }

  /**
   * Reverts the most recent insertion/modification.
   */
  async undoLastAction(): Promise<boolean> {
    if (this.undoStack.length === 0) return false;

    const record = this.undoStack.pop();
    if (!record || !record.element || !record.element.isConnected) return false;

    const el = record.element;
    try {
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (record.previousValue !== undefined) {
          const tracker = (el as any)._valueTracker;
          if (tracker) tracker.setValue(el.value);

          const proto = el instanceof HTMLInputElement
            ? window.HTMLInputElement.prototype
            : window.HTMLTextAreaElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, record.previousValue);
          } else {
            el.value = record.previousValue;
          }

          if (record.previousSelection) {
            try {
              el.setSelectionRange(record.previousSelection.start, record.previousSelection.end);
            } catch {}
          }
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'historyUndo' }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      } else {
        if (record.previousHTML !== undefined) {
          el.innerHTML = record.previousHTML;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'historyUndo' }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Repeats the most recently inserted text into the current field.
   */
  async repeatLastInsertion(): Promise<InsertionResult> {
    if (!this.lastInsertionText) {
      return {
        success: false,
        strategy: 'repeat-none',
        insertedText: '',
        error: 'No recent text to repeat',
      };
    }
    return this.insert(this.lastInsertionText, { smartSpacing: true, bypassDedup: true });
  }

  /**
   * Applies spoken formatting commands (new line, new paragraph, comma, period, select all).
   */
  async format(
    type: 'NEW_LINE' | 'NEW_PARAGRAPH' | 'COMMA' | 'PERIOD' | 'SELECT_ALL',
    target?: SavedCaretState | null
  ): Promise<boolean> {
    const active = target || this.focusManager.getActiveTarget();
    if (!active || !active.element || !active.element.isConnected) return false;

    const el = active.element;

    if (type === 'SELECT_ALL') {
      try {
        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.select();
        } else {
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        return true;
      } catch {
        return false;
      }
    }

    let token = '';
    switch (type) {
      case 'NEW_LINE':
        token = '\n';
        break;
      case 'NEW_PARAGRAPH':
        token = '\n\n';
        break;
      case 'COMMA':
        token = ', ';
        break;
      case 'PERIOD':
        token = '. ';
        break;
    }

    const res = await this.insert(token, { target: active, smartSpacing: false });
    return res.success;
  }

  /**
   * Copies the contents of the current field to clipboard.
   */
  async copyCurrentField(target?: SavedCaretState | null): Promise<string | null> {
    const active = target || this.focusManager.getActiveTarget();
    if (!active || !active.element || !active.element.isConnected) return null;

    const el = active.element;
    const text = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent || '';
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return text;
      } catch {}
    }
    return null;
  }

  private snapshotForUndo(el: HTMLElement, action: UndoHistoryRecord['action'], text?: string) {
    let prevVal: string | undefined;
    let prevHTML: string | undefined;
    let prevSel: { start: number; end: number } | undefined;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      prevVal = el.value;
      prevSel = {
        start: el.selectionStart ?? el.value.length,
        end: el.selectionEnd ?? el.value.length,
      };
    } else {
      prevHTML = el.innerHTML;
    }

    this.undoStack.push({
      element: el,
      action,
      previousValue: prevVal,
      previousHTML: prevHTML,
      previousSelection: prevSel,
      insertedText: text,
      timestamp: Date.now(),
    });

    if (this.undoStack.length > this.MAX_UNDO_STACK) {
      this.undoStack.shift();
    }
  }

  private applySmartSpacing(text: string, target: SavedCaretState, enabled: boolean): string {
    if (!enabled || !text) return text;
    if (/^[.,!?:;\s\n]/.test(text)) return text;

    const el = target.element;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? el.selectionStart ?? 0;
      if (start > 0) {
        const prevChar = el.value[start - 1];
        if (prevChar && !/\s/.test(prevChar)) {
          return ' ' + text;
        }
      }
    } else {
      const sel = window.getSelection();
      if (sel && sel.anchorNode && sel.anchorNode.textContent) {
        const offset = sel.anchorOffset;
        if (offset > 0) {
          const prevChar = sel.anchorNode.textContent[offset - 1];
          if (prevChar && !/\s/.test(prevChar)) {
            return ' ' + text;
          }
        }
      }
    }

    return text;
  }

  private async fallbackToClipboard(text: string, reason: string): Promise<InsertionResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.warn('[VoiceFlow AI] Clipboard write fallback failed', err);
    }

    return {
      success: false,
      strategy: 'clipboard-fallback',
      insertedText: text,
      fallbackNotice: 'No editable field detected. Dictated text copied to clipboard.',
      error: reason,
    };
  }

  getLastInsertedText(): string {
    return this.lastInsertionText;
  }
}
