import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class WhatsAppWebAdapter implements EditorAdapter {
  readonly id = 'whatsapp-web';
  readonly name = 'WhatsApp Web Composer Adapter';
  readonly priority = 70; // High priority for WhatsApp Web

  /**
   * Resolves the root contenteditable composer element from any nested child (e.g. <p>, <span>)
   */
  private getRootComposer(el: HTMLElement): HTMLElement {
    // 1. Look for explicit WhatsApp composer container
    const composer = el.closest<HTMLElement>(
      'footer div[contenteditable="true"], [data-lexical-editor="true"], [data-testid="conversation-compose-box"] div[contenteditable="true"], div[data-tab="10"][contenteditable="true"], footer [role="textbox"]'
    );
    if (composer) return composer;

    // 2. If el itself is contenteditable="true"
    if (el.getAttribute('contenteditable') === 'true') {
      return el;
    }

    // 3. Closest contenteditable ancestor
    const closestCe = el.closest<HTMLElement>('[contenteditable="true"]');
    if (closestCe) return closestCe;

    return el;
  }

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    const isWhatsAppHost =
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('web.whatsapp.com') ||
        window.location.hostname.includes('whatsapp.com'));

    if (isWhatsAppHost) {
      // In WhatsApp Web, any element inside the footer or compose box is the WhatsApp composer!
      if (
        el.closest('footer') ||
        el.closest('[data-testid="conversation-compose-box"]') ||
        el.closest('[data-lexical-editor="true"]') ||
        el.closest('div[contenteditable="true"]') ||
        el.isContentEditable ||
        el.getAttribute('data-tab') === '10' ||
        el.getAttribute('role') === 'textbox'
      ) {
        return true;
      }
    }

    // Generic matching for simulated test environments or embeds
    return !!(
      el.getAttribute('data-tab') === '10' ||
      el.closest('[data-tab="10"]') ||
      el.matches('footer [contenteditable="true"]') ||
      el.closest('footer [contenteditable="true"]') ||
      el.matches('[data-lexical-editor="true"]') ||
      el.closest('[data-lexical-editor="true"]') ||
      (el.getAttribute('role') === 'textbox' && !!el.closest('footer, ._ak1r, ._a3gq'))
    );
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    const composer = this.getRootComposer(el);
    const sel = window.getSelection();
    let savedRange: Range | undefined;

    if (sel && sel.rangeCount > 0) {
      try {
        const r = sel.getRangeAt(0);
        if (composer.contains(r.commonAncestorContainer) || el.contains(r.commonAncestorContainer)) {
          savedRange = r.cloneRange();
        }
      } catch {}
    }

    return {
      element: composer,
      type: 'contenteditable',
      range: savedRange,
      timestamp: Date.now(),
    };
  }

  restoreSelection(el: HTMLElement, state: SelectionState): boolean {
    try {
      const composer = this.getRootComposer(el);
      composer.focus({ preventScroll: false });
      const sel = window.getSelection();
      if (!sel) return false;

      if (state.range && composer.contains(state.range.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(state.range);
        return true;
      }

      // Default: position caret at the end of the composer
      const range = document.createRange();
      range.selectNodeContents(composer);
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
      const composer = this.getRootComposer(el);
      composer.focus({ preventScroll: false });

      const sel = window.getSelection();
      let range: Range | null = null;

      if (sel && sel.rangeCount > 0 && composer.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        range = sel.getRangeAt(0);
      } else if (state?.range && composer.contains(state.range.commonAncestorContainer)) {
        range = state.range;
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // If no valid selection range exists inside the composer, collapse caret to end
      if (!range || !sel || sel.rangeCount === 0) {
        range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // Safeguard: In WhatsApp, pressing bare Enter sends the message.
      // We NEVER dispatch an Enter key event.

      // PRIMARY STRATEGY: document.execCommand('insertText', false, text)
      // Meta's Lexical framework explicitly listens for insertText commands to update its internal AST,
      // clear the "Type a message" placeholder, and transition the microphone icon to the green Send arrow!
      let execWorked = false;
      if (typeof document.execCommand === 'function') {
        try {
          execWorked = document.execCommand('insertText', false, text);
        } catch {
          execWorked = false;
        }
      }

      if (execWorked) {
        // Dispatch input and change events to ensure external React listeners update
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
          })
        );
        composer.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          success: true,
          strategy: 'whatsapp-lexical-execCommand',
          insertedText: text,
        };
      }

      // FALLBACK STRATEGY 1: InputEvent('beforeinput')
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });
      const allowed = composer.dispatchEvent(beforeInputEvent);

      if (!allowed) {
        // WhatsApp Lexical editor intercepted beforeinput directly
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
          })
        );
        return {
          success: true,
          strategy: 'whatsapp-beforeinput-handled',
          insertedText: text,
        };
      }

      // FALLBACK STRATEGY 2: DOM Selection & Range fragment with <br>
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

        // Notify Lexical editor via InputEvent
        composer.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text,
          })
        );
        composer.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          success: true,
          strategy: 'whatsapp-lexical-range',
          insertedText: text,
        };
      }

      return {
        success: false,
        strategy: 'whatsapp-failed',
        insertedText: text,
        error: 'Failed to insert text into WhatsApp composer',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'whatsapp-error',
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
      description: 'WhatsApp Web Lexical composer with zero-accidental-send and AST synchronization',
    };
  }
}
