import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class StandardInputAdapter implements EditorAdapter {
  readonly id = 'standard-input';
  readonly name = 'Standard Input & Textarea Adapter';
  readonly priority = 10; // Base generic priority

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    if (el instanceof HTMLInputElement) {
      const nonTextTypes = ['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
      return !nonTextTypes.includes(el.type.toLowerCase()) && !el.disabled && !el.readOnly;
    }

    if (el instanceof HTMLTextAreaElement) {
      return !el.disabled && !el.readOnly;
    }

    return false;
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;

    try {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const direction = el.selectionDirection || 'none';

      return {
        element: el,
        type: 'input',
        selectionStart: start,
        selectionEnd: end,
        selectionDirection: direction,
        timestamp: Date.now(),
      };
    } catch {
      return {
        element: el,
        type: 'input',
        selectionStart: el.value.length,
        selectionEnd: el.value.length,
        timestamp: Date.now(),
      };
    }
  }

  restoreSelection(el: HTMLElement, state: SelectionState): boolean {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;

    try {
      el.focus({ preventScroll: false });
      const start = state.selectionStart ?? el.value.length;
      const end = state.selectionEnd ?? el.value.length;
      const dir = state.selectionDirection || 'none';

      try {
        el.setSelectionRange(start, end, dir);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  async insertText(
    el: HTMLElement,
    text: string,
    state?: SelectionState | null
  ): Promise<AdapterInsertionResult> {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      return {
        success: false,
        strategy: 'standard-input-error',
        insertedText: text,
        error: 'Target element is not a standard input or textarea',
      };
    }

    try {
      el.focus();

      const start = state?.selectionStart ?? el.selectionStart ?? el.value.length;
      const end = state?.selectionEnd ?? el.selectionEnd ?? el.value.length;
      const originalValue = el.value;

      // 1. Dispatch beforeinput event
      const beforeInputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text,
      });
      el.dispatchEvent(beforeInputEvent);

      // If input is type="number", convert spoken number words to digits and guard setRangeText
      if (el instanceof HTMLInputElement && el.type === 'number') {
        text = this.convertSpokenNumberToDigits(text);
      }

      // 2. Perform insertion using setRangeText where available
      let setRangeSuccess = false;
      if (typeof el.setRangeText === 'function') {
        try {
          el.setRangeText(text, start, end, 'end');
          setRangeSuccess = true;
        } catch {
          setRangeSuccess = false;
        }
      }

      if (!setRangeSuccess) {
        const newValue = originalValue.slice(0, start) + text + originalValue.slice(end);
        el.value = newValue;
        const newCaret = start + text.length;
        try {
          el.setSelectionRange(newCaret, newCaret);
        } catch {}
      }

      // 3. React / Vue / Angular internal value tracker synchronization
      const tracker = (el as any)._valueTracker;
      if (tracker) {
        tracker.setValue(originalValue);
      }

      // Bypass React's overridden setter by calling the native HTML prototype descriptor
      const proto = el instanceof HTMLInputElement
        ? window.HTMLInputElement.prototype
        : window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, el.value);
      }

      // 4. Dispatch standard input and change events
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text,
        })
      );
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // 5. Auto-resize support for growing textareas
      if (el instanceof HTMLTextAreaElement) {
        this.triggerTextareaAutoResize(el);
      }

      return {
        success: true,
        strategy: 'input-textarea',
        insertedText: text,
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'standard-input-failed',
        insertedText: text,
        error: err.message,
      };
    }
  }

  private triggerTextareaAutoResize(el: HTMLTextAreaElement) {
    try {
      // Many modern chat and form textareas adjust height based on scrollHeight
      const currentHeight = el.style.height;
      if (currentHeight && currentHeight !== 'auto') {
        el.style.height = 'auto';
        el.style.height = `${Math.max(el.scrollHeight, 24)}px`;
      }
    } catch {
      // Ignore style adjustment errors
    }
  }

  private convertSpokenNumberToDigits(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return text;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;

    let isNegative = false;
    let cleanText = trimmed;
    if (/^(minus|negative)\s+/i.test(cleanText)) {
      isNegative = true;
      cleanText = cleanText.replace(/^(minus|negative)\s+/i, '');
    }

    // Decimal handling ("point" or "dot")
    if (/\s+(?:point|dot)\s+/i.test(cleanText)) {
      const parts = cleanText.split(/\s+(?:point|dot)\s+/i);
      if (parts.length === 2) {
        const intStr = this.parseSpokenPart(parts[0]);
        const decStr = this.parseDecimalWords(parts[1]);
        if (intStr !== null && decStr !== null) {
          return `${isNegative ? '-' : ''}${intStr}.${decStr}`;
        }
      }
    }

    const intStr = this.parseSpokenPart(cleanText);
    if (intStr !== null) {
      return `${isNegative ? '-' : ''}${intStr}`;
    }

    return text;
  }

  private parseDecimalWords(part: string): string | null {
    const digitWords: Record<string, string> = {
      zero: '0', one: '1', two: '2', three: '3', four: '4',
      five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    };
    const words = part.toLowerCase().split(/[\s-]+/);
    if (words.every((w) => digitWords[w] !== undefined)) {
      return words.map((w) => digitWords[w]).join('');
    }
    return this.parseSpokenPart(part);
  }

  private parseSpokenPart(part: string): string | null {
    const trimmed = part.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;

    const smallNumbers: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
      twenty: 20, thirty: 30, forty: 40, fifty: 50,
      sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    };

    const digitWords: Record<string, string> = {
      zero: '0', one: '1', two: '2', three: '3', four: '4',
      five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    };

    const words = trimmed.toLowerCase().split(/[\s-]+/);
    if (words.length > 1 && words.every((w) => digitWords[w] !== undefined)) {
      return words.map((w) => digitWords[w]).join('');
    }

    let total = 0;
    let current = 0;
    let hasMatch = false;

    for (const w of words) {
      if (smallNumbers[w] !== undefined) {
        current += smallNumbers[w];
        hasMatch = true;
      } else if (w === 'hundred') {
        current = (current || 1) * 100;
        hasMatch = true;
      } else if (w === 'thousand') {
        total += (current || 1) * 1000;
        current = 0;
        hasMatch = true;
      } else {
        const num = parseInt(w, 10);
        if (!isNaN(num)) {
          current += num;
          hasMatch = true;
        } else {
          return null;
        }
      }
    }

    if (hasMatch) {
      return String(total + current);
    }

    return null;
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
      description: 'Native HTML input and textarea with framework value-tracker synchronization',
    };
  }
}
