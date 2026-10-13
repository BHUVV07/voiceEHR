import { WIDGET_CONTAINER_ID } from '../../shared/constants';

export interface FieldDescriptor {
  index: number;
  id: string;
  label: string;
  normalizedLabel: string;
  accessibleName: string;
  type: string;
  role: string;
  element: HTMLElement;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  placeholder?: string;
  section?: string;
  orderIndex: number;
}

export class PageUnderstandingEngine {
  private fields: FieldDescriptor[] = [];
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private listeners: Set<(fields: FieldDescriptor[]) => void> = new Set();

  constructor() {
    this.scan();
    this.initObserver();
  }

  /**
   * Scans the document DOM and discovers all eligible, visible, editable input controls.
   */
  scan(): FieldDescriptor[] {
    if (typeof document === 'undefined') return [];

    const candidates = document.querySelectorAll<HTMLElement>(
      'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], [role="combobox"]'
    );

    const discovered: FieldDescriptor[] = [];
    let idx = 0;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];

      // 1. Filter out VoiceFlow AI's own UI elements
      if (el.closest(`#${WIDGET_CONTAINER_ID}`) || el.id === WIDGET_CONTAINER_ID) {
        continue;
      }

      // 2. Filter out non-text inputs (buttons, checkboxes, radios, hidden, etc.)
      if (el instanceof HTMLInputElement) {
        const type = el.type.toLowerCase();
        const nonTextTypes = [
          'button',
          'checkbox',
          'color',
          'file',
          'hidden',
          'image',
          'radio',
          'range',
          'reset',
          'submit',
        ];
        if (nonTextTypes.includes(type)) {
          continue;
        }
      }

      // 3. Filter out disabled or read-only controls
      const isDisabled = (el as any).disabled === true || el.getAttribute('aria-disabled') === 'true';
      const isReadOnly = (el as any).readOnly === true || el.getAttribute('aria-readonly') === 'true';
      if (isDisabled || isReadOnly) {
        continue;
      }

      // 4. Filter out non-visible elements
      if (!this.isElementVisible(el)) {
        continue;
      }

      // 5. Resolve human-readable label and accessible name
      const { label, accessibleName } = this.resolveFieldLabel(el, idx);

      const type = el instanceof HTMLInputElement ? el.type : el instanceof HTMLTextAreaElement ? 'textarea' : 'contenteditable';
      const role = el.getAttribute('role') || (type === 'textarea' || type === 'contenteditable' ? 'textbox' : 'input');
      const placeholder = (el as any).placeholder || el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || undefined;

      const section = this.resolveFieldSection(el);

      discovered.push({
        index: idx,
        orderIndex: idx,
        id: el.id || `field_${idx}`,
        label,
        normalizedLabel: this.normalizeLabel(label),
        accessibleName,
        type,
        role,
        element: el,
        visible: true,
        enabled: true,
        editable: true,
        placeholder,
        section,
      });

