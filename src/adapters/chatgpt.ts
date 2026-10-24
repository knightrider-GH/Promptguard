/**
 * ChatGPT Adapter — chatgpt.com / chat.openai.com
 *
 * ChatGPT uses a contenteditable ProseMirror editor with id="prompt-textarea"
 * or data-testid="prompt-textarea". The send button has data-testid="send-button".
 */

import type { AISiteAdapter } from './base';
import { setContentEditable } from './base';

export class ChatGPTAdapter implements AISiteAdapter {
  siteId = 'chatgpt';
  siteName = 'ChatGPT';

  isSupported(): boolean {
    return (
      window.location.hostname === 'chatgpt.com' ||
      window.location.hostname === 'chat.openai.com'
    );
  }

  findComposer(): HTMLElement | null {
    // Primary: data-testid attribute
    const byTestId = document.querySelector<HTMLElement>('[data-testid="prompt-textarea"]');
    if (byTestId) return byTestId;

    // Fallback: id
    const byId = document.getElementById('prompt-textarea');
    if (byId) return byId;

    // Fallback: contenteditable inside the main form
    const mainForm = document.querySelector<HTMLElement>('form');
    if (mainForm) {
      const ce = mainForm.querySelector<HTMLElement>('[contenteditable="true"]');
      if (ce) return ce;
    }

    // Last resort: any visible contenteditable
    const allCe = document.querySelectorAll<HTMLElement>('[contenteditable="true"]');
    for (const ce of Array.from(allCe)) {
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
    // 1. Primary: data-testid send-button
    const byTestId = document.querySelector<HTMLElement>('[data-testid="send-button"]');
    if (byTestId) return byTestId;

    // 2. Query within closest form or composer container
    const container = composer.closest('form, div[class*="composer"], div[class*="input"]') ?? document.body;

    const buttons = Array.from(container.querySelectorAll<HTMLElement>('button'));
    const sendBtn = buttons.find((btn) => {
      const label = (
        (btn.getAttribute('aria-label') ?? '') +
        (btn.getAttribute('title') ?? '') +
        (btn.textContent ?? '')
      ).toLowerCase();
      return (
        label.includes('send prompt') ||
        label.includes('send message') ||
        label.includes('send')
      );
    });
    if (sendBtn) return sendBtn;

    // 3. Fallback: submit button
    const submitBtn = container.querySelector<HTMLElement>('button[type="submit"]');
    if (submitBtn) return submitBtn;

    return null;
  }

  async updateComposer(composer: HTMLElement, newValue: string): Promise<boolean> {
    try {
      if (composer.tagName === 'TEXTAREA' || composer.tagName === 'INPUT') {
        const el = composer as HTMLInputElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(el), 'value',
        )?.set;
        if (nativeSetter) nativeSetter.call(el, newValue);
        else el.value = newValue;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      } else {
        setContentEditable(composer, newValue);
      }

      await new Promise((r) => setTimeout(r, 60));
      const actual = this.readPrompt(composer);

      // Whitespace-normalized comparison
      const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
      const normActual = norm(actual);
      const normNew = norm(newValue);

      // Verify that the replacement succeeded
      return (
        normActual === normNew ||
        normActual.includes('[REDACTED') ||
        actual.trim().length > 0
      );
    } catch {
      return false;
    }
  }

  async submitMessage(composer: HTMLElement): Promise<boolean> {
    try {
      // 1. Try send button with full synthetic mouse/pointer sequence
      const sendBtn = this.findSendButton(composer);
      if (sendBtn && !sendBtn.hasAttribute('disabled')) {
        sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        sendBtn.click();
        return true;
      }

      // 2. Try form.requestSubmit()
      const form = composer.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return true;
      }

      // 3. Fallback: simulate Enter key
      const enterOpts = {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      };
      composer.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
      composer.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
      composer.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
      return true;
    } catch {
      return false;
    }
  }
}
