import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';
import { StandardInputAdapter } from './StandardInputAdapter';
import { GenericContentEditableAdapter } from './GenericContentEditableAdapter';

export class ChatGPTClaudeAdapter implements EditorAdapter {
  readonly id = 'chatgpt-claude';
  readonly name = 'ChatGPT & Claude AI Composer Adapter';
  readonly priority = 50;

  private inputDelegate = new StandardInputAdapter();
  private contentEditableDelegate = new GenericContentEditableAdapter();

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isAiHost =
      hostname.includes('chatgpt.com') ||
      hostname.includes('openai.com') ||
      hostname.includes('claude.ai') ||
      hostname.includes('anthropic.com');

    const isAiComposer =
      el.id === 'prompt-textarea' ||
      el.matches('[data-id*="root"]') ||
      el.matches('[data-placeholder*="Ask"], [placeholder*="Ask"], [placeholder*="Message"]') ||
      el.matches('.ProseMirror, [contenteditable="true"]');

    return isAiHost || (isAiComposer && (el.id === 'prompt-textarea' || el.matches('[data-placeholder*="ChatGPT"]')));
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return this.inputDelegate.captureSelection(el);
    }
    return this.contentEditableDelegate.captureSelection(el);
  }

  restoreSelection(el: HTMLElement, state: SelectionState): boolean {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return this.inputDelegate.restoreSelection(el, state);
    }
    return this.contentEditableDelegate.restoreSelection(el, state);
  }

  async insertText(
    el: HTMLElement,
    text: string,
    state?: SelectionState | null
  ): Promise<AdapterInsertionResult> {
    try {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        // StandardInputAdapter handles React _valueTracker, setRangeText, InputEvents, and auto-resize
        const res = await this.inputDelegate.insertText(el, text, state);

        // Ensure auto-expanding prompt textarea expands appropriately
        if (el instanceof HTMLTextAreaElement) {
          try {
            el.style.height = 'auto';
            el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
          } catch {}
        }

        return {
          ...res,
          strategy: 'chatgpt-claude-textarea',
        };
      } else {
        const res = await this.contentEditableDelegate.insertText(el, text, state);
        return {
          ...res,
          strategy: 'chatgpt-claude-contenteditable',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        strategy: 'chatgpt-claude-error',
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
      description: 'ChatGPT and Claude AI prompt composers with auto-resizing and zero-accidental-send guarantees',
    };
  }
}
