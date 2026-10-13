import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdapterRegistry } from '../content/adapters/AdapterRegistry';
import { GmailComposerAdapter } from '../content/adapters/GmailComposerAdapter';
import { WhatsAppWebAdapter } from '../content/adapters/WhatsAppWebAdapter';
import { ChatGPTClaudeAdapter } from '../content/adapters/ChatGPTClaudeAdapter';
import { CanvasVirtualDocsAdapter } from '../content/adapters/CanvasVirtualDocsAdapter';
import { EHRClinicalAdapter } from '../content/adapters/EHRClinicalAdapter';
import { StandardInputAdapter } from '../content/adapters/StandardInputAdapter';
import { TextInsertionEngine } from '../content/insertion-engine';
import { FocusManager } from '../content/focus-manager';

describe('Modular Adapter System & Cross-Website Compatibility', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    document.body.innerHTML = '';
    registry = AdapterRegistry.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Adapter Detection & Priority', () => {
    it('detects Gmail composition editor with high priority', () => {
      const gmailDiv = document.createElement('div');
      gmailDiv.className = 'Am Al editable';
      gmailDiv.setAttribute('role', 'textbox');
      gmailDiv.setAttribute('aria-label', 'Message Body');
      document.body.appendChild(gmailDiv);

      // Simulate mail.google.com window location
      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'mail.google.com',
        pathname: '/mail/u/0/#inbox',
      } as any);

      const adapter = registry.getAdapter(gmailDiv);
      expect(adapter).toBeInstanceOf(GmailComposerAdapter);
      expect(adapter.id).toBe('gmail-composer');
    });

    it('detects WhatsApp Web composer with high priority', () => {
      const waDiv = document.createElement('div');
      waDiv.setAttribute('contenteditable', 'true');
      waDiv.setAttribute('data-tab', '10');
      waDiv.setAttribute('data-lexical-editor', 'true');
      document.body.appendChild(waDiv);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'web.whatsapp.com',
        pathname: '/',
      } as any);

      const adapter = registry.getAdapter(waDiv);
      expect(adapter).toBeInstanceOf(WhatsAppWebAdapter);
      expect(adapter.id).toBe('whatsapp-web');
    });

    it('detects nested child elements (<p>, <span>) inside WhatsApp Web composer', () => {
      const footer = document.createElement('footer');
      const waDiv = document.createElement('div');
      waDiv.setAttribute('contenteditable', 'true');
      waDiv.setAttribute('data-tab', '10');
      waDiv.setAttribute('data-lexical-editor', 'true');
      const p = document.createElement('p');
      p.className = 'selectable-text copyable-text';
      const span = document.createElement('span');
      span.textContent = 'existing text';
      p.appendChild(span);
      waDiv.appendChild(p);
      footer.appendChild(waDiv);
      document.body.appendChild(footer);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'web.whatsapp.com',
        pathname: '/',
      } as any);

      // Testing detection on child span
      const adapterForSpan = registry.getAdapter(span);
      expect(adapterForSpan).toBeInstanceOf(WhatsAppWebAdapter);

      // Testing detection on child p
      const adapterForP = registry.getAdapter(p);
      expect(adapterForP).toBeInstanceOf(WhatsAppWebAdapter);
    });

    it('detects ChatGPT prompt textarea with high priority', () => {
      const chatgptTextarea = document.createElement('textarea');
      chatgptTextarea.id = 'prompt-textarea';
      document.body.appendChild(chatgptTextarea);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'chatgpt.com',
        pathname: '/',
      } as any);

      const adapter = registry.getAdapter(chatgptTextarea);
      expect(adapter).toBeInstanceOf(ChatGPTClaudeAdapter);
      expect(adapter.id).toBe('chatgpt-claude');
    });

    it('detects Google Docs canvas surface and routes to CanvasVirtualDocsAdapter', () => {
      const canvas = document.createElement('canvas');
      canvas.id = 'kix-canvas';
      const container = document.createElement('div');
      container.className = 'kix-appview';
      container.appendChild(canvas);
      document.body.appendChild(container);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'docs.google.com',
        pathname: '/document/d/123/edit',
      } as any);

      const adapter = registry.getAdapter(canvas);
      expect(adapter).toBeInstanceOf(CanvasVirtualDocsAdapter);
      expect(adapter.id).toBe('canvas-virtual-docs');
    });

    it('detects EHR clinical notes with EHRClinicalAdapter', () => {
      const ehrTextarea = document.createElement('textarea');
      ehrTextarea.setAttribute('data-clinical', 'true');
      ehrTextarea.id = 'encounter-soap-note';
      document.body.appendChild(ehrTextarea);

      const adapter = registry.getAdapter(ehrTextarea);
      expect(adapter).toBeInstanceOf(EHRClinicalAdapter);
      expect(adapter.id).toBe('ehr-clinical');
    });

    it('detects standard input and textarea with StandardInputAdapter', () => {
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'example.com',
        pathname: '/',
      } as any);

      const adapter = registry.getAdapter(input);
      expect(adapter).toBeInstanceOf(StandardInputAdapter);
      expect(adapter.id).toBe('standard-input');
    });
  });

  describe('Gmail Composition Behavior', () => {
    it('preserves existing text and signatures when inserting in the middle of a message', async () => {
      const gmailDiv = document.createElement('div');
      gmailDiv.className = 'Am Al editable';
      gmailDiv.setAttribute('role', 'textbox');
      gmailDiv.setAttribute('contenteditable', 'true');
      gmailDiv.tabIndex = 0;
      gmailDiv.innerHTML = '<p>Dear Patient,</p><p>Please take your medication. Let me know if fever persists.</p><p>Best regards,<br>Dr. Smith</p>';
      document.body.appendChild(gmailDiv);

      const adapter = new GmailComposerAdapter();

      // Position selection in paragraph 2
      const p2 = gmailDiv.querySelectorAll('p')[1];
      const range = document.createRange();
      range.setStart(p2.firstChild!, 10); // inside "Please take"
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const result = await adapter.insertText(gmailDiv, 'daily ', {
        element: gmailDiv,
        type: 'contenteditable',
        range,
        timestamp: Date.now(),
      });

      expect(result.success).toBe(true);
      expect(gmailDiv.textContent).toContain('daily');
      expect(gmailDiv.textContent).toContain('Dr. Smith');
      expect(gmailDiv.textContent).toContain('Dear Patient');
    });
  });

  describe('WhatsApp Zero-Accidental-Send Guard', () => {
    it('never fires Enter keydown event that could trigger accidental sending', async () => {
      const waDiv = document.createElement('div');
      waDiv.setAttribute('contenteditable', 'true');
      waDiv.setAttribute('data-tab', '10');
      document.body.appendChild(waDiv);

      const onKeyDown = vi.fn();
      waDiv.addEventListener('keydown', onKeyDown);

      const adapter = new WhatsAppWebAdapter();
      const result = await adapter.insertText(waDiv, 'Hello doctor\nHere are the labs');

      expect(result.success).toBe(true);
      // Ensure no Enter keydown event was triggered
      const enterKeyEvents = onKeyDown.mock.calls.filter((c) => c[0]?.key === 'Enter');
      expect(enterKeyEvents.length).toBe(0);
      expect(adapter.getCapabilities().preventAccidentalSend).toBe(true);
    });

    it('uses execCommand insertText as primary strategy for Meta Lexical compatibility', async () => {
      const waDiv = document.createElement('div');
      waDiv.setAttribute('contenteditable', 'true');
      waDiv.setAttribute('data-tab', '10');
      document.body.appendChild(waDiv);

      const mockExec = vi.fn().mockReturnValue(true);
      (document as any).execCommand = mockExec;

      const adapter = new WhatsAppWebAdapter();
      const result = await adapter.insertText(waDiv, 'Testing voice input on WhatsApp');

      expect(mockExec).toHaveBeenCalledWith('insertText', false, 'Testing voice input on WhatsApp');
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('whatsapp-lexical-execCommand');
    });

    it('successfully inserts text into composer when given a nested child element', async () => {
      const footer = document.createElement('footer');
      const waDiv = document.createElement('div');
      waDiv.setAttribute('contenteditable', 'true');
      const p = document.createElement('p');
      waDiv.appendChild(p);
      footer.appendChild(waDiv);
      document.body.appendChild(footer);

      const mockExec = vi.fn().mockReturnValue(true);
      (document as any).execCommand = mockExec;

      const adapter = new WhatsAppWebAdapter();
      // Pass the child <p> element instead of outer container
      const result = await adapter.insertText(p, 'Dictated into nested paragraph');

      expect(mockExec).toHaveBeenCalledWith('insertText', false, 'Dictated into nested paragraph');
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('whatsapp-lexical-execCommand');
    });
  });

  describe('Canvas Virtual Surface Fallback (Google Docs & Office Online)', () => {
    it('copies to clipboard and provides transparent user notification', async () => {
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);

      vi.spyOn(window, 'location', 'get').mockReturnValue({
        hostname: 'docs.google.com',
        pathname: '/document/d/xyz',
      } as any);

      const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText');

      const adapter = new CanvasVirtualDocsAdapter();
      const result = await adapter.insertText(canvas, 'Clinical findings summary dictated by physician');

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('canvas-virtual-clipboard');
      expect(result.requiresPasteAction).toBe(true);
      expect(result.fallbackNotice).toContain('Google Docs uses canvas rendering');
      expect(clipboardSpy).toHaveBeenCalledWith('Clinical findings summary dictated by physician');
    });
  });

  describe('Deduplication & Caret Preservation in TextInsertionEngine', () => {
    it('prevents rapid duplicate insertions within dedup window', async () => {
      const focusManager = new FocusManager();
      const engine = new TextInsertionEngine(focusManager);

      const input = document.createElement('input');
      input.value = '';
      document.body.appendChild(input);
      input.focus();

      // First insertion
      const res1 = await engine.insert('patient alert', { smartSpacing: false });
      expect(res1.success).toBe(true);
      expect(input.value).toBe('patient alert');

      // Immediate duplicate insertion with identical text
      const res2 = await engine.insert('patient alert', { smartSpacing: false });
      expect(res2.strategy).toBe('deduplicated');
      // Value should NOT have doubled
      expect(input.value).toBe('patient alert');
    });

    it('safely handles insertion when cursor is at the beginning of an input', async () => {
      const focusManager = new FocusManager();
      const engine = new TextInsertionEngine(focusManager);

      const input = document.createElement('input');
      input.value = ' World';
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(0, 0);

      await engine.insert('Hello', { smartSpacing: false });
      expect(input.value).toBe('Hello World');
    });

    it('safely handles insertion when text is selected (replacement mode)', async () => {
      const focusManager = new FocusManager();
      const engine = new TextInsertionEngine(focusManager);

      const input = document.createElement('input');
      input.value = 'Status: Pending Review';
      document.body.appendChild(input);
      input.focus();
      // Select "Pending" (from 8 to 15)
      input.setSelectionRange(8, 15);

      await engine.insert('Approved', { smartSpacing: false });
      expect(input.value).toBe('Status: Approved Review');
    });
  });
});