      idx++;
    }

    this.fields = discovered;
    this.notifyListeners();
    return this.fields;
  }

  /**
   * Resolves the most accurate label for a form control following accessibility guidelines:
   * 1. Explicit <label for="id">
   * 2. Enclosing <label>
   * 3. aria-label
   * 4. aria-labelledby
   * 5. Preceding nearby label/heading in form structure
   * 6. title attribute
   * 7. placeholder (secondary fallback only)
   * 8. name or id attribute
   */
  private resolveFieldLabel(el: HTMLElement, index: number): { label: string; accessibleName: string } {
    let accessibleName = '';
    let label = '';

    // 1. Explicit <label for="...">
    if (el.id) {
      const explicitLabel = document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel && explicitLabel.textContent?.trim()) {
        label = explicitLabel.textContent.trim();
      }
    }

    // 2. Enclosing <label>
    if (!label) {
      const parentLabel = el.closest('label');
      if (parentLabel) {
        // Clone and remove the input itself to get just the text label
        const clone = parentLabel.cloneNode(true) as HTMLElement;
        const inputs = clone.querySelectorAll('input, textarea, select');
        inputs.forEach((input) => input.remove());
        const text = clone.textContent?.trim();
        if (text) {
          label = text;
        }
      }
    }

    // 3. aria-label
    const ariaLabel = el.getAttribute('aria-label')?.trim();
    if (ariaLabel) {
      accessibleName = ariaLabel;
      if (!label) label = ariaLabel;
    }

    // 4. aria-labelledby
    const ariaLabelledby = el.getAttribute('aria-labelledby')?.trim();
    if (ariaLabelledby) {
      const ids = ariaLabelledby.split(/\s+/);
      const parts: string[] = [];
      for (const id of ids) {
        const ref = document.getElementById(id);
        if (ref?.textContent?.trim()) {
          parts.push(ref.textContent.trim());
        }
      }
      if (parts.length > 0) {
        const refText = parts.join(' ');
        accessibleName = refText;
        if (!label) label = refText;
      }
    }

    // 5. Preceding nearby visible label or field title
    if (!label) {
      // Look at previous sibling (common pattern: <span class="label">Patient Name</span> <input ...>)
      let prev = el.previousElementSibling;
      while (prev && !prev.textContent?.trim()) {
        prev = prev.previousElementSibling;
      }
      if (prev && prev.textContent?.trim() && prev.textContent.trim().length <= 60) {
        label = prev.textContent.trim();
      }

      // Or check parent container's previous sibling (common in grid/flex layouts)
      if (!label && el.parentElement) {
        let parentPrev = el.parentElement.previousElementSibling;
        if (parentPrev && parentPrev.textContent?.trim() && parentPrev.textContent.trim().length <= 60) {
          label = parentPrev.textContent.trim();
        }
      }
    }

    // 6. title attribute
    if (!label && el.title?.trim()) {
      label = el.title.trim();
    }

    // 7. Placeholder as secondary fallback
    const placeholder = (el as any).placeholder || el.getAttribute('placeholder') || el.getAttribute('data-placeholder');
    if (!label && placeholder?.trim()) {
      label = placeholder.trim();
    }

    // 8. Element name or id
    if (!label && (el.getAttribute('name') || el.id)) {
      const identifier = el.getAttribute('name') || el.id;
      // Convert camelCase or snake_case to Title Case (e.g. "patientName" -> "Patient Name")
      label = identifier
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]+/g, ' ')
        .trim();
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }

    // Default fallback
    if (!label) {
      label = `Field ${index + 1}`;
    }

    // Clean up label (remove trailing colons or asterisks, e.g. "Patient Name *:" -> "Patient Name")
    label = label.replace(/[:*]+$/, '').trim();

    return {
      label,
      accessibleName: accessibleName || label,
    };
  }

  /**
   * Resolves the enclosing form section, fieldset legend, or nearest preceding heading
   */
  private resolveFieldSection(el: HTMLElement): string | undefined {
    if (typeof document === 'undefined') return undefined;

    // 1. Enclosing <fieldset><legend>
    const fieldset = el.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend?.textContent?.trim()) {
        return legend.textContent.trim();
      }
    }

    // 2. Enclosing <section> or container with aria-label / aria-labelledby
    const container = el.closest('section, [role="region"], [role="group"]');
    if (container) {
      const ariaLabel = container.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();

      const ariaLabelledby = container.getAttribute('aria-labelledby');
      if (ariaLabelledby) {
        const ref = document.getElementById(ariaLabelledby);
        if (ref?.textContent?.trim()) return ref.textContent.trim();
      }
    }

    // 3. Nearest preceding heading (h1-h4, [role="heading"])
    const formOrBody = el.closest('form') || document.body;
    if (formOrBody) {
      const headings = formOrBody.querySelectorAll('h1, h2, h3, h4, [role="heading"]');
      for (let i = headings.length - 1; i >= 0; i--) {
        const h = headings[i];
        if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
          const txt = h.textContent?.trim();
          if (txt && txt.length <= 60) {
            return txt;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Verifies if a field's underlying DOM element is still connected and valid (stale-element detection)
   */
  isFieldValid(field: FieldDescriptor): boolean {
    return !!field.element && field.element.isConnected && document.contains(field.element);
  }

  /**
   * Returns a unique list of all discovered section names
   */
  getSections(): string[] {
    const set = new Set<string>();
    for (const f of this.fields) {
      if (f.section) {
        set.add(f.section);
      }
    }
    return Array.from(set);
  }

  /**
   * Checks if an element is currently visible in the DOM
   */
  private isElementVisible(el: HTMLElement): boolean {
    if (typeof window === 'undefined') return true;

    // Check ancestors to ensure no parent container is hidden via display: none or visibility: hidden
    let current: HTMLElement | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      current = current.parentElement;
    }

    // In non-JSDOM real browsers, check offsetParent and bounding rect
    if (typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent || '')) {
      if (el.offsetParent === null && el.style.position !== 'fixed') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return false;
      }
    }

    return el.isConnected;
  }

  private normalizeLabel(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ');
  }

  private initObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;

    this.observer = new MutationObserver((mutations) => {
      // Debounce re-scanning to prevent layout thrashing
      let relevant = false;
      for (const m of mutations) {
        if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          relevant = true;
          break;
        }
      }

      if (relevant) {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = window.setTimeout(() => {
          this.scan();
        }, 250);
      }
    });

    try {
      this.observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch {}
  }

  getFields(): FieldDescriptor[] {
    if (this.fields.length === 0) {
      this.scan();
    }
    return this.fields;
  }

  getFieldByIndex(index: number): FieldDescriptor | null {
    const fields = this.getFields();
    return fields[index] || null;
  }

  getFieldByElement(el: HTMLElement): FieldDescriptor | null {
    const fields = this.getFields();
    return fields.find((f) => f.element === el || f.element.contains(el)) || null;
  }

  onChange(listener: (fields: FieldDescriptor[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.fields);
      } catch (err) {
        console.warn('[VoiceFlow AI] Field listener error', err);
      }
    });
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.listeners.clear();
  }
}
