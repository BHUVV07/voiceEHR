# VoiceFlow AI — Universal Voice Dictation Chrome Extension

> **Inspired by Wispr Flow:** Universal voice typing directly into any webpage input, textarea, contenteditable rich editor, or hospital EHR system.

VoiceFlow AI is a high-performance Chrome Extension built with **Manifest V3**, **React 18**, **TypeScript**, **Tailwind CSS**, and the **Web Speech API**. It allows users to position their cursor in any text field across the web, activate dictation via keyboard shortcut (`Cmd+Shift+K` on macOS, `Ctrl+Shift+K` on Windows/Linux) or the floating widget, speak naturally in English, and have the transcribed text inserted directly at their caret.

---

## 🌟 Modular Compatibility Architecture

VoiceFlow AI features an extensible, priority-based `AdapterRegistry` with specialized `EditorAdapter` modules to guarantee reliable dictation across diverse web editing surfaces:

1. **`StandardInputAdapter` (HTML `<input>` & `<textarea>`):**
   - Native caret tracking (`selectionStart`, `selectionEnd`).
   - `setRangeText` with slice-and-splice fallback.
   - Bypasses React 16+ `_valueTracker` to ensure compatibility with controlled components (React, Vue, Angular, Svelte).
   - Auto-expands auto-growing textareas on multiline dictation.
   - Zero form-submit trigger on speech finalization.

2. **`GmailComposerAdapter` (Gmail Message Composition):**
   - Targets Gmail message bodies (`.Am.Al.editable`, `[aria-label*="Message Body"]`).
   - Preserves greetings, existing message history, quoted replies, and physician signatures.
   - Emits `beforeinput` with `inputType: 'insertText'` to synchronize Gmail's reactive draft auto-save.
   - Strict accidental-send guard: Never emits `Enter` or `Ctrl+Enter` key events.

3. **`WhatsAppWebAdapter` (WhatsApp Web Message Composer):**
   - Targets Lexical editor surfaces (`[data-tab="10"]`, `[data-lexical-editor="true"]`).
   - **Zero-Accidental-Send Guarantee:** In WhatsApp Web, pressing `Enter` immediately sends the message. VoiceFlow AI inserts newlines via `<br>` and `beforeinput` without dispatching bare `Enter` key events.
   - Preserves cursor position in chat drafts.

4. **`ChatGPTClaudeAdapter` (ChatGPT & Claude AI Prompts):**
   - Targets auto-resizing textareas (`#prompt-textarea`) and ProseMirror/Lexical contenteditable blocks.
   - Automatically recalibrates textarea `scrollHeight` so dictated prompts expand the input naturally.
   - Zero-submit guard: Dictating returns/newlines never fires prompt submission.

5. **`NotionAdapter` (Notion Block Page Editor):**
   - Targets Notion block surfaces (`.notion-page-content [data-content-editable-leaf="true"]`).
   - Uses `execCommand('insertText')` preference and single-block Range manipulation to avoid corrupting Notion's internal block UUID hierarchy.

6. **`CanvasVirtualDocsAdapter` (Google Docs & Microsoft Office Online):**
   - Detects canvas-rendered document bodies (`docs.google.com`, `.kix-appview`, Word/Excel Online).
   - **Honest, transparent architecture:** Canvas surfaces do not expose standard DOM text nodes for document bodies. Direct DOM insertion risks corrupting document operational-transformation state.
   - Automatically synchronizes dictated text to the clipboard and provides an instant UI toast: *"Google Docs uses canvas rendering. Text copied to clipboard — press ⌘V / Ctrl+V to paste."*

7. **`EHRClinicalAdapter` (Hospital EHR / EMR Portals):**
   - Detects clinical encounter fields, SOAP notes, and EHR portals (Epic, Cerner, AthenaHealth, MyChart).
   - Non-intrusive insertion with **strict zero-telemetry**: Never reads patient charts, never submits clinical records, never sends data externally.

8. **`GenericContentEditableAdapter` & `FallbackClipboardAdapter`:**
   - Standard DOM Selection & Range API with `<br>` support for generic rich text editors.
   - Universal clipboard fallback prevents silent text loss if an editor becomes detached or inaccessible.

---

## 📊 Cross-Website Compatibility Matrix

