import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class GenericContentEditableAdapter implements EditorAdapter {
  readonly id = 'generic-contenteditable';
  readonly name = 'Generic ContentEditable Adapter';
  readonly priority = 15; // Above basic input, below specialized app adapters

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    return (
      el.isContentEditable ||
      el.contentEditable === 'true' ||
      el.getAttribute('contenteditable') === 'true' ||
      el.getAttribute('contenteditable') === '' ||
      el.getAttribute('role') === 'textbox'
    );
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    const sel = window.getSelection();
    let savedRange: Range | undefined;

    if (sel && sel.rangeCount > 0) {
      try {
        const r = sel.getRangeAt(0);
        // Ensure the selection is actually inside this element
        if (el.contains(r.commonAncestorContainer)) {
          savedRange = r.cloneRange();
        }
      } catch {}
    }

    return {
      element: el,
      type: 'contenteditable',
      range: savedRange,
      timestamp: Date.now(),
    };
  }

  restoreSelection(el: HTMLElement, state: SelectionState): boolean {
    try {
      el.focus({ preventScroll: false });
      const sel = window.getSelection();
      if (!sel) return false;

      if (state.range) {
        sel.removeAllRanges();
        sel.addRange(state.range);
        return true;
      }

      // If no valid range was saved, position caret at end of element
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }

  async insertText(
    el: HTMLElement,
    text: string,
    state?: SelectionState | null
  ): Promise<AdapterInsertionResult> {
    try {
      el.focus();
      const sel = window.getSelection();
      let range: Range | null = null;

      if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0);
      } else if (state?.range) {
        range = state.range;
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      if (!range) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // 1. Dispatch beforeinput event
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });
      const allowed = el.dispatchEvent(beforeInputEvent);

      if (!allowed) {
        // Framework handled beforeinput directly
        return {
          success: true,
          strategy: 'contenteditable-beforeinput-handled',
          insertedText: text,
        };
      }

      // 2. Primary Strategy: DOM Selection & Range
      if (range && sel) {
        range.deleteContents();

        const fragment = document.createDocumentFragment();
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            fragment.appendChild(document.createElement('br'));
          }
          if (lines[i].length > 0) {
            fragment.appendChild(document.createTextNode(lines[i]));
          }
        }

        const lastChild = fragment.lastChild || fragment;
        range.insertNode(fragment);

        range.setStartAfter(lastChild);
        range.setEndAfter(lastChild);
        sel.removeAllRanges();
        sel.addRange(range);

        el.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
          })
        );

        return {
          success: true,
          strategy: 'contenteditable-range',
          insertedText: text,
        };
      }

      // 3. Fallback: document.execCommand
      if (typeof document.execCommand === 'function') {
        const ok = document.execCommand('insertText', false, text);
        if (ok) {
          return {
            success: true,
            strategy: 'contenteditable-command',
            insertedText: text,
          };
        }
      }

      return {
        success: false,
        strategy: 'contenteditable-failed',
        insertedText: text,
        error: 'Unable to insert text into contenteditable',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'contenteditable-error',
        insertedText: text,
        error: err.message,
      };
    }
  }

  isSupported(): boolean {
    return true;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      canInsertDirectly: true,
      canPreserveSelection: true,
      supportsMultiline: true,
      supportsUndo: true,
      requiresClipboardFallback: false,
      preventAccidentalSend: true,
      compatibilityTier: 'FULL',
      description: 'Standard DOM Range and Selection API for contenteditable elements with execCommand fallback',
    };
  }
}
