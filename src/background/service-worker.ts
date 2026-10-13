import { COMMAND_TOGGLE_DICTATION } from '../shared/constants';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/settings';

// Initialize extension settings upon installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[VoiceFlow AI] Extension installed/updated:', details.reason);

  const existing = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  if (!existing[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
    console.log('[VoiceFlow AI] Default settings initialized');
  }
});

// Handle keyboard shortcut command (Cmd+Shift+K on Mac, Ctrl+Shift+K on Windows/Linux)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === COMMAND_TOGGLE_DICTATION) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab || !activeTab.id) return;

      // Ensure we don't attempt injection into restricted chrome:// or edge:// pages
      if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('edge://') || activeTab.url?.startsWith('chrome-extension://')) {
        console.warn('[VoiceFlow AI] Cannot run voice dictation on internal browser pages');
        return;
      }

      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_DICTATION' });
      } catch (err) {
        // Tab might have been opened prior to extension installation; dynamically inject content script
        console.log('[VoiceFlow AI] Content script not responding, injecting script dynamically...');
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ['content.js'],
        });

        // Retry sending message after brief delay
        setTimeout(() => {
          if (activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_DICTATION' });
          }
        }, 150);
      }
    } catch (err) {
      console.error('[VoiceFlow AI] Error handling shortcut command', err);
    }
  }
});
