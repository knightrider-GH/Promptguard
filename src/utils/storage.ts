/**
 * Settings storage — uses chrome.storage.sync for persistence.
 * No prompt content or secret values are ever stored here.
 */

import type { ExtensionSettings, SessionStats } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const SETTINGS_KEY = 'pg_settings';
const SESSION_KEY = 'pg_session';

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([SETTINGS_KEY], (result) => {
      const stored = result[SETTINGS_KEY];
      if (stored) {
        // Merge with defaults to handle new keys added in updates
        resolve({
          ...DEFAULT_SETTINGS,
          ...stored,
          detection: {
            ...DEFAULT_SETTINGS.detection,
            ...stored.detection,
            categories: {
              ...DEFAULT_SETTINGS.detection.categories,
              ...(stored.detection?.categories ?? {}),
            },
          },
        });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
}

export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: merged }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

export async function getSessionStats(): Promise<SessionStats> {
  return new Promise((resolve) => {
    chrome.storage.session.get([SESSION_KEY], (result) => {
      resolve(result[SESSION_KEY] ?? {
        scans: 0,
        warnings: 0,
        redactions: 0,
        allowedOverrides: 0,
        cancellations: 0,
      });
    });
  });
}

export async function incrementStat(key: keyof SessionStats): Promise<void> {
  const stats = await getSessionStats();
  stats[key] = (stats[key] ?? 0) + 1;
  return new Promise((resolve) => {
    chrome.storage.session.set({ [SESSION_KEY]: stats }, resolve);
  });
}

export async function resetSession(): Promise<void> {
  const empty: SessionStats = {
    scans: 0,
    warnings: 0,
    redactions: 0,
    allowedOverrides: 0,
    cancellations: 0,
  };
  return new Promise((resolve) => {
    chrome.storage.session.set({ [SESSION_KEY]: empty }, resolve);
  });
}
