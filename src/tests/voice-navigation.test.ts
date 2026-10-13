import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageUnderstandingEngine } from '../content/page-understanding/PageUnderstandingEngine';
import { FocusManager } from '../content/focus-manager';
import { VoiceNavigationEngine } from '../content/navigation/VoiceNavigationEngine';

describe('VoiceNavigationEngine', () => {
  let container: HTMLDivElement;
  let pageEngine: PageUnderstandingEngine;
  let focusManager: FocusManager;
  let navEngine: VoiceNavigationEngine;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'ehr-form-container';
    document.body.appendChild(container);

    container.innerHTML = `
      <form>
        <label for="f-name">Patient Name</label>
        <input id="f-name" type="text" value="John Doe" />

        <label for="f-age">Age</label>
        <input id="f-age" type="number" value="45" />

        <label for="f-home-phone">Home Phone</label>
        <input id="f-home-phone" type="tel" />

        <label for="f-work-phone">Work Phone</label>
        <input id="f-work-phone" type="tel" />

        <label for="f-complaint">Chief Complaint</label>
        <textarea id="f-complaint"></textarea>
      </form>
    `;

    focusManager = new FocusManager();
    pageEngine = new PageUnderstandingEngine();
    navEngine = new VoiceNavigationEngine(pageEngine, focusManager);
  });

  afterEach(() => {
    pageEngine.destroy();
    document.body.innerHTML = '';
  });

  describe('Sequential Navigation (Next / Previous)', () => {
    it('navigates sequentially to the next field', () => {
      // 1st step: next field -> Patient Name (index 0)
      const res1 = navEngine.navigateNext();
      expect(res1.success).toBe(true);
      expect(res1.field?.label).toBe('Patient Name');
      expect(document.activeElement?.id).toBe('f-name');

      // 2nd step: next field -> Age (index 1)
      const res2 = navEngine.navigateNext();
      expect(res2.success).toBe(true);
      expect(res2.field?.label).toBe('Age');
      expect(document.activeElement?.id).toBe('f-age');
    });

    it('wraps around to the first field after reaching the last field', () => {
      // Navigate to Chief Complaint (last field, index 4)
      navEngine.navigateToLabel('Chief Complaint');
      expect(document.activeElement?.id).toBe('f-complaint');

      // Next field should wrap back to Patient Name (index 0)
      const res = navEngine.navigateNext();
      expect(res.success).toBe(true);
      expect(res.field?.label).toBe('Patient Name');
      expect(document.activeElement?.id).toBe('f-name');
    });

    it('navigates backward to the previous field and wraps from top to bottom', () => {
      // Start at Patient Name (index 0)
      navEngine.navigateToLabel('Patient Name');

      // Previous field should wrap to Chief Complaint (index 4)
      const resWrap = navEngine.navigatePrevious();
      expect(resWrap.success).toBe(true);
      expect(resWrap.field?.label).toBe('Chief Complaint');
      expect(document.activeElement?.id).toBe('f-complaint');

      // Previous field should move to Work Phone (index 3)
      const resPrev = navEngine.navigatePrevious();
      expect(resPrev.success).toBe(true);
      expect(resPrev.field?.label).toBe('Work Phone');
      expect(document.activeElement?.id).toBe('f-work-phone');
    });
  });

  describe('Targeted Label Navigation', () => {
    it('navigates directly to an exact label match', () => {
      const res = navEngine.navigateToLabel('Chief Complaint');
      expect(res.success).toBe(true);
      expect(res.field?.id).toBe('f-complaint');
      expect(document.activeElement?.id).toBe('f-complaint');
    });

    it('navigates using case-insensitive label query', () => {
      const res = navEngine.navigateToLabel('patient name');
      expect(res.success).toBe(true);
      expect(res.field?.id).toBe('f-name');
      expect(document.activeElement?.id).toBe('f-name');
    });

    it('navigates using partial label match when unique', () => {
      const res = navEngine.navigateToLabel('Complaint');
      expect(res.success).toBe(true);
      expect(res.field?.id).toBe('f-complaint');
    });

    it('safely prevents guessing and returns ambiguity error when multiple fields match', () => {
      // "Phone" matches both "Home Phone" and "Work Phone"
      const res = navEngine.navigateToLabel('Phone');
      expect(res.success).toBe(false);
      expect(res.isAmbiguous).toBe(true);
      expect(res.ambiguousMatches).toEqual(['Home Phone', 'Work Phone']);
      expect(res.feedback).toContain('Multiple fields match');
    });

    it('returns error when no matching field is found', () => {
      const res = navEngine.navigateToLabel('Nonexistent Insurance ID');
      expect(res.success).toBe(false);
      expect(res.feedback).toContain('not found');
    });
  });

  describe('Caret Placement Policies', () => {
    it('places caret at the end of text with "end" policy', () => {
      navEngine.setCaretPolicy('end');
      navEngine.navigateToLabel('Patient Name');
      const input = document.getElementById('f-name') as HTMLInputElement;
      expect(input.selectionStart).toBe(input.value.length);
      expect(input.selectionEnd).toBe(input.value.length);
    });

    it('selects all text with "select" policy', () => {
      navEngine.setCaretPolicy('select');
      navEngine.navigateToLabel('Patient Name');
      const input = document.getElementById('f-name') as HTMLInputElement;
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    });
  });

  describe('Visual Field Highlighting', () => {
    it('applies the voiceflow-active-nav-target highlight class to the focused field', () => {
      navEngine.setHighlightEnabled(true);
      navEngine.navigateToLabel('Age');

      const ageInput = document.getElementById('f-age') as HTMLInputElement;
      expect(ageInput.classList.contains('voiceflow-active-nav-target')).toBe(true);

      // Navigating away should remove it from previous and add to next
      navEngine.navigateToLabel('Chief Complaint');
      expect(ageInput.classList.contains('voiceflow-active-nav-target')).toBe(false);

      const complaintEl = document.getElementById('f-complaint') as HTMLElement;
      expect(complaintEl.classList.contains('voiceflow-active-nav-target')).toBe(true);
    });
  });
});
