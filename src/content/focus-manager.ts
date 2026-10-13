import { WIDGET_CONTAINER_ID } from '../shared/constants';
import { FocusTargetInfo } from '../shared/messages';
import { AdapterRegistry, SelectionState } from './adapters/AdapterRegistry';

export interface SavedCaretState {
  element: HTMLElement;
  adapterId: string;
  adapterName: string;
  isInputOrTextarea: boolean;
  selectionStart?: number;
  selectionEnd?: number;
  range?: Range;
  selectionState?: SelectionState;
  timestamp: number;
}

export class FocusManager {
  private lastTarget: SavedCaretState | null = null;
  private isTracking = false;
  private registry = AdapterRegistry.getInstance();

  constructor() {
    this.startTracking();
  }

  private isEditableElement(el: Element | null): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Ignore VoiceFlow widget elements
    if (el.closest(`#${WIDGET_CONTAINER_ID}`) || el.id === WIDGET_CONTAINER_ID) {
      return false;
    }

    // Check with compatibility adapters
    const adapter = this.registry.getAdapter(el);
    if (adapter.id !== 'fallback-clipboard') {
      return true;
    }

    // Standard input elements
    if (el instanceof HTMLInputElement) {
      const nonTextTypes = ['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
      return !nonTextTypes.includes(el.type.toLowerCase()) && !el.disabled && !el.readOnly;
    }

    // Textarea
    if (el instanceof HTMLTextAreaElement) {
      return !el.disabled && !el.readOnly;
    }

    // ContentEditable elements
    if (
      el.isContentEditable ||
      el.contentEditable === 'true' ||
      el.getAttribute('contenteditable') === 'true' ||
      el.getAttribute('contenteditable') === '' ||
      el.getAttribute('role') === 'textbox'
    ) {
      return true;
    }

    return false;
  }

  private findEditableParent(el: Element | null): HTMLElement | null {
    let current: Element | null = el;
    let foundEditable: HTMLElement | null = null;

    while (current && current !== document.body && current !== document.documentElement) {
      if (this.isEditableElement(current)) {
        foundEditable = current;
        // If this element explicitly has contenteditable="true" or is an input/textarea,
        // or has Lexical/textbox roles, this is the root editor container!
        if (
          current instanceof HTMLInputElement ||
          current instanceof HTMLTextAreaElement ||
          current.getAttribute('contenteditable') === 'true' ||
          current.getAttribute('data-lexical-editor') === 'true' ||
          current.getAttribute('role') === 'textbox' ||
          current.getAttribute('data-tab') === '10'
        ) {
          return current;
        }
      }
      current = current.parentElement;
    }

    return foundEditable;
  }

  private updateCaretFromElement(el: HTMLElement) {
    const adapter = this.registry.getAdapter(el);
    const selectionState = adapter.captureSelection(el);

    const isInputOrTextarea = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

    let start: number | undefined;
    let end: number | undefined;
    let range: Range | undefined;

    if (isInputOrTextarea) {
      try {
        start = (el as HTMLInputElement).selectionStart ?? (el as HTMLInputElement).value.length;
        end = (el as HTMLInputElement).selectionEnd ?? (el as HTMLInputElement).value.length;
      } catch {
        start = (el as HTMLInputElement).value.length;
        end = (el as HTMLInputElement).value.length;
      }
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        try {
          range = sel.getRangeAt(0).cloneRange();
        } catch {}
      }
    }

