import { EditorAdapter } from './types';
import { StandardInputAdapter } from './StandardInputAdapter';
import { GenericContentEditableAdapter } from './GenericContentEditableAdapter';
import { GmailComposerAdapter } from './GmailComposerAdapter';
import { WhatsAppWebAdapter } from './WhatsAppWebAdapter';
import { ChatGPTClaudeAdapter } from './ChatGPTClaudeAdapter';
import { NotionAdapter } from './NotionAdapter';
import { CanvasVirtualDocsAdapter } from './CanvasVirtualDocsAdapter';
import { EHRClinicalAdapter } from './EHRClinicalAdapter';
import { FallbackClipboardAdapter } from './FallbackClipboardAdapter';

export class AdapterRegistry {
  private static instance: AdapterRegistry | null = null;
  private adapters: EditorAdapter[] = [];
  private fallbackAdapter: EditorAdapter;

  private constructor() {
    this.fallbackAdapter = new FallbackClipboardAdapter();

    // Register all built-in adapters
    this.registerAdapter(new CanvasVirtualDocsAdapter());
    this.registerAdapter(new GmailComposerAdapter());
    this.registerAdapter(new WhatsAppWebAdapter());
    this.registerAdapter(new ChatGPTClaudeAdapter());
    this.registerAdapter(new NotionAdapter());
    this.registerAdapter(new EHRClinicalAdapter());
    this.registerAdapter(new GenericContentEditableAdapter());
    this.registerAdapter(new StandardInputAdapter());
  }

  static getInstance(): AdapterRegistry {
    if (!this.instance) {
      this.instance = new AdapterRegistry();
    }
    return this.instance;
  }

  registerAdapter(adapter: EditorAdapter) {
    this.adapters.push(adapter);
    // Sort descending by priority (higher priority evaluated first)
    this.adapters.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Resolves the most appropriate EditorAdapter for the target element.
   */
  getAdapter(element: Element | null): EditorAdapter {
    for (const adapter of this.adapters) {
      try {
        if (adapter.detect(element)) {
          return adapter;
        }
      } catch (err) {
        console.warn(`[VoiceFlow AI] Error evaluating adapter ${adapter.name}:`, err);
      }
    }

    return this.fallbackAdapter;
  }

  getAllAdapters(): EditorAdapter[] {
    return [...this.adapters, this.fallbackAdapter];
  }
}

export * from './types';
export * from './StandardInputAdapter';
export * from './GenericContentEditableAdapter';
export * from './GmailComposerAdapter';
export * from './WhatsAppWebAdapter';
export * from './ChatGPTClaudeAdapter';
export * from './NotionAdapter';
export * from './CanvasVirtualDocsAdapter';
export * from './EHRClinicalAdapter';
export * from './FallbackClipboardAdapter';
