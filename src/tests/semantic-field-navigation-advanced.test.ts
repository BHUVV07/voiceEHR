import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageUnderstandingEngine } from '../content/page-understanding/PageUnderstandingEngine';
import { FocusManager } from '../content/focus-manager';
import { VoiceNavigationEngine } from '../content/navigation/VoiceNavigationEngine';

describe('Semantic Field Navigation Advanced', () => {
  let container: HTMLDivElement;
  let pageEngine: PageUnderstandingEngine;
  let focusManager: FocusManager;
  let navEngine: VoiceNavigationEngine;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'advanced-nav-root';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (pageEngine) pageEngine.destroy();
    document.body.innerHTML = '';
  });

  describe('Section Discovery & Navigation', () => {
    it('extracts section names from fieldsets and headings', () => {
      container.innerHTML = `
        <form>
          <fieldset>
            <legend>Patient Demographics</legend>
            <label for="p-name">Patient Name</label>
            <input id="p-name" type="text" />
            <label for="p-age">Age</label>
            <input id="p-age" type="number" />
          </fieldset>

          <fieldset>
            <legend>Clinical Assessment</legend>
            <label for="p-complaint">Chief Complaint</label>
            <textarea id="p-complaint"></textarea>
          </fieldset>
        </form>
      `;

      pageEngine = new PageUnderstandingEngine();
      focusManager = new FocusManager();
      navEngine = new VoiceNavigationEngine(pageEngine, focusManager);

      const fields = pageEngine.scan();
      expect(fields).toHaveLength(3);
      expect(fields[0].section).toBe('Patient Demographics');
      expect(fields[1].section).toBe('Patient Demographics');
      expect(fields[2].section).toBe('Clinical Assessment');

      const sections = pageEngine.getSections();
      expect(sections).toEqual(['Patient Demographics', 'Clinical Assessment']);
    });

    it('navigates between sections using navigateToSection', () => {
      container.innerHTML = `
        <form>
          <fieldset>
            <legend>Demographics</legend>
            <label for="f-name">Name</label>
            <input id="f-name" type="text" />
          </fieldset>
          <fieldset>
            <legend>Vitals</legend>
            <label for="f-bp">Blood Pressure</label>
            <input id="f-bp" type="text" />
          </fieldset>
          <fieldset>
            <legend>Diagnosis</legend>
            <label for="f-diag">Primary Diagnosis</label>
            <textarea id="f-diag"></textarea>
          </fieldset>
        </form>
      `;

      pageEngine = new PageUnderstandingEngine();
      focusManager = new FocusManager();
      navEngine = new VoiceNavigationEngine(pageEngine, focusManager);

      // Start at Demographics (f-name)
      navEngine.navigateToLabel('Name');
      expect(document.activeElement?.id).toBe('f-name');

      // Next section -> Vitals (f-bp)
      const resNext = navEngine.navigateToSection('NEXT');
      expect(resNext.success).toBe(true);
      expect(document.activeElement?.id).toBe('f-bp');

      // Next section -> Diagnosis (f-diag)
      const resNext2 = navEngine.navigateToSection('NEXT');
      expect(resNext2.success).toBe(true);
      expect(document.activeElement?.id).toBe('f-diag');

      // Jump directly to section by name
      const resDirect = navEngine.navigateToSection('Demographics');
      expect(resDirect.success).toBe(true);
      expect(document.activeElement?.id).toBe('f-name');
    });
  });

  describe('Search Inputs Inclusion', () => {
    it('correctly includes labeled search inputs in the form registry', () => {
      container.innerHTML = `
        <form>
          <label for="patient-search">Search Patient Database</label>
          <input id="patient-search" type="search" placeholder="Enter MRN..." />
          <div role="searchbox" aria-label="ICD-10 Diagnostic Search" contenteditable="true"></div>
        </form>
      `;

      pageEngine = new PageUnderstandingEngine();
      const fields = pageEngine.scan();

      expect(fields).toHaveLength(2);
      expect(fields[0].label).toBe('Search Patient Database');
      expect(fields[0].type).toBe('search');
      expect(fields[1].label).toBe('ICD-10 Diagnostic Search');
      expect(fields[1].role).toBe('searchbox');
    });
  });

  describe('Stale Element Detection & Dynamic DOM Recovery', () => {
    it('detects when an element was replaced in the DOM and recovers the fresh element', () => {
      container.innerHTML = `
        <form id="dynamic-form">
          <label for="vital-temp">Body Temperature</label>
          <input id="vital-temp" type="text" value="98.6" />
        </form>
      `;

      pageEngine = new PageUnderstandingEngine();
      focusManager = new FocusManager();
      navEngine = new VoiceNavigationEngine(pageEngine, focusManager);

      const fieldsBefore = pageEngine.scan();
      expect(fieldsBefore).toHaveLength(1);

      // Simulate a dynamic framework (React/Angular) unmounting and replacing the input DOM node
      const oldInput = document.getElementById('vital-temp')!;
      oldInput.remove();

      const freshInput = document.createElement('input');
      freshInput.id = 'vital-temp';
      freshInput.type = 'text';
      freshInput.value = '99.1';
      document.getElementById('dynamic-form')!.appendChild(freshInput);

      // Old field descriptor has detached element
      expect(pageEngine.isFieldValid(fieldsBefore[0])).toBe(false);

      // When navEngine tries to focus the field, it should auto-recover the fresh element!
      const res = navEngine.navigateToLabel('Body Temperature');
      expect(res.success).toBe(true);
      expect(document.activeElement).toBe(freshInput);
    });
  });
});
