import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class FallbackClipboardAdapter implements EditorAdapter {
  readonly id = 'fallback-clipboard';
  readonly name = 'Fallback Clipboard Safety Adapter';
  readonly priority = 0; // Lowest priority, acts as catch-all

  detect(_el: Element | null): boolean {
    return true; // Catches everything when no specific adapter matched
  }

  captureSelection(_el: HTMLElement): SelectionState | null {
    return null;
  }

  restoreSelection(_el: HTMLElement, _state: SelectionState): boolean {
    return false;
  }

  async insertText(
    _el: HTMLElement,
    text: string,
    _state?: SelectionState | null
  ): Promise<AdapterInsertionResult> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }

      return {
        success: false,
        strategy: 'clipboard-fallback',
        insertedText: text,
        fallbackNotice: 'No editable field detected. Dictated text copied to clipboard.',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'clipboard-fallback-error',
        insertedText: text,
        error: `Clipboard fallback failed: ${err.message}`,
      };
    }
  }

  isSupported(): boolean {
    return false;
  }

  getCapabilities(): AdapterCapabilities {
    return {
      canInsertDirectly: false,
      canPreserveSelection: false,
      supportsMultiline: true,
      supportsUndo: false,
      requiresClipboardFallback: true,
      preventAccidentalSend: true,
      compatibilityTier: 'CLIPBOARD_FALLBACK',
      description: 'Universal clipboard fallback to prevent silent text loss',
    };
  }
}
