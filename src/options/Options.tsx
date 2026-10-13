import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Save,
  Check,
  Shield,
  Keyboard,
  Globe,
  Sliders,
  Eye,
  Volume2,
  Trash2,
  Mic,
  Smartphone,
  Laptop,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, EXTENSION_NAME } from '../shared/constants';
import { loadSettings, saveSettings, UserSettings, DEFAULT_SETTINGS } from '../shared/settings';

export const Options: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const mics = devices.filter((d) => d.kind === 'audioinput');
          setAudioDevices(mics);
        })
        .catch(() => {});
    }
  }, []);

  const handleChange = (field: keyof UserSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const openShortcutsConfig = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    }
  };

  const openMicSettings = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {EXTENSION_NAME} Settings
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure your voice typing preferences and speech engine
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSave()}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        {/* Section 1: Speech & Language */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Globe className="w-4 h-4 text-emerald-500" />
            <span>Speech Recognition & Dialect</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="options-engine-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Speech Recognition Backend Engine
              </label>
              <select
                id="options-engine-select"
                value={settings.engineType || 'web-speech'}
                onChange={(e) => handleChange('engineType', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="web-speech">Chrome Web Speech API (Default, Fast, Browser-Managed)</option>
                <option value="local-whisper">Local Whisper WebGPU (On-Device, Zero-Cloud, HIPAA Sandbox)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                <strong>Privacy Policy:</strong> Chrome Web Speech API transmits audio to browser speech servers. Local Whisper processes speech 100% on-device and will never silently fall back to cloud servers.
              </p>
            </div>

            <div>
              <label htmlFor="options-lang-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Default English Accent
              </label>
              <select
                id="options-lang-select"
                value={settings.language}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label} ({lang.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Optimizes recognition accuracy for your primary regional English pronunciation.
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Spoken Punctuation Commands
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Say "period", "comma", "new line", or "question mark" to insert formatting.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoPunctuation}
                  onChange={(e) => handleChange('autoPunctuation', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Auto-Capitalize Sentences
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Automatically capitalizes the first letter of sentences and the pronoun "I".
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoCapitalize}
                  onChange={(e) => handleChange('autoCapitalize', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section: Microphone & Input Device Selection */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Mic className="w-4 h-4 text-emerald-500" />
              <span>Microphone & Audio Input Device</span>
            </div>
            <button
              type="button"
              onClick={openMicSettings}
              className="px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors"
            >
              Configure in Chrome
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Web Speech API uses the default microphone configured in your browser and macOS system sound settings.
            </p>

            {/* Apple Continuity Microphone Notice */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Connecting to your iPhone instead of Mac?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                macOS automatically routes microphone audio to your iPhone via <strong>Apple Continuity Camera</strong> when nearby. To use your Mac's built-in microphone instead:
              </p>
              <ul className="text-[11px] list-disc list-inside space-y-1.5 text-amber-800 dark:text-amber-300 pt-0.5">
                <li>
                  <strong>In Chrome:</strong> Click <button type="button" onClick={openMicSettings} className="underline font-semibold hover:text-amber-900">Chrome Mic Settings</button> and select <em>MacBook Built-in Microphone</em> instead of <em>Default</em>.
                </li>
                <li>
                  <strong>In macOS:</strong> Open <em>System Settings &gt; Sound &gt; Input</em> and select your <em>MacBook Microphone</em>.
                </li>
                <li>
                  <strong>On iPhone:</strong> Go to <em>Settings &gt; General &gt; AirPlay &amp; Continuity</em> and toggle off <em>Continuity Camera</em>.
                </li>
              </ul>
            </div>

            {audioDevices.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Detected Input Microphones ({audioDevices.length})
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs">
                  {audioDevices.map((dev, idx) => {
                    const isIphone = dev.label.toLowerCase().includes('iphone');
                    return (
                      <div key={dev.deviceId || idx} className="p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isIphone ? (
                            <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {dev.label || `Microphone ${idx + 1}`}
                          </span>
                        </div>
                        {isIphone && (
                          <span className="text-[10px] bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                            Continuity Device
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: VoiceFlow 2.0 Voice Control & Navigation */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Sliders className="w-4 h-4 text-emerald-500" />
            <span>Voice Control & Form Navigation (VoiceFlow 2.0)</span>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="options-default-mode" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Default Voice Mode
              </label>
              <select
                id="options-default-mode"
                value={settings.defaultMode}
                onChange={(e) => handleChange('defaultMode', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="DICTATION">Dictation Mode (Natural text entry with smart commands)</option>
                <option value="NAVIGATION">Navigation Mode (Hands-free field jumping & form filling)</option>
                <option value="COMMAND">Command Mode (Strict command execution without text entry)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                You can dynamically switch modes at any time by saying "Dictation mode", "Navigation mode", or "Command mode".
              </p>
            </div>

            <div>
              <label htmlFor="options-caret-policy" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Navigation Caret Position Policy
              </label>
              <select
                id="options-caret-policy"
                value={settings.navigationCaretPolicy}
                onChange={(e) => handleChange('navigationCaretPolicy', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="end">Move caret to end of existing text (Safe append)</option>
                <option value="select">Select all existing text (Quick replacement)</option>
                <option value="preserve">Preserve existing cursor location</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Controls where your cursor is positioned when saying "Next field" or "Go to [field]".
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Recognize Commands in Dictation Mode
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Allows unambiguous commands (e.g., "next field", "new line", "clear this field") to execute while dictating. Embedded phrases remain text.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableCommandsInDictation}
                  onChange={(e) => handleChange('enableCommandsInDictation', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Highlight Active Target Field
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Displays an emerald highlight ring around whichever input element is actively focused by voice navigation.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.fieldHighlightEnabled}
                  onChange={(e) => handleChange('fieldHighlightEnabled', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: Floating Widget & Interface */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Eye className="w-4 h-4 text-emerald-500" />
            <span>Interface & Floating Controls</span>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Enable On-Screen Floating Widget
                </span>
                <p className="text-[11px] text-slate-500">
                  Displays the non-intrusive floating pill directly on web pages with drag & drop support.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.floatingWidgetVisible}
                onChange={(e) => handleChange('floatingWidgetVisible', e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Start / Stop Audio Chimes
                </span>
                <p className="text-[11px] text-slate-500">
                  Plays a subtle acoustic tone when voice dictation starts and stops.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.soundEffects}
                onChange={(e) => handleChange('soundEffects', e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            <div>
              <label htmlFor="options-theme-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Theme Appearance
              </label>
              <select
                id="options-theme-select"
                value={settings.theme}
                onChange={(e) => handleChange('theme', e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="system">Follow System</option>
                <option value="light">Light Theme</option>
                <option value="dark">Dark Theme</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Keyboard Shortcuts */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Keyboard className="w-4 h-4 text-emerald-500" />
              <span>Keyboard Shortcuts</span>
            </div>
            <button
              type="button"
              onClick={openShortcutsConfig}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Configure in Chrome ↗
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">Toggle Dictation</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Activates voice typing anywhere cursor is positioned
              </p>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <kbd className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-sm">
                Command / Ctrl
              </kbd>
              <span>+</span>
              <kbd className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-sm">
                Shift
              </kbd>
              <span>+</span>
              <kbd className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-sm">
                K
              </kbd>
            </div>
          </div>
        </div>

        {/* Section 4: Privacy & Medical / EHR Disclosure */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span>Privacy & Transcript Storage</span>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Retain Recent Transcripts in Local Storage (Opt-In)
                </span>
                <p className="text-[11px] text-slate-500">
                  Off by default. When disabled, dictated text exists solely in active browser RAM during dictation and is never written to disk or storage.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.retainTranscripts}
                onChange={(e) => handleChange('retainTranscripts', e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Wipe all locally stored transcripts now:
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                    await chrome.storage.local.remove('voiceflow_last_transcript');
                  }
                  alert('All local transcripts have been wiped.');
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Local Transcripts
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed pt-2 border-t border-slate-100 dark:border-slate-800">
            <p>
              <strong>100% Client-Side Insertion:</strong> VoiceFlow AI operates zero external databases, telemetry servers, or tracking pipelines. Dictated words are inserted directly into your local webpage DOM.
            </p>
            <p>
              <strong>Speech Recognition Environment:</strong> Uses the browser's built-in Web Speech API (`webkitSpeechRecognition`). In Google Chrome, audio recognition may be processed by Google's cloud speech services.
            </p>
            <p className="text-[11px] text-slate-500">
              * Clinical Note: For hospital EHR environments subject to strict HIPAA policies, on-device local Whisper WebGPU will be supported in future releases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
