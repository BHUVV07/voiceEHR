import { PageUnderstandingEngine, FieldDescriptor } from '../page-understanding/PageUnderstandingEngine';
import { FocusManager } from '../focus-manager';
import { AudioFeedback } from '../audio-feedback';

export interface NavigationResult {
  success: boolean;
  field?: FieldDescriptor;
  feedback: string;
  isAmbiguous?: boolean;
  ambiguousMatches?: string[];
}

export class VoiceNavigationEngine {
  private pageEngine: PageUnderstandingEngine;
  private focusManager: FocusManager;
  private currentFieldIndex = -1;
  private activeHighlightEl: HTMLElement | null = null;
  private caretPolicy: 'end' | 'select' | 'preserve' = 'end';
  private highlightEnabled = true;

  constructor(pageEngine: PageUnderstandingEngine, focusManager: FocusManager) {
    this.pageEngine = pageEngine;
    this.focusManager = focusManager;
    this.injectHighlightStyles();
  }

  setCaretPolicy(policy: 'end' | 'select' | 'preserve') {
    this.caretPolicy = policy;
  }

  setHighlightEnabled(enabled: boolean) {
    this.highlightEnabled = enabled;
    if (!enabled && this.activeHighlightEl) {
      this.clearHighlight();
    }
  }

