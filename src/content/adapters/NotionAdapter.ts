import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class NotionAdapter implements EditorAdapter {
  readonly id = 'notion-editor';
  readonly name = 'Notion Block Editor Adapter';
  readonly priority = 45;

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isNotionHost = hostname.includes('notion.so') || hostname.includes('notion.site');

    const isNotionBlock =
      el.matches('[data-content-editable-leaf="true"]') ||
      el.matches('.notion-page-content [contenteditable="true"]') ||
      el.matches('[placeholder*="Type \'/\' for commands"]') ||
      !!el.closest('.notion-selectable, .notion-page-content');

    return isNotionHost && isNotionBlock;
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
      } else if (state?.range && el.contains(state.range.commonAncestorContainer)) {
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
        return {
          success: true,
          strategy: 'notion-beforeinput-handled',
          insertedText: text,
        };
      }

      // 2. Notion prefers execCommand('insertText') to avoid breaking block IDs and react hooks
      if (typeof document.execCommand === 'function') {
        const ok = document.execCommand('insertText', false, text);
        if (ok) {
          return {
            success: true,
            strategy: 'notion-execCommand',
            insertedText: text,
          };
        }
      }

      // 3. Fallback to careful Range node insertion within current block
      if (range && sel) {
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
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
          strategy: 'notion-range',
          insertedText: text,
        };
      }

      return {
        success: false,
        strategy: 'notion-failed',
        insertedText: text,
        error: 'Failed to insert text into Notion block',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'notion-error',
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
      description: 'Notion block editor with structural preservation',
    };
  }
}
