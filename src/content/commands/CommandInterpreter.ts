import { VoiceMode } from '../../shared/settings';

export type CommandType =
  | 'START_VOICE'
  | 'STOP_VOICE'
  | 'PAUSE_VOICE'
  | 'RESUME_VOICE'
  | 'SET_MODE'
  | 'NAVIGATE_NEXT'
  | 'NAVIGATE_PREVIOUS'
  | 'NAVIGATE_TO_LABEL'
  | 'NAVIGATE_TO_SECTION'
  | 'FORMAT_NEW_LINE'
  | 'FORMAT_NEW_PARAGRAPH'
  | 'FORMAT_COMMA'
  | 'FORMAT_PERIOD'
  | 'SELECT_ALL'
  | 'CLEAR_FIELD'
  | 'REPLACE_FIELD'
  | 'REPLACE_LAST_SENTENCE'
  | 'UNDO_INSERTION'
  | 'REPEAT_INSERTION'
  | 'COPY_FIELD'
  | 'EXPLICIT_DICTATION'
  | 'REQUEST_CLEAR_ALL'
  | 'REQUEST_SUBMIT_FORM'
  | 'CONFIRM_PENDING'
  | 'CANCEL_PENDING'
  | 'NOT_A_COMMAND';

export interface ParsedCommandResult {
  isCommand: boolean;
  type: CommandType;
  rawTranscript: string;
  normalizedText: string;
  modeChange?: VoiceMode;
  targetLabel?: string;
  textPayload?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation?: string;
}

