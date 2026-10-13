import { ISpeechEngine, SpeechEngineFactory, SpeechEngineState, SpeechErrorEvent, SpeechTranscriptEvent } from '../speech/SpeechEngine';
import { FocusManager } from './focus-manager';
import { TextInsertionEngine, InsertionResult } from './insertion-engine';
import { AudioFeedback } from './audio-feedback';
import { UserSettings, loadSettings, VoiceMode } from '../shared/settings';
import { DictationError, DictationState, ExtensionMessage, LastCommandFeedback, FieldSummaryInfo } from '../shared/messages';
import { CommandInterpreter, ParsedCommandResult } from './commands/CommandInterpreter';
import { PageUnderstandingEngine } from './page-understanding/PageUnderstandingEngine';
import { VoiceNavigationEngine } from './navigation/VoiceNavigationEngine';

export class DictationController {
  private speechEngine: ISpeechEngine;
  private focusManager: FocusManager;
  private insertionEngine: TextInsertionEngine;
  private commandInterpreter: CommandInterpreter;
  private pageEngine: PageUnderstandingEngine;
  private navigationEngine: VoiceNavigationEngine;
  private settings: UserSettings | null = null;

  private currentMode: VoiceMode = 'DICTATION';
  private currentError: DictationError | null = null;
  private lastCommandFeedback: LastCommandFeedback | null = null;
  private isPaused = false;
  private pendingAction: 'CLEAR_ALL' | 'SUBMIT_FORM' | null = null;
  private pendingActionTimestamp = 0;
  private readonly PENDING_ACTION_TIMEOUT_MS = 20000;

  private interimTranscript = '';
  private currentFinalTranscript = '';
  private accumulatedTranscript = '';
  private sessionStartTime = 0;

  private onStateChangeListeners: Set<(state: DictationState, error: DictationError | null, mode: VoiceMode) => void> = new Set();
  private onTranscriptListeners: Set<(interim: string, final: string, allFinal: string) => void> = new Set();
  private onToastListeners: Set<(message: string, type: 'info' | 'success' | 'warning' | 'error') => void> = new Set();
  private onCommandFeedbackListeners: Set<(feedback: LastCommandFeedback) => void> = new Set();

  constructor(focusManager: FocusManager, insertionEngine: TextInsertionEngine) {
    this.focusManager = focusManager;
    this.insertionEngine = insertionEngine;
    this.speechEngine = SpeechEngineFactory.getInstance();
    this.commandInterpreter = new CommandInterpreter();
    this.pageEngine = new PageUnderstandingEngine();
    this.navigationEngine = new VoiceNavigationEngine(this.pageEngine, this.focusManager);

    this.bindEngineListeners();
    this.init();
  }

  private async init() {
    this.settings = await loadSettings();
    if (this.settings?.engineType) {
      this.speechEngine = SpeechEngineFactory.getInstance(this.settings.engineType);
      this.bindEngineListeners();
    }
    if (this.settings?.defaultMode) {
      this.currentMode = this.settings.defaultMode;
    }
    if (this.settings?.navigationCaretPolicy) {
      this.navigationEngine.setCaretPolicy(this.settings.navigationCaretPolicy);
    }
    if (this.settings?.fieldHighlightEnabled !== undefined) {
      this.navigationEngine.setHighlightEnabled(this.settings.fieldHighlightEnabled);
    }
  }

