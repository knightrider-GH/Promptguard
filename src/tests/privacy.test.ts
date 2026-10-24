/**
 * PromptGuard Privacy Tests
 *
 * Verifies that no prompt content escapes through the detection/redaction layer.
 * All values are SYNTHETIC.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanText } from '../engine/detector';
import { redactAll } from '../engine/redactor';
import { DEFAULT_SETTINGS } from '../types';

const settings = DEFAULT_SETTINGS.detection;

describe('Privacy — no external network requests from scanner', () => {
  it('scanText does not call fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    scanText('sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB test@example.com', settings);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('redactAll does not call fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { detections } = scanText('password = "s3cret!"', settings);
    redactAll('password = "s3cret!"', detections);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('Privacy — no secret values in detection output', () => {
  it('detection maskedExcerpt does not contain the full API key', () => {
    const key = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const result = scanText(`My key is ${key}`, settings);
    const det = result.detections.find((d) => d.category === 'api_key');
    expect(det).toBeDefined();
    expect(det!.maskedExcerpt).not.toBe(key);
    expect(det!.maskedExcerpt).not.toContain('ABCDEFGHIJKLMNOPQ');
  });

  it('detection maskedExcerpt for email hides username', () => {
    const result = scanText('contact@sensitivecompany.com', settings);
    const det = result.detections.find((d) => d.category === 'email');
    expect(det).toBeDefined();
    expect(det!.maskedExcerpt).not.toContain('contact');
  });

  it('password detection maskedExcerpt hides the value', () => {
    const result = scanText('password = "My$ecretValu3"', settings);
    const det = result.detections.find((d) => d.category === 'password');
    expect(det).toBeDefined();
    expect(det!.maskedExcerpt).not.toContain('My$ecretValu3');
  });
});

describe('Privacy — redacted text does not contain secrets', () => {
  it('API key is not present in sanitized text', () => {
    const key = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const text = `Use this key: ${key} to access the API.`;
    const { detections } = scanText(text, settings);
    const { sanitizedText } = redactAll(text, detections);
    expect(sanitizedText).not.toContain(key);
  });

  it('database password is not in sanitized text', () => {
    const text = 'postgresql://admin:SuperSecret99!@db.example.com:5432/prod';
    const { detections } = scanText(text, settings);
    const { sanitizedText } = redactAll(text, detections);
    expect(sanitizedText).not.toContain('SuperSecret99!');
  });
});

describe('Privacy — placeholder map contains no raw secret values', () => {
  it('placeholderMap values contain only category and placeholder keys, not secrets', () => {
    const text = 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const { detections } = scanText(text, settings);
    const { placeholderMap } = redactAll(text, detections);
    for (const [key, value] of placeholderMap) {
      expect(key).toMatch(/^\[REDACTED_/);
      expect(value).not.toHaveProperty('rawValue');
      expect(JSON.stringify(value)).not.toContain('sk-proj');
    }
  });
});

describe('Privacy — protection disabled stops scanning', () => {
  it('returns no detections when enabled=false', () => {
    const result = scanText('sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 test@example.com', {
      ...settings,
      enabled: false,
    });
    expect(result.detections).toHaveLength(0);
  });
});
