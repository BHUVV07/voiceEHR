/**
 * Types and interfaces for the VoiceFlow AI Modular Editor Compatibility Layer.
 */

export interface SelectionState {
  element: HTMLElement;
  type: 'input' | 'contenteditable' | 'custom' | 'unsupported';
  selectionStart?: number;
  selectionEnd?: number;
  selectionDirection?: 'forward' | 'backward' | 'none';
  range?: Range;
  // Node path markers to recover range if DOM partially re-renders
  rangeAnchor?: {
    startContainerPath?: number[];
    startOffset?: number;
    endContainerPath?: number[];
    endOffset?: number;
  };
  timestamp: number;
}

export interface AdapterCapabilities {
  canInsertDirectly: boolean;
  canPreserveSelection: boolean;
  supportsMultiline: boolean;
  supportsUndo: boolean;
  requiresClipboardFallback: boolean;
  preventAccidentalSend: boolean;
  compatibilityTier: 'FULL' | 'PARTIAL' | 'CLIPBOARD_FALLBACK';
  description: string;
}

export interface AdapterInsertionResult {
  success: boolean;
  strategy: string;
  insertedText: string;
  fallbackNotice?: string;
  requiresPasteAction?: boolean;
  error?: string;
}

export interface EditorAdapter {
  readonly id: string;
  readonly name: string;
  readonly priority: number; // Higher number = evaluated earlier in registry

  /**
   * Returns true if this adapter handles the given DOM element or context.
   */
  detect(element: Element | null): boolean;

  /**
   * Captures the current selection and caret position within the element.
   */
  captureSelection(element: HTMLElement): SelectionState | null;

  /**
   * Restores a previously captured selection to the element.
   */
  restoreSelection(element: HTMLElement, state: SelectionState): boolean;

  /**
   * Performs text insertion into the element while respecting caret position,
   * framework state tracking, and application-specific constraints.
   */
  insertText(
    element: HTMLElement,
    text: string,
    state?: SelectionState | null
  ): Promise<AdapterInsertionResult>;

  /**
   * Returns whether the adapter's direct insertion mechanism is supported in the current environment.
   */
  isSupported(): boolean;

  /**
   * Exposes the adapter's capabilities and operational modes.
   */
  getCapabilities(): AdapterCapabilities;
}
