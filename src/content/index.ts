/**
 * PromptGuard Content Script
 *
 * Runs on supported AI websites. Intercepts submissions, runs the local
 * detection engine, and mounts the warning UI when findings are detected.
 *
 * All scanning is LOCAL — no prompt text is sent to any external service.
 */

import { scanText } from '../engine/detector';
import { redactText } from '../engine/redactor';
import { getAdapter } from '../adapters';
import type { AISiteAdapter } from '../adapters';
import type { ExtensionSettings, Detection, SubmissionState } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { WarningUI } from './warningUI';

// ─── State ────────────────────────────────────────────────────────────────────

let settings: ExtensionSettings = DEFAULT_SETTINGS;
let submissionState: SubmissionState = 'idle';
let adapter: AISiteAdapter | null = null;
let warningUI: WarningUI | null = null;
let activeComposer: HTMLElement | null = null;

// Track explicit user authorization (Send Anyway or Redact & Send)
// If the user authorizes a prompt, that specific text is allowed to pass through
// without re-interception for 60 seconds (prevents infinite modal loops).
let authorizedPromptText: string | null = null;
let authorizedUntil = 0;

// ─── Messaging helpers ────────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.success && response.data) {
        settings = response.data;
      }
      resolve();
    });
  });
}

function incrementStat(key: string): void {
  chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', payload: key });
}

// ─── Warning UI lifecycle ─────────────────────────────────────────────────────

function mountWarning(detections: Detection[], promptText: string): void {
  if (warningUI) {
    warningUI.destroy();
    warningUI = null;
  }
  warningUI = new WarningUI({
    detections,
    promptText,
    onRedactAndSend: handleRedactAndSend,
    onSendAnyway: handleSendAnyway,
    onCancel: handleCancel,
    settings,
  });
  warningUI.mount();
  submissionState = 'waiting_for_user_decision';
}

function destroyWarning(): void {
  if (warningUI) {
    warningUI.destroy();
    warningUI = null;
  }
}

// ─── Decision handlers ────────────────────────────────────────────────────────

async function handleRedactAndSend(selectedIds: string[], detections: Detection[]): Promise<void> {
  if (!adapter || !activeComposer) {
    destroyWarning();
    submissionState = 'idle';
    return;
  }

  submissionState = 'redacting';
  const currentText = adapter.readPrompt(activeComposer);
  const { sanitizedText } = redactText(currentText, detections, selectedIds);

  incrementStat('redactions');

  // Re-scan the sanitized text
  const rescan = scanText(sanitizedText, settings.detection);
  if (rescan.detections.length > 0) {
    // Remaining findings — show updated warning
    destroyWarning();
    mountWarning(rescan.detections, sanitizedText);
    return;
  }

  // Update the composer with sanitized text
  submissionState = 'ready_to_submit';
  const updated = await adapter.updateComposer(activeComposer, sanitizedText);

  if (!updated) {
    destroyWarning();
    submissionState = 'idle';
    showToast('⚠️ Could not update the message. Please redact manually.', 'error');
    return;
  }

  // Authorize this sanitized prompt so programmatic or manual submit passes through
  authorizedPromptText = sanitizedText.trim();
  authorizedUntil = Date.now() + 60000;

  destroyWarning();
  submissionState = 'submitting';

  // Attempt automatic submission replay
  const submitted = await adapter.submitMessage(activeComposer);
  if (!submitted) {
    showToast('Message sanitized! You can now send it.', 'success');
  }

  submissionState = 'idle';
}

async function handleSendAnyway(): Promise<void> {
  if (!adapter || !activeComposer) {
    destroyWarning();
    submissionState = 'idle';
    return;
  }

  const promptText = adapter.readPrompt(activeComposer);

  incrementStat('allowedOverrides');

  // Authorize this prompt so programmatic or manual send will pass straight through
  authorizedPromptText = promptText.trim();
  authorizedUntil = Date.now() + 60000;

  destroyWarning();
  submissionState = 'submitting';

  // Attempt to trigger site send
  const submitted = await adapter.submitMessage(activeComposer);
  if (!submitted) {
    showToast('Override approved. Click Send to submit.', 'success');
  }

  submissionState = 'idle';
}

