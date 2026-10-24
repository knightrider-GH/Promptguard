/**
 * Google Gemini Adapter — gemini.google.com
 *
 * Gemini uses a rich text editor (Quill/rich-textarea) with a send button.
 */

import type { AISiteAdapter } from './base';
import { setContentEditable, verifyComposerUpdate } from './base';

export class GeminiAdapter implements AISiteAdapter {
  siteId = 'gemini';
  siteName = 'Google Gemini';

  isSupported(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  findComposer(): HTMLElement | null {
    const selectors = [
      'rich-textarea [contenteditable="true"]',
      'rich-textarea[aria-label]',
      '.ql-editor[contenteditable="true"]',
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
    return composer.innerText ?? composer.textContent ?? '';
  }

  findSendButton(composer: HTMLElement): HTMLElement | null {
    // 1. Primary Gemini selectors
    const selectors = [
      'button.send-button',
      'button[aria-label*="Send" i]',
      'button[aria-label*="send" i]',
      'button[aria-label*="Submit" i]',
      'button[jsname="Qx7uuf"]',
      'mat-icon-button[aria-label*="send" i]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return el;
    }

    // 2. Query within closest container
    const container = composer.closest('div.input-area, form, rich-textarea, div[class*="chat-input"]') ?? document.body;
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button'));
    const sendBtn = buttons.find((btn) => {
      const label = (
        (btn.getAttribute('aria-label') ?? '') +
        (btn.getAttribute('title') ?? '') +
        (btn.textContent ?? '')
      ).toLowerCase();
      return label.includes('send') || label.includes('submit');
    });

    return sendBtn ?? null;
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
        sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
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
