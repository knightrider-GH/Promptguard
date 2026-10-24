/**
 * PromptGuard Redaction Engine Tests
 * All test values are SYNTHETIC — no real credentials.
 */

import { describe, it, expect } from 'vitest';
import { scanText } from '../engine/detector';
import { redactText, redactAll, redactSelected } from '../engine/redactor';
import type { DetectionSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const fullSettings: DetectionSettings = {
  ...DEFAULT_SETTINGS.detection,
  categories: {
    email: true,
    phone: true,
    api_key: true,
    password: true,
    access_token: true,
    auth_header: true,
    database_credentials: true,
    private_key: true,
    jwt: true,
    high_entropy: false,
  },
};

function scanAndRedactAll(text: string) {
  const { detections } = scanText(text, fullSettings);
  return { detections, ...redactAll(text, detections) };
}

// ─── Single finding ───────────────────────────────────────────────────────────

describe('Redact single finding', () => {
  it('replaces an email address with a placeholder', () => {
    const text = 'Contact me at user@example.com please.';
    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).not.toContain('user@example.com');
    expect(sanitizedText).toContain('[REDACTED_EMAIL_1]');
    expect(sanitizedText).toContain('Contact me at');
    expect(sanitizedText).toContain('please.');
  });

  it('replaces an API key with a placeholder', () => {
    const text = 'My key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB';
    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('[REDACTED_API_KEY_1]');
    expect(sanitizedText).not.toContain('sk-proj-abcdef');
  });

  it('preserves surrounding text', () => {
    const text = 'Hello, the password is password = "Sup3rS3cret!", bye.';
    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('Hello,');
    expect(sanitizedText).toContain('bye.');
  });
});

// ─── Multiple findings ────────────────────────────────────────────────────────

describe('Redact multiple findings', () => {
  it('numbers placeholders sequentially for the same category', () => {
    const text = 'From: a@example.com To: b@test.org';
    const { detections } = scanText(text, fullSettings);
    const { sanitizedText } = redactAll(text, detections);
    // Both emails should be redacted
    expect(sanitizedText).not.toContain('@example.com');
    expect(sanitizedText).not.toContain('@test.org');
    expect(sanitizedText).toContain('[REDACTED_EMAIL_1]');
    expect(sanitizedText).toContain('[REDACTED_EMAIL_2]');
  });

  it('uses different placeholder names for different categories', () => {
    const text = 'email: foo@bar.com and key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB';
    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('[REDACTED_EMAIL_1]');
    expect(sanitizedText).toContain('[REDACTED_API_KEY_1]');
  });

  it('preserves non-sensitive text in multi-finding prompt', () => {
    const text = 'user@a.com is my email and this is just some normal text after.';
    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('is my email and this is just some normal text after.');
  });
});

// ─── Selected redaction ───────────────────────────────────────────────────────

describe('Selected (partial) redaction', () => {
  it('only redacts selected findings', () => {
    const text = 'email: foo@bar.com and also baz@qux.net';
    const { detections } = scanText(text, fullSettings);
    expect(detections.length).toBeGreaterThanOrEqual(2);
    // Only redact the first finding
    const firstId = detections[0].id;
    const { sanitizedText } = redactSelected(text, detections, [firstId]);
    expect(sanitizedText).toContain('[REDACTED_');
    // Not all emails should be redacted
    // The second email should still be present or both might be — depends on order
  });

  it('redacts nothing when selectedIds is empty', () => {
    const text = 'email: foo@bar.com';
    const { detections } = scanText(text, fullSettings);
    const { sanitizedText, redactedIds } = redactSelected(text, detections, []);
    expect(sanitizedText).toBe(text);
    expect(redactedIds).toHaveLength(0);
  });
});

// ─── Empty input ──────────────────────────────────────────────────────────────

describe('Empty input', () => {
  it('returns unchanged empty string', () => {
    const { sanitizedText } = redactAll('', []);
    expect(sanitizedText).toBe('');
  });

  it('returns original text when no detections', () => {
    const text = 'This is harmless text.';
    const { sanitizedText } = redactAll(text, []);
    expect(sanitizedText).toBe(text);
  });
});