  private bindEngineListeners() {
    this.speechEngine.onStateChange((state: SpeechEngineState) => {
      if (state === 'LISTENING') {
        this.sessionStartTime = Date.now();
        if (this.settings?.soundEffects && !this.isPaused) {
          AudioFeedback.playStart();
        }
      } else if (state === 'IDLE' || state === 'STOPPING') {
        if (this.settings?.soundEffects && this.sessionStartTime > 0 && !this.isPaused) {
          AudioFeedback.playStop();
        }
      }
      this.broadcastState();
    });

    this.speechEngine.onTranscript(async (event: SpeechTranscriptEvent) => {
      if (this.isPaused) return;

      this.interimTranscript = event.interim;

      if (event.final) {
        this.currentFinalTranscript = event.final;
        await this.handleFinalTranscript(event.final);
      }

      this.broadcastTranscript();
    });

    this.speechEngine.onError((event: SpeechErrorEvent) => {
      this.currentError = {
        code: event.code,
        message: event.message,
        actionable: event.actionable,
      };
      this.showToast(event.message, 'error');
      AudioFeedback.playError();
      this.broadcastState();
    });
  }

  /**
   * Main Voice Processing Pipeline:
   * Classifies utterance into command vs dictation based on current mode and confidence.
   */
  private async handleFinalTranscript(rawTranscript: string) {
    const parsed: ParsedCommandResult = this.commandInterpreter.parse(rawTranscript, this.currentMode);

    // 1. Unambiguous Voice Command Identified
    if (parsed.isCommand) {
      await this.executeCommand(parsed);
      return;
    }

    // 2. Utterance in COMMAND mode that was not recognized
    if (this.currentMode === 'COMMAND') {
      AudioFeedback.playError();
      this.setLastCommand(rawTranscript, 'WARNING', `Unrecognized command. Say "Dictation mode" to type text.`);
      this.showToast(`Command not recognized: "${rawTranscript}"`, 'warning');
      return;
    }

    // 3. Utterance in NAVIGATION mode without explicit dictation prefix
    if (this.currentMode === 'NAVIGATION') {
      AudioFeedback.playError();
      this.setLastCommand(rawTranscript, 'INFO', `In Navigation mode. Say "Type [text]" or "Dictation mode" to type.`);
      this.showToast(`In Navigation mode. Say "Next field" or "Dictation mode".`, 'info');
      return;
    }

    // 4. DICTATION Mode: Ordinary speech insertion
    if (this.pendingAction) {
      this.pendingAction = null;
    }

    this.accumulatedTranscript += (this.accumulatedTranscript ? ' ' : '') + rawTranscript;

    if (this.settings?.retainTranscripts) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ voiceflow_last_transcript: this.accumulatedTranscript });
        }
      } catch {}
    }

    const insertRes: InsertionResult = await this.insertionEngine.insert(rawTranscript, {
      smartSpacing: true,
    });

    if (insertRes.fallbackNotice) {
      this.showToast(insertRes.fallbackNotice, insertRes.requiresPasteAction ? 'info' : 'warning');
    } else if (!insertRes.success) {
      if (insertRes.strategy === 'clipboard-fallback') {
        this.showToast('No active field found. Transcript copied to clipboard!', 'info');
      }
    }

    this.setLastCommand(`Dictated: "${rawTranscript}"`, 'SUCCESS', 'Text inserted into active field');
  }

  /**
   * Executes deterministic voice commands
   */
  async executeCommand(parsed: ParsedCommandResult) {
    // Clear pending destructive action if user executes an unrelated command
    if (
      this.pendingAction &&
      parsed.type !== 'CONFIRM_PENDING' &&
      parsed.type !== 'CANCEL_PENDING' &&
      parsed.type !== 'REQUEST_CLEAR_ALL' &&
      parsed.type !== 'REQUEST_SUBMIT_FORM'
    ) {
      this.pendingAction = null;
    }

    switch (parsed.type) {
      case 'STOP_VOICE':
        await this.stop();
        this.setLastCommand('Stop Voice Control', 'SUCCESS', 'Voice session ended');
        this.showToast('Voice control stopped', 'info');
        break;

      case 'PAUSE_VOICE':
        this.pause();
        this.setLastCommand('Pause Listening', 'SUCCESS', 'Voice listening paused');
        this.showToast('Listening paused. Say "Resume listening" to continue.', 'info');
        break;

      case 'RESUME_VOICE':
        this.resume();
        this.setLastCommand('Resume Listening', 'SUCCESS', 'Voice listening resumed');
        this.showToast('Listening resumed', 'success');
        break;

      case 'SET_MODE':
        if (parsed.modeChange) {
          this.setMode(parsed.modeChange);
        }
        break;

      case 'NAVIGATE_NEXT': {
        const res = this.navigationEngine.navigateNext();
        if (res.success) {
          this.setLastCommand('Next Field', 'SUCCESS', res.feedback);
          this.showToast(res.feedback, 'success');
        } else {
          this.setLastCommand('Next Field', 'WARNING', res.feedback);
          this.showToast(res.feedback, 'warning');
        }
        this.broadcastState();
        break;
      }

      case 'NAVIGATE_PREVIOUS': {
        const res = this.navigationEngine.navigatePrevious();
        if (res.success) {
          this.setLastCommand('Previous Field', 'SUCCESS', res.feedback);
          this.showToast(res.feedback, 'success');
        } else {
          this.setLastCommand('Previous Field', 'WARNING', res.feedback);
          this.showToast(res.feedback, 'warning');
        }
        this.broadcastState();
        break;
      }

      case 'NAVIGATE_TO_LABEL': {
        const res = this.navigationEngine.navigateToLabel(parsed.targetLabel!);
        if (res.success) {
          this.setLastCommand(`Go to "${parsed.targetLabel}"`, 'SUCCESS', res.feedback);
          this.showToast(res.feedback, 'success');
        } else {
          this.setLastCommand(`Go to "${parsed.targetLabel}"`, 'WARNING', res.feedback);
          this.showToast(res.feedback, 'warning');
        }
        this.broadcastState();
        break;
      }

      case 'NAVIGATE_TO_SECTION': {
        const res = this.navigationEngine.navigateToSection(parsed.targetLabel!);
        if (res.success) {
          this.setLastCommand(`Section Navigation`, 'SUCCESS', res.feedback);
          this.showToast(res.feedback, 'success');
        } else {
          this.setLastCommand(`Section Navigation`, 'WARNING', res.feedback);
          this.showToast(res.feedback, 'warning');
        }
        this.broadcastState();
        break;
      }

      case 'REQUEST_CLEAR_ALL': {
        this.pendingAction = 'CLEAR_ALL';
        this.pendingActionTimestamp = Date.now();
        AudioFeedback.playError();
        this.setLastCommand('Clear All Fields', 'WARNING', 'Confirmation required. Say "Confirm" or "Cancel".');
        this.showToast('Clearing all fields requires confirmation. Say "Confirm" to proceed or "Cancel" to abort.', 'warning');
        break;
      }

      case 'REQUEST_SUBMIT_FORM': {
        this.pendingAction = 'SUBMIT_FORM';
        this.pendingActionTimestamp = Date.now();
        AudioFeedback.playError();
        this.setLastCommand('Submit Form', 'WARNING', 'Confirmation required. Say "Confirm" or "Cancel".');
        this.showToast('Form submission requires confirmation. Say "Confirm" to proceed or "Cancel" to abort.', 'warning');
        break;
      }

      case 'CONFIRM_PENDING': {
        const isStale = Date.now() - this.pendingActionTimestamp > this.PENDING_ACTION_TIMEOUT_MS;
        if (isStale && this.pendingAction) {
          this.pendingAction = null;
          AudioFeedback.playError();
          this.setLastCommand('Confirmation Expired', 'WARNING', 'Pending action timed out');
          this.showToast('Confirmation timed out. Please repeat the command if still intended.', 'warning');
          break;
        }

        if (this.pendingAction === 'CLEAR_ALL') {
          const fields = this.pageEngine.getFields();
          for (const f of fields) {
            try {
              if (f.element instanceof HTMLInputElement || f.element instanceof HTMLTextAreaElement) {
                f.element.value = '';
                f.element.dispatchEvent(new Event('input', { bubbles: true }));
                f.element.dispatchEvent(new Event('change', { bubbles: true }));
              } else if (f.element.isContentEditable) {
                f.element.textContent = '';
                f.element.dispatchEvent(new Event('input', { bubbles: true }));
              }
            } catch {}
          }
          this.pendingAction = null;
          AudioFeedback.playSuccess();
          this.setLastCommand('Clear All Fields', 'SUCCESS', 'All form fields cleared');
          this.showToast('All form fields cleared', 'success');
        } else if (this.pendingAction === 'SUBMIT_FORM') {
          // Safeguard: protect against automated remote submission without manual inspection
          this.pendingAction = null;
          AudioFeedback.playSuccess();
          this.setLastCommand('Form Ready to Submit', 'SUCCESS', 'Review entries and click submit');
          this.showToast('Submission confirmed. Please review form entries before sending.', 'info');
        } else {
          this.showToast('No action awaiting confirmation.', 'info');
        }
        break;
      }

      case 'CANCEL_PENDING': {
        if (this.pendingAction) {
          const actionName = this.pendingAction === 'CLEAR_ALL' ? 'Clear All' : 'Submit Form';
          this.pendingAction = null;
          AudioFeedback.playSuccess();
          this.setLastCommand(`Cancelled ${actionName}`, 'INFO', 'Action aborted safely');
          this.showToast(`Cancelled ${actionName} safely.`, 'info');
        } else {
          this.showToast('No action to cancel.', 'info');
        }
        break;
      }

      case 'CLEAR_FIELD': {
        const ok = await this.insertionEngine.clearField();
        if (ok) {
          AudioFeedback.playSuccess();
          this.setLastCommand('Clear Field', 'SUCCESS', 'Field cleared');
          this.showToast('Cleared field contents', 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Clear Field', 'WARNING', 'No active field to clear');
          this.showToast('No active field to clear', 'warning');
        }
        break;
      }

      case 'REPLACE_FIELD': {
        const text = parsed.textPayload || '';
        const ok = await this.insertionEngine.replaceField(text);
        if (ok) {
          AudioFeedback.playSuccess();
          this.setLastCommand(`Replace Field`, 'SUCCESS', `Replaced with "${text}"`);
          this.showToast(`Replaced field with "${text}"`, 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Replace Field', 'ERROR', 'Failed to replace field');
          this.showToast('Failed to replace field', 'error');
        }
        break;
      }

      case 'REPLACE_LAST_SENTENCE': {
        const text = parsed.textPayload || '';
        const ok = await this.insertionEngine.replaceLastSentence(text);
        if (ok) {
          AudioFeedback.playSuccess();
          this.setLastCommand(`Replace Last Sentence`, 'SUCCESS', `Replaced with "${text}"`);
          this.showToast(`Replaced last sentence`, 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Replace Last Sentence', 'ERROR', 'Failed to replace last sentence');
          this.showToast('Failed to replace last sentence', 'error');
        }
        break;
      }

      case 'UNDO_INSERTION': {
        const ok = await this.insertionEngine.undoLastAction();
        if (ok) {
          AudioFeedback.playSuccess();
          this.setLastCommand('Undo', 'SUCCESS', 'Reverted last change');
          this.showToast('Undid last change', 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Undo', 'WARNING', 'Nothing to undo');
          this.showToast('Nothing to undo', 'warning');
        }
        break;
      }

      case 'REPEAT_INSERTION': {
        const res = await this.insertionEngine.repeatLastInsertion();
        if (res.success) {
          AudioFeedback.playSuccess();
          this.setLastCommand('Repeat Insertion', 'SUCCESS', `Repeated "${res.insertedText}"`);
          this.showToast(`Repeated: "${res.insertedText}"`, 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Repeat Insertion', 'WARNING', res.error || 'Nothing to repeat');
          this.showToast('Nothing to repeat', 'warning');
        }
        break;
      }

      case 'COPY_FIELD': {
        const copiedText = await this.insertionEngine.copyCurrentField();
        if (copiedText !== null) {
          AudioFeedback.playSuccess();
          this.setLastCommand('Copy Field', 'SUCCESS', 'Copied to clipboard');
          this.showToast('Field contents copied to clipboard!', 'success');
        } else {
          AudioFeedback.playError();
          this.setLastCommand('Copy Field', 'WARNING', 'No field content to copy');
          this.showToast('No field content to copy', 'warning');
        }
        break;
      }

      case 'FORMAT_NEW_LINE':
        await this.insertionEngine.format('NEW_LINE');
        AudioFeedback.playSuccess();
        this.setLastCommand('New Line', 'SUCCESS', 'Inserted line break');
        break;

      case 'FORMAT_NEW_PARAGRAPH':
        await this.insertionEngine.format('NEW_PARAGRAPH');
        AudioFeedback.playSuccess();
        this.setLastCommand('New Paragraph', 'SUCCESS', 'Inserted new paragraph');
        break;

      case 'FORMAT_COMMA':
        await this.insertionEngine.format('COMMA');
        AudioFeedback.playSuccess();
        this.setLastCommand('Insert Comma', 'SUCCESS', 'Inserted comma');
        break;

      case 'FORMAT_PERIOD':
        await this.insertionEngine.format('PERIOD');
        AudioFeedback.playSuccess();
        this.setLastCommand('Insert Full Stop', 'SUCCESS', 'Inserted period');
        break;

      case 'SELECT_ALL':
        await this.insertionEngine.format('SELECT_ALL');
        AudioFeedback.playSuccess();
        this.setLastCommand('Select All', 'SUCCESS', 'Selected all text');
        break;

      case 'EXPLICIT_DICTATION':
        if (parsed.textPayload) {
          await this.insertionEngine.insert(parsed.textPayload, { smartSpacing: true });
          this.setLastCommand(`Dictated: "${parsed.textPayload}"`, 'SUCCESS', 'Text entered');
        }
        break;

      default:
        break;
    }
  }

  setMode(mode: VoiceMode) {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      AudioFeedback.playModeSwitch();
      this.setLastCommand(`Switch Mode: ${mode}`, 'SUCCESS', `VoiceFlow is now in ${mode} mode`);
      this.showToast(`Switched to ${mode} mode`, 'success');
      this.broadcastState();
    }
  }

  getMode(): VoiceMode {
    return this.currentMode;
  }

  pause() {
    this.isPaused = true;
    AudioFeedback.playStop();
    this.broadcastState();
  }

  resume() {
    this.isPaused = false;
    AudioFeedback.playStart();
    this.broadcastState();
  }

  togglePause() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  private setLastCommand(command: string, status: LastCommandFeedback['status'], message: string) {
    this.lastCommandFeedback = {
      command,
      status,
      message,
      timestamp: Date.now(),
    };
    this.onCommandFeedbackListeners.forEach((cb) => cb(this.lastCommandFeedback!));
    this.broadcastState();
  }

  async updateSettings(newSettings: UserSettings) {
    this.settings = newSettings;
    if (newSettings.navigationCaretPolicy) {
      this.navigationEngine.setCaretPolicy(newSettings.navigationCaretPolicy);
    }
    if (newSettings.fieldHighlightEnabled !== undefined) {
      this.navigationEngine.setHighlightEnabled(newSettings.fieldHighlightEnabled);
    }
  }

  getState(): DictationState {
    if (this.isPaused) {
      return 'PAUSED';
    }
    const s = this.speechEngine.getState();
    return s as DictationState;
  }

  getError(): DictationError | null {
    return this.currentError;
  }

  getLastCommand(): LastCommandFeedback | null {
    return this.lastCommandFeedback;
  }

  getPageEngine(): PageUnderstandingEngine {
    return this.pageEngine;
  }

  getNavigationEngine(): VoiceNavigationEngine {
    return this.navigationEngine;
  }

  getTranscripts() {
    return {
      interim: this.interimTranscript,
      final: this.currentFinalTranscript,
      allFinal: this.accumulatedTranscript,
    };
  }

  getDiscoveredFieldsSummary(): FieldSummaryInfo[] {
    return this.pageEngine.getFields().map((f) => ({
      index: f.index,
      id: f.id,
      label: f.label,
      type: f.type,
      role: f.role,
    }));
  }

  async start(): Promise<void> {
    if (!this.settings) {
      this.settings = await loadSettings();
    }

    this.currentError = null;
    this.isPaused = false;
    this.interimTranscript = '';
    this.currentFinalTranscript = '';

    // Snapshot target element & scan fields before speech starts
    this.pageEngine.scan();
    this.focusManager.getActiveTarget();

    try {
      await this.speechEngine.start({
        lang: this.settings.language,
        autoPunctuation: this.settings.autoPunctuation,
        autoCapitalize: this.settings.autoCapitalize,
      });
    } catch (err: any) {
      this.currentError = {
        code: 'start-failed',
        message: err.message || 'Failed to start microphone speech recognition',
        actionable: 'Please check microphone permissions in Chrome.',
      };
      this.broadcastState();
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.interimTranscript = '';
    this.isPaused = false;
    await this.speechEngine.stop();
    this.broadcastState();
    this.broadcastTranscript();
  }

  async toggle(): Promise<void> {
    const state = this.getState();
    if (state === 'LISTENING' || state === 'STARTING' || state === 'PAUSED') {
      await this.stop();
    } else {
      await this.start();
    }
  }

  clearTranscript() {
    this.accumulatedTranscript = '';
    this.interimTranscript = '';
    this.currentFinalTranscript = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.remove('voiceflow_last_transcript');
      }
    } catch {}
    this.broadcastTranscript();
  }

  onStateChange(cb: (state: DictationState, error: DictationError | null, mode: VoiceMode) => void) {
    this.onStateChangeListeners.add(cb);
    return () => this.onStateChangeListeners.delete(cb);
  }

  onTranscript(cb: (interim: string, final: string, allFinal: string) => void) {
    this.onTranscriptListeners.add(cb);
    return () => this.onTranscriptListeners.delete(cb);
  }

  onToast(cb: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void) {
    this.onToastListeners.add(cb);
    return () => this.onToastListeners.delete(cb);
  }

  onCommandFeedback(cb: (feedback: LastCommandFeedback) => void) {
    this.onCommandFeedbackListeners.add(cb);
    return () => this.onCommandFeedbackListeners.delete(cb);
  }

  private showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    this.onToastListeners.forEach((cb) => cb(message, type));
  }

  private broadcastState() {
    const state = this.getState();
    const error = this.currentError;
    const mode = this.currentMode;

    this.onStateChangeListeners.forEach((cb) => {
      try {
        cb(state, error, mode);
      } catch (e) {
        console.error(e);
      }
    });

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const msg: ExtensionMessage = {
          type: 'STATE_UPDATE',
          state,
          mode,
          error,
          language: this.settings?.language,
          focusTarget: this.focusManager.getTargetInfo(),
          lastCommand: this.lastCommandFeedback,
          discoveredFields: this.getDiscoveredFieldsSummary(),
        };
        chrome.runtime.sendMessage(msg).catch(() => {});
      }
    } catch {}
  }

  private broadcastTranscript() {
    this.onTranscriptListeners.forEach((cb) => {
      try {
        cb(this.interimTranscript, this.currentFinalTranscript, this.accumulatedTranscript);
      } catch (e) {
        console.error(e);
      }
    });

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const msg: ExtensionMessage = {
          type: 'TRANSCRIPT_UPDATE',
          interim: this.interimTranscript,
          final: this.currentFinalTranscript,
          allFinal: this.accumulatedTranscript,
        };
        chrome.runtime.sendMessage(msg).catch(() => {});
      }
    } catch {}
  }
}
