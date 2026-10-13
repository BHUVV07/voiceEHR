import { FocusManager } from './focus-manager';
import { TextInsertionEngine } from './insertion-engine';
import { DictationController } from './dictation-controller';
import { mountFloatingWidget } from './floating-widget';
import { ExtensionMessage, MessageResponse } from '../shared/messages';
import { loadSettings } from '../shared/settings';

// Prevent duplicate initialization in the same frame/tab
if (!(window as any).__VOICEFLOW_INITIALIZED__) {
  (window as any).__VOICEFLOW_INITIALIZED__ = true;

  console.log('[VoiceFlow AI] Content script initializing...');

  const focusManager = new FocusManager();
  const insertionEngine = new TextInsertionEngine(focusManager);
  const controller = new DictationController(focusManager, insertionEngine);

  // Initialize UI based on user settings
  loadSettings().then((settings) => {
    if (settings.floatingWidgetVisible) {
      const tryMount = () => {
        if (document.body || document.documentElement) {
          mountFloatingWidget(controller);
        } else {
          setTimeout(tryMount, 100);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryMount);
      } else {
        tryMount();
      }
    }
  });

  // Handle Chrome extension runtime messages
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      handleMessage(message)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response
    });
  }

  async function handleMessage(message: ExtensionMessage): Promise<MessageResponse> {
    switch (message.type) {
      case 'TOGGLE_DICTATION':
        await controller.toggle();
        return { success: true, data: { state: controller.getState(), mode: controller.getMode() } };

      case 'START_DICTATION':
        await controller.start();
        return { success: true, data: { state: controller.getState(), mode: controller.getMode() } };

      case 'STOP_DICTATION':
        await controller.stop();
        return { success: true, data: { state: controller.getState(), mode: controller.getMode() } };

      case 'PAUSE_DICTATION':
        controller.pause();
        return { success: true, data: { state: controller.getState() } };

      case 'RESUME_DICTATION':
        controller.resume();
        return { success: true, data: { state: controller.getState() } };

      case 'SET_MODE':
        controller.setMode(message.mode);
        return { success: true, data: { mode: controller.getMode() } };

      case 'GET_STATE':
        return {
          success: true,
          data: {
            state: controller.getState(),
            mode: controller.getMode(),
            error: controller.getError(),
            lastCommand: controller.getLastCommand(),
            transcripts: controller.getTranscripts(),
            focusTarget: focusManager.getTargetInfo(),
            discoveredFields: controller.getDiscoveredFieldsSummary(),
          },
        };

      case 'INSERT_TEXT':
        const res = await insertionEngine.insert(message.text);
        return { success: res.success, data: res };

      case 'CLEAR_CURRENT_FIELD':
        const clearOk = await insertionEngine.clearField();
        return { success: clearOk };

      case 'UNDO_LAST_ACTION':
        const undoOk = await insertionEngine.undoLastAction();
        return { success: undoOk };

      case 'NAVIGATE_NEXT_FIELD':
        const nextRes = controller.getNavigationEngine().navigateNext();
        return { success: nextRes.success, data: nextRes };

      case 'NAVIGATE_PREV_FIELD':
        const prevRes = controller.getNavigationEngine().navigatePrevious();
        return { success: prevRes.success, data: prevRes };

      case 'NAVIGATE_TO_FIELD':
        const toRes = controller.getNavigationEngine().navigateToLabel(message.label);
        return { success: toRes.success, data: toRes };

      case 'SETTINGS_CHANGED':
        await controller.updateSettings(message.settings);
        return { success: true };

      case 'CHECK_FOCUS':
        return { success: true, data: focusManager.getTargetInfo() };

      default:
        return { success: false, error: 'Unknown message type' };
    }
  }

  // Fallback in-page shortcut listener (Cmd+Shift+K on Mac, Ctrl+Shift+K on Windows/Linux)
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        controller.toggle();
      }
    },
    true
  );
}
