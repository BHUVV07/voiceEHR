import React, { useState, useEffect } from 'react';
import {
  Mic,
  Square,
  Copy,
  Check,
  Settings,
  Moon,
  Sun,
  Keyboard,
  AlertCircle,
  ExternalLink,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, EXTENSION_NAME, EXTENSION_TAGLINE } from '../shared/constants';
import { DictationError, DictationState, FocusTargetInfo, ExtensionMessage } from '../shared/messages';
import { loadSettings, saveSettings, UserSettings } from '../shared/settings';

export const App: React.FC = () => {
  const [state, setState] = useState<DictationState>('IDLE');
  const [error, setError] = useState<DictationError | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTargetInfo | null>(null);
  const [interim, setInterim] = useState('');
  const [final, setFinal] = useState('');
  const [allFinal, setAllFinal] = useState('');
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isMac, setIsMac] = useState(true);

  // Initialize and query active tab
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);

    loadSettings().then((s) => {
      setSettings(s);
      if (s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        setDarkMode(true);
      }
    });

    // Query active tab state
    queryActiveTab();

    // Listen for broadcasts from content script
    const messageListener = (msg: ExtensionMessage) => {
      if (msg.type === 'STATE_UPDATE') {
        setState(msg.state);
        setError(msg.error || null);
        if (msg.focusTarget) setFocusTarget(msg.focusTarget);
      } else if (msg.type === 'TRANSCRIPT_UPDATE') {
        setInterim(msg.interim);
        setFinal(msg.final);
        setAllFinal(msg.allFinal);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  const queryActiveTab = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' }).catch(() => null);
      if (res?.data) {
        setState(res.data.state || 'IDLE');
        setError(res.data.error || null);
        if (res.data.focusTarget) setFocusTarget(res.data.focusTarget);
        if (res.data.transcripts) {
          setInterim(res.data.transcripts.interim || '');
          setFinal(res.data.transcripts.final || '');
          setAllFinal(res.data.transcripts.allFinal || '');
        }
      }
    } catch (err) {
      console.warn('Could not query active tab', err);
    }
  };

  const toggleDictation = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // Handle restricted pages
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) {
        setError({
          code: 'restricted-page',
          message: 'Voice typing is not permitted on internal browser settings pages.',
          actionable: 'Please open any regular webpage or web application to use VoiceFlow.',
        });
        return;
      }

      setError(null);

      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DICTATION' });
      } catch {
        // Tab was opened prior to extension installation/reload; dynamically inject content script
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            setTimeout(async () => {
              try {
                if (tab.id) {
                  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DICTATION' });
                  queryActiveTab();
                }
              } catch {}
            }, 300);
            return;
          } catch (injectErr) {
            console.warn('[VoiceFlow AI] Dynamic script injection failed', injectErr);
          }
        }

        setError({
          code: 'tab-not-ready',
          message: 'Could not connect to current webpage.',
          actionable: 'Please refresh this tab (Cmd+R or F5) once and try again.',
        });
      }
    } catch {
      setError({
        code: 'tab-not-ready',
        message: 'Could not connect to current webpage.',
        actionable: 'Please refresh the active webpage and try again.',
      });
    }
  };

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    if (!settings) return;
    const updated = await saveSettings({ language: newLang });
    setSettings(updated);

    // Notify tab
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_CHANGED', settings: updated });
        }
      }
    } catch {}
  };

  const toggleTheme = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    saveSettings({ theme: nextDark ? 'dark' : 'light' });
  };

  const openSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  const copyTranscript = () => {
    const text = allFinal || interim;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearTranscript = () => {
    setAllFinal('');
    setFinal('');
    setInterim('');
  };

  const isListening = state === 'LISTENING';
  const isStarting = state === 'STARTING';
  const isStopping = state === 'STOPPING';

  return (
    <div className={`${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'} min-h-[520px] p-5 flex flex-col justify-between transition-colors duration-200 select-none`}>
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white leading-none">
                {EXTENSION_NAME}
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {EXTENSION_TAGLINE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              title="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={openSettings}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* VoiceFlow 2.0 Mode Selector */}
        <div className="mt-3 flex items-center justify-between p-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 pl-1.5">
            Voice Mode:
          </span>
          <div className="flex gap-1">
            {(['DICTATION', 'NAVIGATION', 'COMMAND'] as const).map((m) => (
              <button
                key={m}
                onClick={async () => {
                  try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab?.id) {
                      await chrome.tabs.sendMessage(tab.id, { type: 'SET_MODE', mode: m });
                      queryActiveTab();
                    }
                  } catch {}
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase transition-colors ${
                  (focusTarget as any)?.mode === m || (!((focusTarget as any)?.mode) && m === 'DICTATION')
                    ? m === 'DICTATION'
                      ? 'bg-emerald-500 text-white'
                      : m === 'NAVIGATION'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-amber-500 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Target Field Status Indicator & Quick Navigation */}
        <div className="mt-2.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs shadow-sm">
          <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                focusTarget?.hasTarget ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {focusTarget?.label ? 'Field:' : 'Target:'}
          </span>
          <span className="font-medium truncate max-w-[140px] text-slate-700 dark:text-slate-300">
            {focusTarget?.hasTarget
              ? focusTarget.label || focusTarget.placeholder || `${focusTarget.tagName} Field`
              : 'No active cursor'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                  await chrome.tabs.sendMessage(tab.id, { type: 'NAVIGATE_PREV_FIELD' });
                  queryActiveTab();
                }
              }}
              className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[10px] font-bold"
              title="Previous field"
            >
              ◀
            </button>
            <button
              onClick={async () => {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                  await chrome.tabs.sendMessage(tab.id, { type: 'NAVIGATE_NEXT_FIELD' });
                  queryActiveTab();
                }
              }}
              className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[10px] font-bold"
              title="Next field"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Center Dictation Action */}
        <div className="my-6 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ring when listening */}
            {isListening && (
              <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-pulse-ring pointer-events-none" />
            )}

            <button
              onClick={toggleDictation}
              disabled={isStarting || isStopping}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30 scale-105'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30 hover:scale-105'
              } disabled:opacity-50`}
              title={isListening ? 'Stop dictation' : 'Start dictation'}
            >
              {isListening ? (
                <Square className="w-7 h-7 fill-current" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </button>
          </div>

          <div className="mt-3.5 text-center">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {isListening
                ? 'Listening... Speak naturally'
                : isStarting
                ? 'Connecting microphone...'
                : isStopping
                ? 'Finalizing transcription...'
                : 'Click to start dictation'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              or press <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">{isMac ? '⌘' : 'Ctrl'}+Shift+K</kbd>
            </p>
          </div>
        </div>

        {/* Language Selection */}
        <div className="flex items-center justify-between text-xs px-1 mb-3">
          <label htmlFor="language-select" className="text-slate-500 dark:text-slate-400 font-medium">
            Recognition Accent:
          </label>
          <select
            id="language-select"
            value={settings?.language || 'en-US'}
            onChange={handleLanguageChange}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Live / Recent Transcription Preview */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Live Transcript
            </span>
            <div className="flex items-center gap-1">
              {(allFinal || interim) && (
                <button
                  onClick={clearTranscript}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  title="Clear"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={copyTranscript}
                disabled={!allFinal && !interim}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-40 px-1 py-0.5 rounded transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="h-20 overflow-y-auto text-xs leading-relaxed text-slate-700 dark:text-slate-300 select-text">
            {allFinal && <span>{allFinal} </span>}
            {interim ? (
              <span className="text-slate-400 dark:text-slate-500 italic">{interim}</span>
            ) : !allFinal ? (
              <span className="text-slate-400 dark:text-slate-600 italic">
                Recognized text will be inserted directly into your webpage cursor.
              </span>
            ) : null}
          </div>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{error.message}</p>
              {error.actionable && <p className="text-[11px] mt-0.5 text-red-600 dark:text-red-400">{error.actionable}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 mt-4 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <Keyboard className="w-3.5 h-3.5" />
          <span>Shortcut:</span>
          <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">{isMac ? 'Cmd+Shift+K' : 'Ctrl+Shift+K'}</span>
        </div>

        <button
          onClick={openSettings}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Options <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