    this.lastTarget = {
      element: el,
      adapterId: adapter.id,
      adapterName: adapter.name,
      isInputOrTextarea,
      selectionStart: selectionState?.selectionStart ?? start,
      selectionEnd: selectionState?.selectionEnd ?? end,
      range: selectionState?.range ?? range,
      selectionState: selectionState || undefined,
      timestamp: Date.now(),
    };
  }

  startTracking() {
    if (this.isTracking || typeof document === 'undefined') return;
    this.isTracking = true;

    // Capture focus events as early as possible
    document.addEventListener(
      'focusin',
      (e) => {
        const target = e.target as Element | null;
        const editable = this.findEditableParent(target);
        if (editable) {
          this.updateCaretFromElement(editable);
        }
      },
      true
    );

    // Update selection on mouse up and key up
    document.addEventListener(
      'selectionchange',
      () => {
        const active = document.activeElement;
        const editable = this.findEditableParent(active);
        if (editable) {
          this.updateCaretFromElement(editable);
        }
      },
      true
    );

    document.addEventListener(
      'mouseup',
      (e) => {
        const target = e.target as Element | null;
        const editable = this.findEditableParent(target);
        if (editable) {
          this.updateCaretFromElement(editable);
        }
      },
      true
    );

    document.addEventListener(
      'keyup',
      (e) => {
        const target = e.target as Element | null;
        const editable = this.findEditableParent(target);
        if (editable) {
          this.updateCaretFromElement(editable);
        }
      },
      true
    );
  }

  /**
   * Captures the current active element right now if valid,
   * or returns the last known active target if still connected.
   */
  getActiveTarget(): SavedCaretState | null {
    // Check if document.activeElement is directly editable
    const currentActive = this.findEditableParent(document.activeElement);
    if (currentActive) {
      this.updateCaretFromElement(currentActive);
      return this.lastTarget;
    }

    // Otherwise check if the previously saved target is still in the DOM
    if (this.lastTarget && this.lastTarget.element.isConnected) {
      return this.lastTarget;
    }

    // Try finding any focused element or reasonable candidate
    const focused = document.querySelector('input:focus, textarea:focus, [contenteditable="true"]:focus, [role="textbox"]:focus');
    if (focused && focused instanceof HTMLElement) {
      const parent = this.findEditableParent(focused);
      if (parent) {
        this.updateCaretFromElement(parent);
        return this.lastTarget;
      }
    }

    // WhatsApp Web Smart Fallback:
    // If on web.whatsapp.com, automatically locate the message composer even if the user
    // clicked the mic widget without clicking inside the text box first!
    if (typeof window !== 'undefined' && window.location.hostname.includes('web.whatsapp.com')) {
      const waComposer = document.querySelector<HTMLElement>(
        'footer div[contenteditable="true"], [data-testid="conversation-compose-box"] div[contenteditable="true"], footer [role="textbox"], [data-tab="10"][contenteditable="true"], div[data-lexical-editor="true"]'
      );
      if (waComposer) {
        waComposer.focus({ preventScroll: false });
        this.updateCaretFromElement(waComposer);
        return this.lastTarget;
      }
    }

    return null;
  }

  /**
   * Restores focus and selection caret to the target element.
   */
  restoreFocus(target?: SavedCaretState | null): boolean {
    const toRestore = target || this.getActiveTarget();
    if (!toRestore || !toRestore.element.isConnected) {
      return false;
    }

    const el = toRestore.element;

    try {
      el.focus({ preventScroll: false });

      // Delegate to adapter restoration if selectionState is available
      if (toRestore.selectionState) {
        const adapter = this.registry.getAdapter(el);
        const restored = adapter.restoreSelection(el, toRestore.selectionState);
        if (restored) return true;
      }

      if (toRestore.isInputOrTextarea && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        const start = toRestore.selectionStart ?? el.value.length;
        const end = toRestore.selectionEnd ?? el.value.length;
        try {
          el.setSelectionRange(start, end);
        } catch {}
        return true;
      }

      if (!toRestore.isInputOrTextarea && toRestore.range) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(toRestore.range);
        }
        return true;
      }

      return true;
    } catch (err) {
      console.warn('[VoiceFlow AI] Failed to restore focus', err);
      return false;
    }
  }

  /**
   * Retrieves summary information about the current target.
   */
  getTargetInfo(): FocusTargetInfo {
    const target = this.getActiveTarget();
    if (!target) {
      return { hasTarget: false };
    }

    const el = target.element;
    const tagName = el.tagName.toLowerCase();
    let placeholder: string | undefined;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      placeholder = el.placeholder;
    } else {
      placeholder = el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || undefined;
    }

    let label = el.getAttribute('aria-label') || el.getAttribute('title') || undefined;

    // Check for explicit or parent label if aria-label is not present
    if (!label && el.id) {
      const l = document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.textContent?.trim()) {
        label = l.textContent.trim().replace(/[:*]+$/, '').trim();
      }
    }
    if (!label && el.closest('label')) {
      const l = el.closest('label');
      if (l && l.textContent?.trim()) {
        label = l.textContent.trim().replace(/[:*]+$/, '').trim();
      }
    }

    return {
      hasTarget: true,
      tagName: tagName.toUpperCase(),
      inputType: el instanceof HTMLInputElement ? el.type : undefined,
      isContentEditable: !target.isInputOrTextarea,
      placeholder: placeholder || undefined,
      label: label || placeholder || undefined,
      adapterName: target.adapterName,
    };
  }

  /**
   * Update saved selection bounds manually if text was inserted
   */
  updateSavedPosition(newOffset: number) {
    if (this.lastTarget && this.lastTarget.isInputOrTextarea) {
      this.lastTarget.selectionStart = newOffset;
      this.lastTarget.selectionEnd = newOffset;
      if (this.lastTarget.selectionState) {
        this.lastTarget.selectionState.selectionStart = newOffset;
        this.lastTarget.selectionState.selectionEnd = newOffset;
      }
    }
  }

  clear() {
    this.lastTarget = null;
  }
}