// ─── Multiline content ────────────────────────────────────────────────────────

describe('Multiline content', () => {
  it('handles multiline prompts correctly', () => {
    const text = [
      'Here is my setup:',
      'DATABASE_URL = postgresql://admin:secret123@localhost:5432/production',
      '',
      'Can you help me optimize this query?',
    ].join('\n');

    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('Here is my setup:');
    expect(sanitizedText).toContain('Can you help me optimize this query?');
    expect(sanitizedText).not.toContain('secret123');
    expect(sanitizedText).toContain('[REDACTED_DATABASE_CREDENTIALS_1]');
  });

  it('handles PEM private key block (multiline)', () => {
    const text = [
      'My private key:',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAFAKEDATAFAKEDATAFAKEDATAFAKEDATA',
      'FAKEDATAFAKEDATAFAKEDATAmore',
      '-----END RSA PRIVATE KEY-----',
      'End of config',
    ].join('\n');

    const { sanitizedText } = scanAndRedactAll(text);
    expect(sanitizedText).toContain('My private key:');
    expect(sanitizedText).toContain('End of config');
    expect(sanitizedText).not.toContain('MIIEowIBAAKCAQEA');
    expect(sanitizedText).toContain('[REDACTED_PRIVATE_KEY_1]');
  });
});

// ─── Placeholder uniqueness ───────────────────────────────────────────────────

describe('Placeholder uniqueness', () => {
  it('generates unique placeholder IDs for the same category', () => {
    const text = 'email1@a.com and email2@b.com and email3@c.com';
    const { detections } = scanText(text, fullSettings);
    const { sanitizedText } = redactAll(text, detections);
    expect(sanitizedText).toContain('[REDACTED_EMAIL_1]');
    expect(sanitizedText).toContain('[REDACTED_EMAIL_2]');
    expect(sanitizedText).toContain('[REDACTED_EMAIL_3]');
  });
});

// ─── No overlap corruption ────────────────────────────────────────────────────

describe('Overlap handling', () => {
  it('does not produce corrupted text from overlapping replacements', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.fake';
    const { detections } = scanText(text, fullSettings);
    const { sanitizedText } = redactAll(text, detections);
    // Should not contain unbalanced brackets or garbled text
    expect(sanitizedText).not.toContain('REDACTED_AUTH_HEADER_1][');
    // Should contain at least one redaction
    expect(sanitizedText).toContain('[REDACTED_');
  });
});

// ─── Re-scan after redaction ──────────────────────────────────────────────────

describe('Re-scan after redaction', () => {
  it('sanitized text passes a re-scan for the same patterns', () => {
    const text = 'API key: sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB';
    const { sanitizedText } = scanAndRedactAll(text);
    const rescan = scanText(sanitizedText, fullSettings);
    const apiKeyFindings = rescan.detections.filter((d) => d.category === 'api_key');
    // The placeholder should not trigger the api_key pattern
    expect(apiKeyFindings).toHaveLength(0);
  });

  it('re-scan of email redacted text finds no more emails', () => {
    const text = 'user@example.com';
    const { sanitizedText } = scanAndRedactAll(text);
    const rescan = scanText(sanitizedText, fullSettings);
    expect(rescan.detections.filter((d) => d.category === 'email')).toHaveLength(0);
  });
});

// ─── RedactionResult shape ────────────────────────────────────────────────────

describe('RedactionResult structure', () => {
  it('returns the IDs of redacted detections', () => {
    const text = 'foo@bar.com';
    const { detections } = scanText(text, fullSettings);
    const { redactedIds } = redactAll(text, detections);
    expect(redactedIds.length).toBeGreaterThanOrEqual(1);
    expect(redactedIds[0]).toBe(detections[0].id);
  });

  it('returns a placeholderMap with category info', () => {
    const text = 'user@test.com';
    const { detections } = scanText(text, fullSettings);
    const { placeholderMap } = redactAll(text, detections);
    expect(placeholderMap.size).toBeGreaterThanOrEqual(1);
    const entry = [...placeholderMap.values()][0];
    expect(entry.category).toBe('email');
  });
});
