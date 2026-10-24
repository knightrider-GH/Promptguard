/**
 * Claude Adapter — claude.ai
 *
 * Claude uses a ProseMirror contenteditable editor. The send button can be
 * identified by its aria-label or button type. Selectors as observed in the
 * Claude web interface; may require updating if the site changes.
 */

import type { AISiteAdapter } from './base';
import { setContentEditable, verifyComposerUpdate } from './base';

export class ClaudeAdapter implements AISiteAdapter {
  siteId = 'claude';
  siteName = 'Claude';

  isSupported(): boolean {
    return window.location.hostname === 'claude.ai';
  }

  findComposer(): HTMLElement | null {
    // Claude's input is a contenteditable div with specific attributes
    const selectors = [
      '[data-testid="composer-input"]',
      '[contenteditable="true"][data-placeholder]',
      '.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    return null;
  }

  readPrompt(composer: HTMLElement): string {
    return composer.innerText ?? composer.textContent ?? '';
  }

  findSendButton(composer: HTMLElement): HTMLElement | null {
    const selectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      '[data-testid="send-button"]',
      'button[type="submit"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }
    // Fallback: search near the composer
    const parent = composer.closest('form') ?? composer.parentElement;
    if (parent) {
      const btn = parent.querySelector<HTMLElement>('button');
      if (btn) return btn;
    }
    return null;
  }

  async updateComposer(composer: HTMLElement, newValue: string): Promise<boolean> {
    try {
      setContentEditable(composer, newValue);
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
      // Fallback: Enter key
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