  private injectHighlightStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('voiceflow-nav-highlight-style')) return;

    const style = document.createElement('style');
    style.id = 'voiceflow-nav-highlight-style';
    style.textContent = `
      .voiceflow-active-nav-target {
        outline: 2.5px solid #10b981 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.45) !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  private highlightField(el: HTMLElement) {
    if (!this.highlightEnabled) return;
    this.clearHighlight();
    this.activeHighlightEl = el;
    try {
      el.classList.add('voiceflow-active-nav-target');
    } catch {}
  }

  private clearHighlight() {
    if (this.activeHighlightEl) {
      try {
        this.activeHighlightEl.classList.remove('voiceflow-active-nav-target');
      } catch {}
      this.activeHighlightEl = null;
    }
  }

  /**
   * Identifies the current navigation index based on the currently focused element
   */
  private syncCurrentIndex(): number {
    const fields = this.pageEngine.getFields();
    if (fields.length === 0) {
      this.currentFieldIndex = -1;
      return -1;
    }

    const activeTarget = this.focusManager.getActiveTarget();
    if (activeTarget && activeTarget.element) {
      const match = this.pageEngine.getFieldByElement(activeTarget.element);
      if (match) {
        this.currentFieldIndex = match.index;
        return match.index;
      }
    }

    // If active element in document matches
    const activeDoc = document.activeElement as HTMLElement | null;
    if (activeDoc) {
      const match = this.pageEngine.getFieldByElement(activeDoc);
      if (match) {
        this.currentFieldIndex = match.index;
        return match.index;
      }
    }

    return this.currentFieldIndex;
  }

  /**
   * Navigates to the next eligible editable field
   */
  navigateNext(): NavigationResult {
    const fields = this.pageEngine.scan();
    if (fields.length === 0) {
      AudioFeedback.playError();
      return {
        success: false,
        feedback: 'No editable form fields found on this page',
      };
    }

    this.syncCurrentIndex();
    let nextIndex = this.currentFieldIndex + 1;
    if (nextIndex >= fields.length) {
      nextIndex = 0; // Wrap around to top
    }

    const targetField = fields[nextIndex];
    return this.focusField(targetField, `Moved to ${targetField.label}`);
  }

  /**
   * Navigates to the previous eligible editable field
   */
  navigatePrevious(): NavigationResult {
    const fields = this.pageEngine.scan();
    if (fields.length === 0) {
      AudioFeedback.playError();
      return {
        success: false,
        feedback: 'No editable form fields found on this page',
      };
    }

    this.syncCurrentIndex();
    let prevIndex = this.currentFieldIndex - 1;
    if (prevIndex < 0) {
      prevIndex = fields.length - 1; // Wrap around to bottom
    }

    const targetField = fields[prevIndex];
    return this.focusField(targetField, `Moved back to ${targetField.label}`);
  }

  /**
   * Resolves a spoken query label and navigates to the matching field:
   * 1. Exact label / accessible name match
   * 2. Controlled partial / fuzzy match
   * 3. Disambiguation if multiple fields match
   */
  navigateToLabel(queryLabel: string): NavigationResult {
    const fields = this.pageEngine.scan();
    if (fields.length === 0) {
      AudioFeedback.playError();
      return {
        success: false,
        feedback: 'No editable fields found on this page',
      };
    }

    const normalizedQuery = queryLabel
      .toLowerCase()
      .trim()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ');

    if (!normalizedQuery) {
      return {
        success: false,
        feedback: 'Please specify a field label, e.g. "Go to Patient Name"',
      };
    }

    // 1. Exact matches
    const exactMatches = fields.filter((f) => {
      const normLabel = f.normalizedLabel;
      const normAccessible = f.accessibleName.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '').trim();
      return normLabel === normalizedQuery || normAccessible === normalizedQuery;
    });

    if (exactMatches.length === 1) {
      const match = exactMatches[0];
      return this.focusField(match, `Focused ${match.label}`);
    }

    if (exactMatches.length > 1) {
      AudioFeedback.playError();
      const labels = exactMatches.map((m) => `"${m.label}"`).join(' and ');
      return {
        success: false,
        isAmbiguous: true,
        ambiguousMatches: exactMatches.map((m) => m.label),
        feedback: `Multiple fields match "${queryLabel}": ${labels}. Please clarify.`,
      };
    }

    // 2. Controlled Partial / Prefix / Infix matches
    const partialMatches = fields.filter((f) => {
      const normLabel = f.normalizedLabel;
      const normAccessible = f.accessibleName.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '').trim();
      return (
        normLabel.includes(normalizedQuery) ||
        normalizedQuery.includes(normLabel) ||
        normAccessible.includes(normalizedQuery) ||
        normalizedQuery.includes(normAccessible)
      );
    });

    if (partialMatches.length === 1) {
      const match = partialMatches[0];
      return this.focusField(match, `Focused ${match.label}`);
    }

    if (partialMatches.length > 1) {
      AudioFeedback.playError();
      const labels = partialMatches.map((m) => `"${m.label}"`).join(', ');
      return {
        success: false,
        isAmbiguous: true,
        ambiguousMatches: partialMatches.map((m) => m.label),
        feedback: `Multiple fields match "${queryLabel}": ${labels}. Please specify exact field.`,
      };
    }

    // 3. Fallback: check placeholder or ID
    const fallbackMatches = fields.filter((f) => {
      const p = (f.placeholder || '').toLowerCase().trim();
      const id = f.id.toLowerCase().replace(/[_-]+/g, ' ');
      return p.includes(normalizedQuery) || id.includes(normalizedQuery);
    });

    if (fallbackMatches.length === 1) {
      const match = fallbackMatches[0];
      return this.focusField(match, `Focused ${match.label}`);
    }

    AudioFeedback.playError();
    const available = fields.slice(0, 4).map((f) => `"${f.label}"`).join(', ');
    return {
      success: false,
      feedback: `Field "${queryLabel}" not found. Available: ${available}...`,
    };
  }

  /**
   * Navigates to a specific form section or jumps to next/previous section
   */
  navigateToSection(sectionQuery: string): NavigationResult {
    const fields = this.pageEngine.scan();
    if (fields.length === 0) {
      AudioFeedback.playError();
      return {
        success: false,
        feedback: 'No form fields found on this page',
      };
    }

    this.syncCurrentIndex();
    const currentField = this.currentFieldIndex >= 0 ? fields[this.currentFieldIndex] : null;
    const currentSection = currentField?.section;

    if (sectionQuery === 'NEXT') {
      const nextSecField = fields.find((f) => f.index > this.currentFieldIndex && f.section && f.section !== currentSection);
      if (nextSecField) {
        return this.focusField(nextSecField, `Moved to section "${nextSecField.section}", field "${nextSecField.label}"`);
      }
      const firstSecField = fields.find((f) => f.section && f.section !== currentSection);
      if (firstSecField) {
        return this.focusField(firstSecField, `Wrapped to section "${firstSecField.section}", field "${firstSecField.label}"`);
      }
      return {
        success: false,
        feedback: 'No subsequent form section detected',
      };
    }

    if (sectionQuery === 'PREV') {
      const prevSecFields = fields.filter((f) => f.index < this.currentFieldIndex && f.section && f.section !== currentSection);
      if (prevSecFields.length > 0) {
        const target = prevSecFields[prevSecFields.length - 1];
        const firstInSec = fields.find((f) => f.section === target.section) || target;
        return this.focusField(firstInSec, `Moved back to section "${firstInSec.section}", field "${firstInSec.label}"`);
      }
      return {
        success: false,
        feedback: 'No previous form section detected',
      };
    }

    // Specific section query (e.g. "Medical History", "Patient Info")
    const cleanQuery = sectionQuery.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '');
    const matches = fields.filter((f) => {
      if (!f.section) return false;
      const secNorm = f.section.toLowerCase().trim().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '');
      return secNorm === cleanQuery || secNorm.includes(cleanQuery) || cleanQuery.includes(secNorm);
    });

    if (matches.length > 0) {
      const targetField = matches[0];
      return this.focusField(targetField, `Moved to section "${targetField.section}", field "${targetField.label}"`);
    }

    AudioFeedback.playError();
    const availableSections = this.pageEngine.getSections();
    const availableText = availableSections.length > 0 ? `Available sections: ${availableSections.map(s => `"${s}"`).join(', ')}` : 'No labeled sections found.';
    return {
      success: false,
      feedback: `Section "${sectionQuery}" not found. ${availableText}`,
    };
  }

  /**
   * Focuses the given field descriptor, scrolls into view, applies caret policy,
   * highlights the field, and plays navigation audio feedback.
   */
  private focusField(field: FieldDescriptor, feedbackMessage: string): NavigationResult {
    let target = field;

    // Stale-Element Detection & Recovery
    if (!this.pageEngine.isFieldValid(target)) {
      const freshFields = this.pageEngine.scan();
      const recovered = freshFields.find((f) => f.id === target.id || f.normalizedLabel === target.normalizedLabel);
      if (recovered && this.pageEngine.isFieldValid(recovered)) {
        target = recovered;
      } else {
        AudioFeedback.playError();
        return {
          success: false,
          feedback: `Target field "${field.label}" is no longer available in the document.`,
        };
      }
    }

    const el = target.element;
    this.currentFieldIndex = target.index;

    try {
      // 1. Scroll into view smoothly
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }

      // 2. Focus element
      el.focus({ preventScroll: true });

      // 3. Apply Caret Placement Policy without overwriting existing data
      this.applyCaretPolicy(el);

      // 4. Highlight field visually
      this.highlightField(el);

      // 5. Play chime
      AudioFeedback.playNavigation();

      return {
        success: true,
        field,
        feedback: feedbackMessage,
      };
    } catch (err: any) {
      console.warn('[VoiceFlow AI] Failed to focus field', err);
      AudioFeedback.playError();
      return {
        success: false,
        field,
        feedback: `Failed to focus ${field.label}: ${err.message}`,
      };
    }
  }

  private applyCaretPolicy(el: HTMLElement) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value.length;
      if (this.caretPolicy === 'end') {
        try {
          el.setSelectionRange(len, len);
        } catch {}
      } else if (this.caretPolicy === 'select') {
        try {
          el.setSelectionRange(0, len);
        } catch {}
      }
    } else {
      // Contenteditable
      try {
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(el);
          if (this.caretPolicy === 'end') {
            range.collapse(false); // caret at end
          }
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
    }
  }

  getCurrentField(): FieldDescriptor | null {
    this.syncCurrentIndex();
    return this.pageEngine.getFieldByIndex(this.currentFieldIndex);
  }

  getCurrentFieldIndex(): number {
    return this.syncCurrentIndex();
  }

  getTotalFieldsCount(): number {
    return this.pageEngine.getFields().length;
  }
}