| Web Application / Editor | Support Level | Active Adapter | Tested Scenarios & Notes |
| :--- | :---: | :--- | :--- |
| **Standard HTML `<input>`** | 🟢 **Verified** | `StandardInputAdapter` | Caret beginning, middle, end, selection replacement, framework event dispatch. |
| **Standard HTML `<textarea>`** | 🟢 **Verified** | `StandardInputAdapter` | Multiline dictation, paragraph breaks, auto-resize, React `_valueTracker` sync. |
| **Gmail Message Composer** | 🟢 **Verified** | `GmailComposerAdapter` | Empty message, middle of sentence, preserves quotes/signatures, zero accidental email send. |
| **WhatsApp Web Composer** | 🟢 **Verified** | `WhatsAppWebAdapter` | Caret insertion, newlines without firing Enter, zero accidental message dispatch. |
| **ChatGPT (`#prompt-textarea`)** | 🟢 **Verified** | `ChatGPTClaudeAdapter` | Multiline prompt expansion, React state sync, zero prompt submission. |
| **Claude AI Composer** | 🟢 **Verified** | `ChatGPTClaudeAdapter` | Contenteditable prompt insertion, multiline formatting, zero submission. |
| **Notion Block Editor** | 🟢 **Verified** | `NotionAdapter` | Block structure preservation, execCommand fallback, cursor retention. |
| **Hospital EHR / EMR Text Fields** | 🟢 **Verified** | `EHRClinicalAdapter` | SOAP notes, encounter textareas, zero telemetry, non-intrusive insertion. |
| **Generic ContentEditable** | 🟢 **Verified** | `GenericContentEditableAdapter` | DOM Range API, `<br>` fragment insertion, beforeinput/input events. |
| **Google Docs** | 🟡 **Documented Fallback** | `CanvasVirtualDocsAdapter` | HTML5 Canvas body rendering. Auto-copies to clipboard with instant ⌘V paste guidance. |
| **Microsoft Word Online** | 🟡 **Documented Fallback** | `CanvasVirtualDocsAdapter` | Virtual canvas rendering. Auto-copies to clipboard with instant Ctrl+V paste guidance. |
| **Microsoft Excel Online** | 🟡 **Documented Fallback** | `CanvasVirtualDocsAdapter` | Formula inputs support direct insertion; canvas spreadsheet grid uses clipboard fallback. |

---

## 📂 Project Architecture

```
voiceEHR/
├── dist/                              # Production unpacked Chrome extension (ready to load)
│   ├── manifest.json                  # Manifest V3 configuration
│   ├── background.js                  # Background service worker (ESM)
│   ├── content.js                     # Standalone IIFE content script bundle
│   ├── popup.html                     # Extension action popup
│   ├── options.html                   # Extension settings page
│   ├── icons/                         # 16x16, 48x48, 128x128 icons
│   └── assets/                        # Compiled React, Lucide & Tailwind assets
├── src/
│   ├── popup/                         # Modern popup UI
│   │   ├── App.tsx                    # Popup with mic controls, live preview, target tag
│   │   ├── main.tsx                   # React root entry
│   │   └── styles.css                 # Tailwind CSS & keyframe animations
│   ├── background/
│   │   └── service-worker.ts          # MV3 Service worker (commands & tab coordination)
│   ├── content/                       # Webpage content script layer
│   │   ├── adapters/                  # Modular Compatibility Layer
│   │   │   ├── types.ts               # EditorAdapter, SelectionState, AdapterCapabilities
│   │   │   ├── AdapterRegistry.ts     # Priority-based adapter dispatcher
│   │   │   ├── StandardInputAdapter.ts# Standard HTML inputs & textareas
│   │   │   ├── GenericContentEditableAdapter.ts # Standard contenteditable
│   │   │   ├── GmailComposerAdapter.ts# Gmail message composer
│   │   │   ├── WhatsAppWebAdapter.ts  # WhatsApp Web composer (zero accidental send)
│   │   │   ├── ChatGPTClaudeAdapter.ts# ChatGPT & Claude AI composers
│   │   │   ├── NotionAdapter.ts       # Notion block page editor
│   │   │   ├── CanvasVirtualDocsAdapter.ts # Google Docs & Office Online canvas fallback
│   │   │   ├── EHRClinicalAdapter.ts  # Hospital EHR / EMR clinical fields
│   │   │   └── FallbackClipboardAdapter.ts # Safety clipboard catch-all
│   │   ├── content-script.ts          # Content script entry & message handling
│   │   ├── dictation-controller.ts    # Coordinates speech, caret tracking, and insertion
│   │   ├── focus-manager.ts           # Continuous caret & editable element tracker
│   │   ├── insertion-engine.ts        # Universal Text-Insertion Engine with deduplication
│   │   ├── floating-widget.tsx        # Draggable Shadow DOM recording interface
│   │   └── audio-feedback.ts          # Web Audio API start/stop chimes
│   ├── speech/                        # Speech engine abstraction layer
│   │   ├── speech-types.ts            # ISpeechEngine interface & data models
│   │   ├── SpeechEngine.ts            # Engine factory & exports
│   │   ├── WebSpeechEngine.ts         # Browser SpeechRecognition with auto-restart
│   │   └── text-formatter.ts          # Verbal punctuation & sentence capitalization
│   ├── shared/
│   │   ├── constants.ts               # Extension constants & dialects
│   │   ├── messages.ts                # Type-safe extension messaging protocol
│   │   └── settings.ts                # Chrome storage settings manager
│   ├── options/                       # Settings page
│   │   ├── Options.tsx                # Configuration UI
│   │   └── main.tsx                   # Options entry
│   └── tests/                         # Vitest test suite
│       ├── setup.ts                   # Chrome API and DOM polyfills
│       ├── adapters.test.ts           # Modular adapter detection and priority tests
│       ├── insertion-engine.test.ts   # Universal insertion engine tests
│       ├── focus-manager.test.ts      # Focus & selection restoration tests
│       └── speech-engine.test.ts      # Formatting & speech state tests
├── public/
│   ├── manifest.json                  # Manifest V3 source
│   └── icons/                         # Extension PNG icons
├── scripts/
│   ├── build.js                       # Multi-target Vite bundler
│   └── generate-icons.js              # PNG icon generator
├── test-bench.html                    # Interactive playground for verifying dictation
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js >= 18 (Tested on Node v26)
- Google Chrome, Brave, or Microsoft Edge

### 1. Build the Extension
```bash
# Install dependencies
npm install

