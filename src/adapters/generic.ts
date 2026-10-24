/**
 * Generic Adapter — for user-enabled additional websites.
 *
 * This adapter attempts to locate a composer and send button using
 * heuristics only. It is activated when the user explicitly enables
 * protection on an unfamiliar AI website via the popup.
 *
 * The adapter does NOT claim full protection — it reports its status
 * honestly as 'generic_adapter'.
 */

import type { AISiteAdapter } from './base';
import { setContentEditable, setNativeValue, verifyComposerUpdate } from './base';

const SEND_LABELS = [
  'send', 'submit', 'generate', 'chat', 'ask', 'go', 'run', 'enter', 'send message',
];

export class GenericAdapter implements AISiteAdapter {
  siteId = 'generic';
  siteName = 'Custom Website';

  isSupported(): boolean {
    // Generic adapter is always potentially applicable
    return true;
  }

  findComposer(): HTMLElement | null {
    // Priority 1: textarea with placeholder suggesting prompt input
    const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));
    for (const ta of textareas) {
      const placeholder = ta.getAttribute('placeholder')?.toLowerCase() ?? '';
      const ariaLabel = ta.getAttribute('aria-label')?.toLowerCase() ?? '';
      if (
        placeholder.includes('message') ||
        placeholder.includes('prompt') ||
        placeholder.includes('ask') ||
        ariaLabel.includes('message') ||
        ariaLabel.includes('prompt')
      ) {
        return ta;
      }
    }
    // Priority 2: any visible textarea
    for (const ta of textareas) {
      if (ta.offsetParent !== null && !ta.disabled) return ta;
    }
    // Priority 3: contenteditable with role="textbox"
    const textbox = document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]');
    if (textbox) return textbox;

    // Priority 4: any visible contenteditable
    const ces = Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]'));
    for (const ce of ces) {
      if (ce.offsetParent !== null) return ce;
    }

    return null;
  }

  readPrompt(composer: HTMLElement): string {
    if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
      return (composer as HTMLInputElement).value;
    }
    return composer.innerText ?? composer.textContent ?? '';
  }

  findSendButton(composer: HTMLElement): HTMLElement | null {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'));
    for (const btn of buttons) {
      const label = (
        (btn.getAttribute('aria-label') ?? '') +
        (btn.getAttribute('title') ?? '') +
        (btn.textContent ?? '')
      ).toLowerCase();
      if (SEND_LABELS.some((lbl) => label.includes(lbl))) {
        return btn;
      }
    }
    // Fallback: button type=submit
    return document.querySelector<HTMLElement>('button[type="submit"]');
  }

  async updateComposer(composer: HTMLElement, newValue: string): Promise<boolean> {
    try {
      if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
        setNativeValue(composer as HTMLInputElement, newValue);
      } else {
        setContentEditable(composer, newValue);
      }
      await new Promise((r) => setTimeout(r, 60));
      const actual = this.readPrompt(composer);
      return verifyComposerUpdate(actual, newValue);
    } catch {
      return false;
    }
  }

  async submitMessage(composer: HTMLElement): Promise<boolean> {
    try {
      const btn = this.findSendButton(composer);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
