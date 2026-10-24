/**
 * Microsoft Copilot Adapter — copilot.microsoft.com
 *
 * Copilot uses a textarea-based input or contenteditable, with a send button.
 * Selectors based on observed Copilot interface structure.
 */

import type { AISiteAdapter } from './base';
import { setContentEditable, setNativeValue, verifyComposerUpdate } from './base';

export class CopilotAdapter implements AISiteAdapter {
  siteId = 'copilot';
  siteName = 'Microsoft Copilot';

  isSupported(): boolean {
    return window.location.hostname === 'copilot.microsoft.com';
  }

  findComposer(): HTMLElement | null {
    const selectors = [
      'textarea[id*="searchbox"]',
      'textarea[aria-label*="message"]',
      'textarea[aria-label*="prompt"]',
      'textarea[placeholder]',
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
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
    const selectors = [
      'button[aria-label*="Submit"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[type="submit"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    return null;
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
      const sendBtn = this.findSendButton(composer);
      if (sendBtn && !sendBtn.hasAttribute('disabled')) {
        sendBtn.click();
        return true;
      }
      const ev = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      composer.dispatchEvent(ev);
      return true;
    } catch {
      return false;
    }
  }
}
