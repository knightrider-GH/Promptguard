/**
 * PromptGuard Background Service Worker
 *
 * Responsibilities:
 * - Settings management
 * - Session counter management
 * - Optional host permission requests
 * - Toolbar icon badge updates
 *
 * The service worker does NOT scan prompts and does NOT store prompt content.
 */

import {
  getSettings,
  saveSettings,
  getSessionStats,
  incrementStat,
  resetSession,
} from '../utils/storage';
import type { BackgroundMessage } from '../types';

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }
        case 'SET_SETTINGS': {
          if (message.payload) {
            await saveSettings(message.payload as any);
          }
          sendResponse({ success: true });
          break;
        }
        case 'GET_SESSION_STATS': {
          const stats = await getSessionStats();
          sendResponse({ success: true, data: stats });
          break;
        }
        case 'INCREMENT_STAT': {
          if (message.payload) {
            await incrementStat(message.payload as any);
          }
          sendResponse({ success: true });
          break;
        }
        case 'RESET_SESSION': {
          await resetSession();
          sendResponse({ success: true });
          break;
        }
        case 'REQUEST_HOST_PERMISSION': {
          const origin = (message.payload as any)?.origin;
          if (!origin) {
            sendResponse({ success: false, error: 'No origin provided' });
            break;
          }
          chrome.permissions.request(
            { origins: [`${origin}/*`] },
            (granted) => {
              sendResponse({ success: true, data: { granted } });
            },
          );
          return true; // Keep message channel open for async
        }
        case 'CHECK_HOST_PERMISSION': {
          const origin = (message.payload as any)?.origin;
          if (!origin) {
            sendResponse({ success: false, error: 'No origin provided' });
            break;
          }
          chrome.permissions.contains(
            { origins: [`${origin}/*`] },
            (contains) => {
              sendResponse({ success: true, data: { granted: contains } });
            },
          );
          return true;
        }
        case 'GET_SITE_STATUS': {
          const settings = await getSettings();
          const url = (message.payload as any)?.url;
          let hostname = '';
          try {
            hostname = new URL(url).hostname;
          } catch {
            sendResponse({ success: false, error: 'Invalid URL' });
            break;
          }
          const isEnabled = settings.enabledSites[hostname] ?? false;
          const isGeneric = settings.genericAdapterSites.includes(hostname);
          sendResponse({ success: true, data: { hostname, isEnabled, isGeneric } });
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: String(err) });
    }
  })();
  return true; // Keep message channel open for all async responses
});

// ─── Extension install / startup ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await resetSession();
  // Ensure defaults are set
  const settings = await getSettings();
  await saveSettings(settings);
});

// ─── Badge management ────────────────────────────────────────────────────────

export async function updateBadge(warningCount: number, enabled: boolean): Promise<void> {
  if (!enabled) {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    return;
  }
  if (warningCount > 0) {
    await chrome.action.setBadgeText({ text: String(warningCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}