# Run the complete production build (generates unpacked ./dist directory)
npm run build
```

### 2. Load the Unpacked Extension in Chrome
1. Open Google Chrome.
2. Navigate to: `chrome://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the **`dist`** directory inside `/Users/bhuvv07/voiceEHR/dist`.
6. VoiceFlow AI will appear in your extensions list.

### 3. Test on the Interactive Test Bench
1. Open [test-bench.html](file:///Users/bhuvv07/voiceEHR/test-bench.html) in Chrome:
   - Double-click `test-bench.html` or drag it into Chrome.
2. Click inside any simulated application area:
   - **Gmail Message Composition** (tests middle-of-sentence insertion, preserving greetings & signatures)
   - **WhatsApp Web Composer** (tests zero-accidental-send safeguard)
   - **ChatGPT & Claude Prompt** (tests auto-growing textarea and zero-submit safeguard)
   - **Notion Block Editor** (tests block structure preservation)
   - **Hospital EHR SOAP Note** (tests clinical note insertion with zero telemetry)
   - **Google Docs Canvas** (tests transparent clipboard fallback notification)
   - **Standard Form Fields** (tests caret positioning and selection replacement)
3. Press **`Command+Shift+K`** (macOS) or **`Ctrl+Shift+K`** (Windows) or click the floating microphone widget.
4. Speak in English (e.g., *"Patient has normal heart rate comma alert and responsive period"*).
5. The text will be typed directly at your cursor!

---

## 🧪 Automated Unit Tests

Run the Vitest test suite:

```bash
npm test
```

### Test Coverage Summary:
- **`adapters.test.ts` (12 tests)**:
  - Priority detection of Gmail, WhatsApp, ChatGPT, Google Docs Canvas, EHR, and standard inputs.
  - Gmail message body preservation (retaining signatures and greetings).
  - WhatsApp zero-accidental-send verification (verifying no Enter keydown events fire).
  - Canvas virtual surface clipboard fallback and user notice verification.
  - Rapid duplicate insertion deduplication within 250ms window.
  - Caret insertion at beginning of input, middle, and selection replacement mode.
- **`insertion-engine.test.ts` (5 tests)**:
  - `<input>` caret insertion and event dispatching.
  - `<textarea>` selection range replacement.
  - `contenteditable` multiline insertion.
  - Clipboard fallback when no input is focused.
  - Smart spacing rules (spacing after words, no spacing before punctuation).
- **`focus-manager.test.ts` (3 tests)**:
  - Active element detection and metadata extraction.
  - Caret position restoration on blurred inputs.
  - Immunity to floating widget clicks.
- **`speech-engine.test.ts` (7 tests)**:
  - Verbal punctuation command translation (`period` -> `.`, `comma` -> `,`, etc.).
  - Sentence capitalization and standalone `"I"` correction.
  - Clean state transitions in `WebSpeechEngine`.

---

## 🛡️ Privacy, EHR & Compliance Disclosure

1. **Client-Side Text Placement:** VoiceFlow AI places recognized text directly into the active webpage DOM at the user's cursor. There are no backend database servers, external analytics trackers, or transcription storage.
2. **Web Speech API Disclosure:** In the POC version, speech recognition is executed via the browser's native `webkitSpeechRecognition`. Google Chrome may send encrypted audio snippets to Google speech recognition services for acoustic modeling.
3. **Future Local Whisper Integration:** The architecture abstracts the speech engine via `ISpeechEngine`. A future update will add an optional WebGPU Whisper engine to allow 100% offline, on-device clinical transcription for HIPAA-strict EHR deployments.
4. **Clinical EHR Safety:** VoiceFlow AI never automatically saves, submits, or signs clinical charts. Speech insertion and record submission remain strictly separated user actions.