export class CommandInterpreter {
  /**
   * Normalizes an utterance by lowercasing, trimming, collapsing whitespace,
   * and stripping non-critical trailing/leading punctuation.
   */
  static normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Evaluates an utterance against registered voice commands taking into account
   * the current interaction mode.
   */
  parse(rawUtterance: string, currentMode: VoiceMode = 'DICTATION'): ParsedCommandResult {
    const raw = rawUtterance.trim();
    const clean = CommandInterpreter.normalize(raw);

    if (!clean) {
      return {
        isCommand: false,
        type: 'NOT_A_COMMAND',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'LOW',
      };
    }

    // 1. Session Control Commands (Always high priority across all modes)
    if (this.matchesAny(clean, ['stop voice control', 'stop voice', 'stop listening', 'turn off voice control'])) {
      return {
        isCommand: true,
        type: 'STOP_VOICE',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Stopped voice control session',
      };
    }

    if (this.matchesAny(clean, ['start voice control', 'start voice', 'start listening', 'activate voice control'])) {
      return {
        isCommand: true,
        type: 'START_VOICE',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Started voice control session',
      };
    }

    if (this.matchesAny(clean, ['pause listening', 'pause voice control', 'pause voice', 'pause'])) {
      return {
        isCommand: true,
        type: 'PAUSE_VOICE',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Paused listening session',
      };
    }

    if (this.matchesAny(clean, ['resume listening', 'resume voice control', 'resume voice', 'resume', 'unpause'])) {
      return {
        isCommand: true,
        type: 'RESUME_VOICE',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Resumed listening session',
      };
    }

    // 2. Mode Switching Commands
    if (this.matchesAny(clean, ['dictation mode', 'switch to dictation mode', 'enter dictation mode'])) {
      return {
        isCommand: true,
        type: 'SET_MODE',
        modeChange: 'DICTATION',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Switched to Dictation mode',
      };
    }

    if (this.matchesAny(clean, ['navigation mode', 'switch to navigation mode', 'enter navigation mode'])) {
      return {
        isCommand: true,
        type: 'SET_MODE',
        modeChange: 'NAVIGATION',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Switched to Navigation mode',
      };
    }

    if (this.matchesAny(clean, ['command mode', 'switch to command mode', 'enter command mode'])) {
      return {
        isCommand: true,
        type: 'SET_MODE',
        modeChange: 'COMMAND',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Switched to Command mode',
      };
    }

    // 3. Explicit Dictation Prefixes ("type [text]", "dictate [text]", "write [text]")
    // Allows user to explicitly dictate text even if the text matches a command keyword
    // (e.g. "type next field" will type the words "next field" instead of triggering navigation!)
    const dictatePrefixMatch = clean.match(/^(?:type|dictate|enter|write|input)\s+(.+)$/);
    if (dictatePrefixMatch && dictatePrefixMatch[1]) {
      // Extract original casing/payload from raw utterance
      const rawPayload = raw.replace(/^(?:type|dictate|enter|write|input)\s+/i, '');
      return {
        isCommand: true,
        type: 'EXPLICIT_DICTATION',
        textPayload: rawPayload,
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: `Explicit dictation: "${rawPayload}"`,
      };
    }

    // 4. Confirmation Responses for Destructive Actions
    if (this.matchesAny(clean, ['confirm', 'yes confirm', 'proceed', 'yes proceed', 'confirm action'])) {
      return {
        isCommand: true,
        type: 'CONFIRM_PENDING',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Confirmed pending action',
      };
    }

    if (this.matchesAny(clean, ['cancel', 'abort', 'no cancel', 'do not proceed', 'cancel action'])) {
      return {
        isCommand: true,
        type: 'CANCEL_PENDING',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Cancelled pending action',
      };
    }

    // 5. Destructive / High-Consequence Action Requests (Require Confirmation)
    if (this.matchesAny(clean, ['clear all fields', 'clear all', 'reset form', 'empty all fields'])) {
      return {
        isCommand: true,
        type: 'REQUEST_CLEAR_ALL',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Requested to clear all fields (requires confirmation)',
      };
    }

    if (this.matchesAny(clean, ['submit form', 'send message', 'finalize record', 'save and submit'])) {
      return {
        isCommand: true,
        type: 'REQUEST_SUBMIT_FORM',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Requested form submission (requires confirmation)',
      };
    }

    // 6. Section Navigation: "go to section [name]" / "next section" / "previous section"
    if (this.matchesAny(clean, ['next section', 'go to next section', 'move to next section'])) {
      return {
        isCommand: true,
        type: 'NAVIGATE_TO_SECTION',
        targetLabel: 'NEXT',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Navigating to next form section',
      };
    }

    if (this.matchesAny(clean, ['previous section', 'go to previous section', 'move to previous section'])) {
      return {
        isCommand: true,
        type: 'NAVIGATE_TO_SECTION',
        targetLabel: 'PREV',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Navigating to previous form section',
      };
    }

    const sectionMatch = clean.match(/^(?:go to section|focus section|select section)\s+(?:the\s+)?(.+)$/);
    if (sectionMatch && sectionMatch[1]) {
      const targetSec = sectionMatch[1].trim();
      return {
        isCommand: true,
        type: 'NAVIGATE_TO_SECTION',
        targetLabel: targetSec,
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: `Navigating to form section: "${targetSec}"`,
      };
    }

    // 4. Sequential Field Navigation Commands
    if (
      this.matchesAny(clean, [
        'next field',
        'go to next field',
        'go to the next field',
        'move to next field',
        'next input',
        'next',
      ])
    ) {
      return {
        isCommand: true,
        type: 'NAVIGATE_NEXT',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Moved to next eligible field',
      };
    }

    if (
      this.matchesAny(clean, [
        'previous field',
        'go to previous field',
        'go to the previous field',
        'go back one field',
        'go back a field',
        'previous input',
        'previous',
      ])
    ) {
      return {
        isCommand: true,
        type: 'NAVIGATE_PREVIOUS',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Moved to previous eligible field',
      };
    }

    // 5. Targeted Label Navigation: "go to [label]", "focus [label]", "select [label]"
    const gotoMatch = clean.match(/^(?:go to|goto|focus on|focus|select)\s+(?:the\s+)?(.+)$/);
    if (gotoMatch && gotoMatch[1]) {
      const target = gotoMatch[1].trim();
      // Ensure target isn't just "next field", "previous field", or selection commands ("all", "this field", "everything")
      const reservedNavTargets = [
        'next field',
        'previous field',
        'next',
        'previous',
        'all',
        'this field',
        'everything',
      ];
      if (!reservedNavTargets.includes(target)) {
        return {
          isCommand: true,
          type: 'NAVIGATE_TO_LABEL',
          targetLabel: target,
          rawTranscript: raw,
          normalizedText: clean,
          confidence: 'HIGH',
          explanation: `Navigating to field labeled: "${target}"`,
        };
      }
    }

    // 6. Text Formatting Commands
    if (this.matchesAny(clean, ['new line', 'newline', 'line break'])) {
      return {
        isCommand: true,
        type: 'FORMAT_NEW_LINE',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Inserted new line',
      };
    }

    if (this.matchesAny(clean, ['new paragraph', 'paragraph'])) {
      return {
        isCommand: true,
        type: 'FORMAT_NEW_PARAGRAPH',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Inserted new paragraph',
      };
    }

    if (this.matchesAny(clean, ['insert comma', 'comma'])) {
      return {
        isCommand: true,
        type: 'FORMAT_COMMA',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Inserted comma',
      };
    }

    if (this.matchesAny(clean, ['insert full stop', 'full stop', 'insert period', 'period'])) {
      return {
        isCommand: true,
        type: 'FORMAT_PERIOD',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Inserted full stop',
      };
    }

    if (this.matchesAny(clean, ['select all', 'select this field', 'select everything'])) {
      return {
        isCommand: true,
        type: 'SELECT_ALL',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Selected all text',
      };
    }

    // 7. Text Editing & Correction Commands
    if (
      this.matchesAny(clean, [
        'clear this field',
        'clear field',
        'empty this field',
        'empty field',
        'erase this field',
        'erase field',
      ])
    ) {
      return {
        isCommand: true,
        type: 'CLEAR_FIELD',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Cleared field contents',
      };
    }

    // "replace this field with [text]" / "replace field with [text]"
    const replaceFieldMatch = clean.match(/^(?:replace this field with|replace field with|replace with)\s+(.+)$/);
    if (replaceFieldMatch && replaceFieldMatch[1]) {
      const rawPayload = raw.replace(/^(?:replace this field with|replace field with|replace with)\s+/i, '');
      return {
        isCommand: true,
        type: 'REPLACE_FIELD',
        textPayload: rawPayload,
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: `Replaced field with: "${rawPayload}"`,
      };
    }

    // "replace the last sentence with [text]" / "replace last sentence with [text]"
    const replaceSentenceMatch = clean.match(/^(?:replace the last sentence with|replace last sentence with)\s+(.+)$/);
    if (replaceSentenceMatch && replaceSentenceMatch[1]) {
      const rawPayload = raw.replace(/^(?:replace the last sentence with|replace last sentence with)\s+/i, '');
      return {
        isCommand: true,
        type: 'REPLACE_LAST_SENTENCE',
        textPayload: rawPayload,
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: `Replaced last sentence with: "${rawPayload}"`,
      };
    }

    if (this.matchesAny(clean, ['undo last insertion', 'undo last change', 'undo insertion', 'undo'])) {
      return {
        isCommand: true,
        type: 'UNDO_INSERTION',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Undid last insertion',
      };
    }

    if (this.matchesAny(clean, ['repeat last insertion', 'repeat last text', 'repeat insertion', 'repeat'])) {
      return {
        isCommand: true,
        type: 'REPEAT_INSERTION',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Repeated last insertion',
      };
    }

    if (this.matchesAny(clean, ['copy this field', 'copy field text', 'copy field', 'copy text'])) {
      return {
        isCommand: true,
        type: 'COPY_FIELD',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'HIGH',
        explanation: 'Copied field contents',
      };
    }

    // 8. Distinguish Isolated Commands from Embedded Dictation:
    // If we're in Command Mode and it reached here, it's not a recognized command.
    if (currentMode === 'COMMAND') {
      return {
        isCommand: false,
        type: 'NOT_A_COMMAND',
        rawTranscript: raw,
        normalizedText: clean,
        confidence: 'LOW',
        explanation: `Unrecognized command in Command Mode: "${raw}"`,
      };
    }

    // Otherwise, in Dictation Mode, treat as pure dictated text!
    return {
      isCommand: false,
      type: 'NOT_A_COMMAND',
      rawTranscript: raw,
      normalizedText: clean,
      confidence: 'HIGH',
    };
  }

  private matchesAny(input: string, targets: string[]): boolean {
    const trimmed = input.trim();
    return targets.some((t) => trimmed === t || trimmed === `${t} please` || trimmed === `please ${t}`);
  }
}
