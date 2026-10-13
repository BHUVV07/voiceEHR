import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageUnderstandingEngine } from '../content/page-understanding/PageUnderstandingEngine';
import { WIDGET_CONTAINER_ID } from '../shared/constants';

describe('PageUnderstandingEngine', () => {
  let container: HTMLDivElement;
  let engine: PageUnderstandingEngine;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-form-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (engine) {
      engine.destroy();
    }
    document.body.innerHTML = '';
  });

  it('discovers input elements with associated <label for="...">', () => {
    container.innerHTML = `
      <form>
        <label for="patient-name">Patient Name</label>
        <input id="patient-name" type="text" />
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Patient Name');
    expect(fields[0].normalizedLabel).toBe('patient name');
    expect(fields[0].type).toBe('text');
  });

  it('discovers input elements with enclosing <label> text', () => {
    container.innerHTML = `
      <form>
        <label>
          Patient Age
          <input id="patient-age" type="number" />
        </label>
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Patient Age');
    expect(fields[0].normalizedLabel).toBe('patient age');
  });

  it('discovers elements with aria-label and aria-labelledby', () => {
    container.innerHTML = `
      <form>
        <input id="phone" type="tel" aria-label="Phone Number" />
        <span id="lbl-addr">Residential Address</span>
        <input id="address" type="text" aria-labelledby="lbl-addr" />
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(2);
    expect(fields[0].label).toBe('Phone Number');
    expect(fields[1].label).toBe('Residential Address');
  });

  it('discovers textarea and contenteditable elements', () => {
    container.innerHTML = `
      <form>
        <label for="complaint">Chief Complaint</label>
        <textarea id="complaint"></textarea>
        <div id="notes" contenteditable="true" aria-label="Clinical SOAP Notes"></div>
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(2);
    expect(fields[0].type).toBe('textarea');
    expect(fields[0].label).toBe('Chief Complaint');
    expect(fields[1].type).toBe('contenteditable');
    expect(fields[1].label).toBe('Clinical SOAP Notes');
  });

  it('excludes non-text input types (checkbox, radio, submit, hidden)', () => {
    container.innerHTML = `
      <form>
        <label for="user">Username</label>
        <input id="user" type="text" />
        <input type="checkbox" name="agree" />
        <input type="radio" name="gender" />
        <input type="hidden" name="token" value="123" />
        <input type="submit" value="Submit Form" />
        <button type="button">Ordinary Button</button>
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('user');
  });

  it('excludes disabled and readonly fields', () => {
    container.innerHTML = `
      <form>
        <label for="f1">Active Field</label>
        <input id="f1" type="text" />
        <label for="f2">Disabled Field</label>
        <input id="f2" type="text" disabled />
        <label for="f3">Read-only Field</label>
        <input id="f3" type="text" readonly />
        <label for="f4">Aria Disabled Field</label>
        <input id="f4" type="text" aria-disabled="true" />
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('f1');
  });

  it('excludes fields hidden by display: none or visibility: hidden', () => {
    container.innerHTML = `
      <form>
        <label for="visible">Visible Field</label>
        <input id="visible" type="text" />
        <div style="display: none;">
          <label for="hidden1">Hidden Field 1</label>
          <input id="hidden1" type="text" />
        </div>
        <div style="visibility: hidden;">
          <label for="hidden2">Hidden Field 2</label>
          <input id="hidden2" type="text" />
        </div>
      </form>
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('visible');
  });

  it('excludes VoiceFlow AI extension floating widget elements', () => {
    container.innerHTML = `
      <div id="${WIDGET_CONTAINER_ID}">
        <input id="widget-search" type="text" aria-label="Widget Search" />
      </div>
      <label for="real-field">Hospital Record</label>
      <input id="real-field" type="text" />
    `;

    engine = new PageUnderstandingEngine();
    const fields = engine.scan();

    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe('real-field');
  });
});
