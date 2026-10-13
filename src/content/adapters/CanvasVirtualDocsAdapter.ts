import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';

export class CanvasVirtualDocsAdapter implements EditorAdapter {
  readonly id = 'canvas-virtual-docs';
  readonly name = 'Google Docs & Office Online Canvas Adapter';
  readonly priority = 60; // Highest priority when on Google Docs / Office Online

  detect(el: Element | null): boolean {
    if (typeof window === 'undefined') return false;

    const hostname = window.location.hostname;

    // Detect Google Docs / Sheets
    const isGoogleDocs =
      hostname.includes('docs.google.com') &&
      (window.location.pathname.includes('/document/') ||
        window.location.pathname.includes('/spreadsheets/') ||
        !!document.querySelector('.kix-appview, .kix-canvas-tile-content, .docs-texteventtarget-iframe'));

    // Detect Microsoft Word / Excel Online
    const isOfficeOnline =
      (hostname.includes('office.com') ||
        hostname.includes('officeapps.live.com') ||
        hostname.includes('sharepoint.com')) &&
      (!!document.querySelector('.WACViewPanel, .EditingSurface, #WACStatusBar') ||
        hostname.includes('word') ||
        hostname.includes('excel'));

    // Check if element is part of the virtual surface or canvas
    const isCanvasSurface =
      el instanceof HTMLCanvasElement ||
      !!el?.closest('.kix-appview, .WACViewPanel, .EditingSurface') ||
      el?.tagName.toLowerCase() === 'iframe' && (el as HTMLIFrameElement).className.includes('docs');

    return isGoogleDocs || isOfficeOnline || isCanvasSurface;
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    return {
      element: el,
      type: 'custom',
      timestamp: Date.now(),
    };
  }

  restoreSelection(_el: HTMLElement, _state: SelectionState): boolean {
    // Virtual canvas manages its own cursor independently of standard DOM selection
    return true;
  }

  async insertText(
    _el: HTMLElement,
    text: string,
    _state?: SelectionState | null
  ): Promise<AdapterInsertionResult> {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
    const shortcut = isMac ? '⌘V' : 'Ctrl+V';

    let appName = 'Google Docs';
    if (typeof window !== 'undefined') {
      if (window.location.hostname.includes('office') || window.location.hostname.includes('live.com')) {
        appName = 'Microsoft Office Online';
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      }

      return {
        success: true,
        strategy: 'canvas-virtual-clipboard',
        insertedText: text,
        requiresPasteAction: true,
        fallbackNotice: `${appName} uses canvas rendering. Text copied to clipboard — press ${shortcut} to paste.`,
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'canvas-virtual-error',
        insertedText: text,
        error: `Could not copy to clipboard for ${appName}: ${err.message}`,
      };
    }
  }

  isSupported(): boolean {
    return false; // Direct DOM insertion is unsupported on Canvas surfaces; clipboard workflow is active
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
      description: 'Canvas-rendered document surface (Google Docs / Office Online) with automatic clipboard copy and paste notification',
    };
  }
}
