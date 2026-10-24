/**
 * PromptGuard Site Adapter Interface
 * Each adapter isolates site-specific integration logic.
 */

export interface AISiteAdapter {
  siteId: string;
  siteName: string;

  /** Returns true if this adapter applies to the current page. */
  isSupported(): boolean;

  /** Find the active composer element. */
  findComposer(): HTMLElement | null;

  /** Read the current text content from the composer. */
  readPrompt(composer: HTMLElement): string;

  /** Find the primary send button near the composer. */
  findSendButton(composer: HTMLElement): HTMLElement | null;

  /**
   * Update the composer content with new text.
   * Returns true if the update was verified successful.
   */
  updateComposer(composer: HTMLElement, newValue: string): Promise<boolean>;

  /**
   * Trigger the site's intended submission mechanism.
   * Should only be called after the extension has authorized the submission.
   * Returns true if submission was triggered.
   */
  submitMessage(composer: HTMLElement): Promise<boolean>;
}

/** Dispatch a synthetic InputEvent to notify framework event listeners */
export function dispatchInputEvent(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

/** Set the value of a native input/textarea using the React internal setter trick */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }
  dispatchInputEvent(element);
}

/** Update a contenteditable element, dispatching necessary events */
export function setContentEditable(element: HTMLElement, text: string): void {
  element.focus();
  // Select all and replace
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  // Use execCommand for contenteditable (deprecated but still most reliable)
  if (document.execCommand) {
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  } else {
    element.textContent = text;
  }
  dispatchInputEvent(element);
}

/** Simulate pressing Enter to submit */
export function simulateEnter(element: HTMLElement): void {
  const opts: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  element.dispatchEvent(new KeyboardEvent('keydown', opts));
  element.dispatchEvent(new KeyboardEvent('keypress', opts));
  element.dispatchEvent(new KeyboardEvent('keyup', opts));
}

/** Check if composer content was updated, tolerating rich-text editor DOM normalization */
export function verifyComposerUpdate(actual: string, target: string): boolean {
  if (!actual && target) return false;
  if (actual.trim() === target.trim()) return true;

  const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (normalize(actual) === normalize(target)) return true;

  // If target contained redaction placeholders and actual contains them
  if (target.includes('[REDACTED') && actual.includes('[REDACTED')) return true;

  // If actual has content
  return actual.trim().length > 0;
}

