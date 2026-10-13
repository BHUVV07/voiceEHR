import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class GmailComposerAdapter implements EditorAdapter {
  readonly id = 'gmail-composer';
  readonly name = 'Gmail Composition Adapter';
  readonly priority = 50; // High priority for Gmail

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Check if on Gmail domain or inside Gmail composer container
    const isGmailHost = typeof window !== 'undefined' && window.location.hostname.includes('mail.google.com');

    const isGmailEditable =
      el.matches('.Am.Al.editable') ||
      el.matches('[aria-label*="Message Body"]') ||
      el.matches('[aria-label*="Compose"]') ||
      el.getAttribute('g_editable') === 'true' ||
      (el.getAttribute('role') === 'textbox' && !!el.closest('.M9, .AD, .editable'));

    return isGmailHost && isGmailEditable;
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    const sel = window.getSelection();
    let savedRange: Range | undefined;

    if (sel && sel.rangeCount > 0) {
      try {
        const r = sel.getRangeAt(0);
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

      if (state.range && el.contains(state.range.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(state.range);
        return true;
      }

      // If range lost, position at top of body before quotes/signatures
      const range = document.createRange();
      const firstChild = el.firstChild;
      if (firstChild) {
        range.setStart(firstChild, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }

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
      } else if (state?.range && el.contains(state.range.commonAncestorContainer)) {
        range = state.range;
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // If cursor is not positioned, insert at start or active paragraph
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // 1. Dispatch beforeinput so Gmail's internal draft state tracks the change
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });
      el.dispatchEvent(beforeInputEvent);

      // 2. Perform DOM Range insertion
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

        // 3. Dispatch input event to notify Gmail's draft auto-save
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
          strategy: 'gmail-composer-range',
          insertedText: text,
        };
      }

      // Fallback
      if (typeof document.execCommand === 'function') {
        const ok = document.execCommand('insertText', false, text);
        if (ok) {
          return {
            success: true,
            strategy: 'gmail-composer-execCommand',
            insertedText: text,
          };
        }
      }

      return {
        success: false,
        strategy: 'gmail-composer-failed',
        insertedText: text,
        error: 'Could not obtain insertion range in Gmail message body',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'gmail-composer-error',
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
      description: 'Gmail compose body integration with draft preservation and accidental-send protection',
    };
  }
}
