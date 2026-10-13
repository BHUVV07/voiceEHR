import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FocusManager } from '../content/focus-manager';
import { TextInsertionEngine } from '../content/insertion-engine';
import { DictationController } from '../content/dictation-controller';
import { SpeechEngineFactory } from '../speech/SpeechEngine';

class MockSpeechEngineForWorkflow {
  private stateChangeCb: any = null;
  private transcriptCb: any = null;
  private errorCb: any = null;
  private state = 'IDLE';

  readonly id = 'web-speech';
  readonly name = 'Mock Speech Engine';

  isSupported() {
    return true;
  }
  getState() {
    return this.state;
  }
  async start() {
    this.state = 'LISTENING';
    this.stateChangeCb?.('LISTENING');
  }
  async stop() {
    this.state = 'IDLE';
    this.stateChangeCb?.('IDLE');
  }
  abort() {
    this.state = 'IDLE';
    this.stateChangeCb?.('IDLE');
  }
  onStateChange(cb: any) {
    this.stateChangeCb = cb;
    return () => {};
  }
  onTranscript(cb: any) {
    this.transcriptCb = cb;
    return () => {};
  }
  onError(cb: any) {
    this.errorCb = cb;
    return () => {};
  }

  emitFinal(text: string) {
    if (this.transcriptCb) {
      this.transcriptCb({
        interim: '',
        final: text,
        rawFinal: text,
        timestamp: Date.now(),
      });
    }
  }
}

describe('Workbench End-to-End Voice Workflow Verification', () => {
  let container: HTMLDivElement;
  let focusManager: FocusManager;
  let insertionEngine: TextInsertionEngine;
  let controller: DictationController;
  let mockEngine: MockSpeechEngineForWorkflow;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'ehr-workbench-root';
    document.body.appendChild(container);

    container.innerHTML = `
      <form id="ehr-form">
        <fieldset>
          <legend>Patient Demographics</legend>
          <label for="patient-name">Patient Name *</label>
          <input id="patient-name" type="text" />

          <label for="patient-age">Age *</label>
          <input id="patient-age" type="number" />

          <label for="patient-phone">Phone Number</label>
          <input id="patient-phone" type="tel" />
        </fieldset>

        <fieldset>
          <legend>Clinical Assessment</legend>
          <label for="chief-complaint">Chief Complaint</label>
          <textarea id="chief-complaint"></textarea>

          <label for="soap-notes">Clinical SOAP Notes</label>
          <div id="soap-notes" contenteditable="true" role="textbox"></div>
        </fieldset>
      </form>
    `;

    mockEngine = new MockSpeechEngineForWorkflow();
    SpeechEngineFactory.setCustomEngine(mockEngine as any);

    focusManager = new FocusManager();
    insertionEngine = new TextInsertionEngine(focusManager);
    controller = new DictationController(focusManager, insertionEngine);
  });

  afterEach(() => {
    SpeechEngineFactory.setCustomEngine(null as any);
    document.body.innerHTML = '';
  });

  it('completes the required 13-step voice workflow without mouse or keyboard', async () => {
    // 1. Start voice control
    await controller.start();
    expect(controller.getState()).toBe('LISTENING');

    // 2. "Go to patient name."
    mockEngine.emitFinal('go to patient name');
    expect(document.activeElement?.id).toBe('patient-name');

    // 3. "Rahul Sharma."
    mockEngine.emitFinal('Rahul Sharma');
    const nameInput = document.getElementById('patient-name') as HTMLInputElement;
    expect(nameInput.value).toBe('Rahul Sharma');

    // 4. "Next field."
    mockEngine.emitFinal('next field');
    expect(document.activeElement?.id).toBe('patient-age');

    // 5. "Forty-five."
    mockEngine.emitFinal('Forty-five');
    const ageInput = document.getElementById('patient-age') as HTMLInputElement;
    expect(ageInput.value).toBe('45');

    // 6. "Next field."
    mockEngine.emitFinal('next field');
    expect(document.activeElement?.id).toBe('patient-phone');

    // 7. "Nine eight seven six five four three two one zero."
    mockEngine.emitFinal('Nine eight seven six five four three two one zero');
    const phoneInput = document.getElementById('patient-phone') as HTMLInputElement;
    expect(phoneInput.value).toBe('Nine eight seven six five four three two one zero');

    // 8. "Go to chief complaint."
    mockEngine.emitFinal('go to chief complaint');
    expect(document.activeElement?.id).toBe('chief-complaint');

    // 9. "Patient reports fever for three days."
    mockEngine.emitFinal('Patient reports fever for three days');
    const complaintEl = document.getElementById('chief-complaint') as HTMLTextAreaElement;
    expect(complaintEl.value).toBe('Patient reports fever for three days');

    // 10. "New paragraph."
    mockEngine.emitFinal('new paragraph');
    expect(complaintEl.value).toBe('Patient reports fever for three days\n\n');

    // 11. "No known drug allergies."
    mockEngine.emitFinal('No known drug allergies');
    expect(complaintEl.value).toBe('Patient reports fever for three days\n\nNo known drug allergies');

    // 12. "Undo."
    mockEngine.emitFinal('undo');
    // Undoes the second insertion ("No known drug allergies")
    expect(complaintEl.value).toBe('Patient reports fever for three days\n\n');

    // 13. "Stop voice control."
    mockEngine.emitFinal('stop voice control');
    expect(controller.getState()).toBe('IDLE');
  });

  it('executes repeated workflow runs idempotently without state corruption or duplicate insertions', async () => {
    for (let run = 1; run <= 3; run++) {
      await controller.start();

      mockEngine.emitFinal('go to patient name');
      mockEngine.emitFinal('clear this field');
      mockEngine.emitFinal(`Patient Run ${run}`);

      const nameInput = document.getElementById('patient-name') as HTMLInputElement;
      expect(nameInput.value).toBe(`Patient Run ${run}`);

      mockEngine.emitFinal('next field');
      mockEngine.emitFinal('clear this field');
      mockEngine.emitFinal(`${run}0`);

      const ageInput = document.getElementById('patient-age') as HTMLInputElement;
      expect(ageInput.value).toBe(`${run}0`);

      mockEngine.emitFinal('stop voice control');
      expect(controller.getState()).toBe('IDLE');
    }
  });
});
