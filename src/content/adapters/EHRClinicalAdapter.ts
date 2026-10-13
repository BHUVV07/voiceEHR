import { EditorAdapter, SelectionState, AdapterCapabilities, AdapterInsertionResult } from './types';
import { StandardInputAdapter } from './StandardInputAdapter';
import { GenericContentEditableAdapter } from './GenericContentEditableAdapter';

export class EHRClinicalAdapter implements EditorAdapter {
  readonly id = 'ehr-clinical';
  readonly name = 'EHR & Clinical Systems Adapter';
  readonly priority = 40;

  private inputDelegate = new StandardInputAdapter();
  private contentEditableDelegate = new GenericContentEditableAdapter();

  detect(el: Element | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;

    const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const path = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';

    const isEhrHost =
      hostname.includes('mychart') ||
      hostname.includes('epic') ||
      hostname.includes('cerner') ||
      hostname.includes('athenahealth') ||
      hostname.includes('nextgen') ||
      hostname.includes('eclinicalworks') ||
      hostname.includes('practicefusion') ||
      hostname.includes('ehr') ||
      hostname.includes('emr') ||
      path.includes('patient') ||
      path.includes('encounter') ||
      path.includes('clinical');

    const hasClinicalFieldMarkers =
      el.matches('[data-clinical="true"], [data-ehr="true"]') ||
      el.matches('[id*="encounter"], [id*="clinical"], [id*="soap"]') ||
      el.matches('[name*="clinical"], [name*="history"], [name*="notes"]') ||
      el.matches('[aria-label*="clinical" i], [aria-label*="soap note" i]');

    return isEhrHost || hasClinicalFieldMarkers;
  }

  captureSelection(el: HTMLElement): SelectionState | null {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return this.inputDelegate.captureSelection(el);
    }
    return this.contentEditableDelegate.captureSelection(el);
  }

  restoreSelection(el: HTMLElement, state: SelectionState): boolean {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
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
      // Direct insertion with zero telemetry and zero auto-submission
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const res = await this.inputDelegate.insertText(el, text, state);
        return {
          ...res,
          strategy: 'ehr-clinical-input',
        };
      } else {
        const res = await this.contentEditableDelegate.insertText(el, text, state);
        return {
          ...res,
          strategy: 'ehr-clinical-contenteditable',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        strategy: 'ehr-clinical-error',
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
      description: 'EHR and hospital clinical text fields with strict zero-telemetry and non-intrusive insertion',
    };
  }
}
