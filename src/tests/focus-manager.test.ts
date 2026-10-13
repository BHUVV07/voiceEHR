import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FocusManager } from '../content/focus-manager';
import { WIDGET_CONTAINER_ID } from '../shared/constants';

describe('FocusManager', () => {
  let focusManager: FocusManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    focusManager = new FocusManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects and tracks active HTMLInputElement', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search clinical records...';
    document.body.appendChild(input);

    input.focus();
    input.value = 'John Doe';
    input.setSelectionRange(4, 4);

    const target = focusManager.getActiveTarget();
    expect(target).not.toBeNull();
    expect(target?.element).toBe(input);
    expect(target?.isInputOrTextarea).toBe(true);

    const info = focusManager.getTargetInfo();
    expect(info.hasTarget).toBe(true);
    expect(info.tagName).toBe('INPUT');
    expect(info.placeholder).toBe('Search clinical records...');
  });

  it('restores focus to target element successfully', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Chief complaint: chest pain';
    document.body.appendChild(textarea);

    textarea.focus();
    textarea.setSelectionRange(6, 6);

    const target = focusManager.getActiveTarget();
    expect(target).not.toBeNull();

    // Blur textarea
    textarea.blur();
    expect(document.activeElement).not.toBe(textarea);

    // Restore focus
    const restored = focusManager.restoreFocus(target);
    expect(restored).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });

  it('ignores elements belonging to the VoiceFlow widget', () => {
    const widget = document.createElement('div');
    widget.id = WIDGET_CONTAINER_ID;
    const widgetButton = document.createElement('button');
    widget.appendChild(widgetButton);
    document.body.appendChild(widget);

    widgetButton.focus();

    const info = focusManager.getTargetInfo();
    expect(info.hasTarget).toBe(false);
  });

  it('automatically discovers WhatsApp Web composer when on web.whatsapp.com even if unclicked', () => {
    const footer = document.createElement('footer');
    const waComposer = document.createElement('div');
    waComposer.setAttribute('contenteditable', 'true');
    waComposer.setAttribute('role', 'textbox');
    waComposer.setAttribute('data-tab', '10');
    footer.appendChild(waComposer);
    document.body.appendChild(footer);

    vi.spyOn(window, 'location', 'get').mockReturnValue({
      hostname: 'web.whatsapp.com',
      pathname: '/',
    } as any);

    // document.activeElement is body (nothing clicked)
    const target = focusManager.getActiveTarget();
    expect(target).not.toBeNull();
    expect(target?.element).toBe(waComposer);
    expect(target?.adapterId).toBe('whatsapp-web');
  });
});