function handleCancel(): void {
  incrementStat('cancellations');
  destroyWarning();
  submissionState = 'idle';
}

// ─── Interception Logic ───────────────────────────────────────────────────────

function isPromptAuthorized(text: string): boolean {
  if (!authorizedPromptText) return false;
  if (Date.now() > authorizedUntil) {
    authorizedPromptText = null;
    return false;
  }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return norm(text) === norm(authorizedPromptText);
}

function interceptSubmission(event: Event, composer: HTMLElement): void {
  // 1. If warning modal is currently showing, block duplicate background submissions
  if (submissionState === 'waiting_for_user_decision' || submissionState === 'redacting') {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (!adapter) return;

  const promptText = adapter.readPrompt(composer);
  if (!promptText || promptText.trim().length === 0) {
    return; // Empty prompt — let the site handle it natively
  }

  // 2. Check if the user already explicitly authorized this exact prompt
  if (isPromptAuthorized(promptText)) {
    // Clear one-time authorization and let the native event submit uninterrupted!
    authorizedPromptText = null;
    authorizedUntil = 0;
    submissionState = 'idle';
    return;
  }

  // 3. Scan the text synchronously (< 1ms)
  const result = scanText(promptText, settings.detection);
  incrementStat('scans');

  if (result.detections.length === 0) {
    // No sensitive findings!
    // DO NOT preventDefault! Let the user's native event submit directly!
    submissionState = 'idle';
    return;
  }

  // 4. Sensitive data detected! Block the submission and mount the warning modal
  event.preventDefault();
  event.stopImmediatePropagation();

  activeComposer = composer;
  incrementStat('warnings');
  submissionState = 'warning_required';
  mountWarning(result.detections, promptText);
}

// ─── Global Event Delegation (Never requires a page refresh) ─────────────────

function setupGlobalListeners(): void {
  // Capture Enter keydown globally across SPA navigations
  document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return; // Shift+Enter creates a newline
      if (event.isComposing) return; // IME composing (Japanese/Chinese etc.)
      if (!adapter) return;

      const composer = adapter.findComposer();
      if (!composer) return;

      const target = event.target as Node | null;
      if (target && (composer === target || composer.contains(target))) {
        interceptSubmission(event, composer);
      }
    },
    true, // Capture phase to intercept before React/ProseMirror handlers
  );

  // Capture Send button clicks globally across SPA navigations
  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (!adapter) return;

      const composer = adapter.findComposer();
      if (!composer) return;

      const sendBtn = adapter.findSendButton(composer);
      const target = event.target as Node | null;

      if (sendBtn && target && (sendBtn === target || sendBtn.contains(target))) {
        interceptSubmission(event, composer);
      }
    },
    true, // Capture phase
  );

  // Capture form submissions globally
  document.addEventListener(
    'submit',
    (event: SubmitEvent) => {
      if (!adapter) return;

      const composer = adapter.findComposer();
      if (!composer) return;

      const form = composer.closest('form');
      const target = event.target as Node | null;

      if (form && target && (form === target || form.contains(target))) {
        interceptSubmission(event, composer);
      }
    },
    true, // Capture phase
  );
}

// ─── Toast notifications ──────────────────────────────────────────────────────

function showToast(message: string, type: 'error' | 'warning' | 'success' = 'warning'): void {
  const existing = document.getElementById('pg-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'pg-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    padding: 12px 20px;
    border-radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: white;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    max-width: 360px;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981'};
    pointer-events: none;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Settings change listener ─────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.pg_settings) {
    const newSettings = changes.pg_settings.newValue;
    if (newSettings) {
      settings = { ...DEFAULT_SETTINGS, ...newSettings };
    }
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  await loadSettings();

  if (!settings.protectionEnabled) return;

  const hostname = window.location.hostname;
  const isGeneric = settings.genericAdapterSites.includes(hostname);

  adapter = getAdapter(isGeneric);
  if (!adapter) return;

  setupGlobalListeners();
}

init();
