/**
 * PromptGuard Detection Engine Tests
 *
 * All test values are SYNTHETIC — no real credentials.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { scanText } from '../engine/detector';
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function scan(text: string, settings = fullSettings) {
  return scanText(text, settings);
}

// ─── Benign text ──────────────────────────────────────────────────────────────

describe('Benign text — should produce no findings', () => {
  it('returns empty for empty input', () => {
    const result = scan('');
    expect(result.detections).toHaveLength(0);
  });

  it('returns empty for whitespace only', () => {
    expect(scan('   \n\t  ').detections).toHaveLength(0);
  });

  it('does not flag ordinary sentences', () => {
    const text = 'Hello! Can you help me write a function that reads a CSV file and computes averages?';
    expect(scan(text).detections).toHaveLength(0);
  });

  it('does not flag security-related concepts without actual values', () => {
    const text = 'I want to understand how API key authentication works. What is the typical flow?';
    expect(scan(text).detections).toHaveLength(0);
  });

  it('does not flag a UUID as a credential', () => {
    const text = 'The request ID is 550e8400-e29b-41d4-a716-446655440000';
    // UUIDs have dashes and aren't in our specific format rules
    expect(scan(text).detections).toHaveLength(0);
  });

  it('does not flag a password policy discussion', () => {
    const text = 'What are best practices for storing passwords securely? Should I use bcrypt?';
    expect(scan(text).detections).toHaveLength(0);
  });
});

// ─── Email detection ──────────────────────────────────────────────────────────

describe('Email detection', () => {
  it('detects a simple email address', () => {
    const result = scan('Please contact me at user@example.com for details.');
    const emails = result.detections.filter((d) => d.category === 'email');
    expect(emails.length).toBeGreaterThanOrEqual(1);
    expect(emails[0].severity).toBe('medium');
  });

  it('detects email in context', () => {
    const result = scan('From: john.doe@company.org\nTo: info@other.net');
    const emails = result.detections.filter((d) => d.category === 'email');
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it('masks the email correctly (does not show full address)', () => {
    const result = scan('Contact: alice@example.com');
    const emails = result.detections.filter((d) => d.category === 'email');
    expect(emails[0].maskedExcerpt).not.toBe('alice@example.com');
    expect(emails[0].maskedExcerpt).toContain('@example.com');
  });

  it('can be disabled via settings', () => {
    const settings = { ...fullSettings, categories: { ...fullSettings.categories, email: false } };
    const result = scan('user@example.com', settings);
    expect(result.detections.filter((d) => d.category === 'email')).toHaveLength(0);
  });
});

// ─── API key detection ────────────────────────────────────────────────────────

describe('API key detection', () => {
  it('detects an OpenAI-style API key', () => {
    const result = scan('My key is sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGH');
    const keys = result.detections.filter((d) => d.category === 'api_key');
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[0].severity).toBe('critical');
  });

  it('detects a GitHub personal access token', () => {
    const result = scan('Token: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789A');
    const keys = result.detections.filter((d) => d.category === 'api_key');
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('detects an AWS access key ID', () => {
    const result = scan('AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE');
    const keys = result.detections.filter((d) => d.category === 'api_key');
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a Google API key', () => {
    // Google API keys follow AIza[A-Za-z0-9\-_]{35} — total 39 chars
    const result = scan('const key = "AIzaSyBvOijklmnopqrstuvwxyz01234567890A";');
    const keys = result.detections.filter((d) => d.category === 'api_key');
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('detects a Stripe test API key', () => {
    // Construct dummy key at runtime to prevent static scanner false positives
    const dummyStripeKey = ['sk', 'test', 'fakekey00000000000000000000'].join('_');
    const result = scan(`const stripe = require("stripe")("${dummyStripeKey}");`);
    const keys = result.detections.filter((d) => d.category === 'api_key');
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys[0].severity).toBe('critical');
  });

  it('does not flag the word "api_key" with no value', () => {
    const text = 'Set your api_key in the .env file.';
    const result = scan(text);
    expect(result.detections.filter((d) => d.category === 'api_key')).toHaveLength(0);
  });
});

// ─── Password detection ────────────────────────────────────────────────────────

describe('Password and secret detection', () => {
  it('detects a password assignment', () => {
    const result = scan('DB_PASSWORD = "MyS3cretPassword123!"');
    const passwords = result.detections.filter((d) => d.category === 'password');
    expect(passwords.length).toBeGreaterThanOrEqual(1);
    expect(passwords[0].severity).toBe('high');
  });

  it('detects a client_secret assignment', () => {
    const result = scan('client_secret = "xyzzy-totally-synthetic-secret-value"');
    expect(result.detections.some((d) => d.category === 'password')).toBe(true);
  });

  it('detects case-insensitive password labels', () => {
    const result = scan('PASSWORD: SuperSecret!99');
    expect(result.detections.some((d) => d.category === 'password')).toBe(true);
  });

  it('detects api_key assignment', () => {
    const result = scan('api_key = "totally-fake-key-value-for-testing-1234"');
    expect(result.detections.some((d) => d.category === 'password' || d.category === 'api_key')).toBe(true);
  });

  it('masks password — does not show the full value', () => {
    const result = scan('password = "MyHiddenValue!"');
    const pw = result.detections.find((d) => d.category === 'password');
    expect(pw).toBeDefined();
    expect(pw!.maskedExcerpt).not.toContain('MyHiddenValue!');
  });
});

// ─── Auth header detection ────────────────────────────────────────────────────

describe('Authorization header detection', () => {
  it('detects Bearer token header', () => {
    const result = scan('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.token');
    expect(result.detections.some((d) => d.category === 'auth_header')).toBe(true);
  });

  it('detects Basic auth header', () => {
    const result = scan('Authorization: Basic dXNlcjpwYXNzd29yZA==');
    expect(result.detections.some((d) => d.category === 'auth_header')).toBe(true);
  });
});

// ─── Database credential detection ────────────────────────────────────────────

describe('Database credential detection', () => {
  it('detects a PostgreSQL connection string', () => {
    const result = scan('DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/mydb');
    expect(result.detections.some((d) => d.category === 'database_credentials')).toBe(true);
    expect(result.detections[0].severity).toBe('critical');
  });

  it('detects a MySQL connection string', () => {
    const result = scan('DB_URL = mysql://root:secretpass@db.example.com:3306/app_db');
    expect(result.detections.some((d) => d.category === 'database_credentials')).toBe(true);
  });

  it('detects a MongoDB connection string', () => {
    const result = scan('MONGO_URI = mongodb+srv://admin:pass123@cluster0.example.mongodb.net/mydb');
    expect(result.detections.some((d) => d.category === 'database_credentials')).toBe(true);
  });

  it('masks the connection string', () => {
    const result = scan('postgresql://user:secret@localhost/db');
    const db = result.detections.find((d) => d.category === 'database_credentials');
    expect(db).toBeDefined();
    expect(db!.maskedExcerpt).not.toContain('secret');
  });
});

// ─── Private key detection ────────────────────────────────────────────────────

describe('Private key detection', () => {
  it('detects a PEM private key block', () => {
    const text = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4POOK4NUb9QeJ7EM
FAKEKEYDATAFAKEKEYDATAFAKEKEYDATAFAKEKEY
-----END RSA PRIVATE KEY-----
    `.trim();
    const result = scan(text);
    expect(result.detections.some((d) => d.category === 'private_key')).toBe(true);
    expect(result.detections[0].severity).toBe('critical');
  });

  it('masks the entire private key block', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nFAKEDATA\n-----END RSA PRIVATE KEY-----';
    const result = scan(text);
    const pk = result.detections.find((d) => d.category === 'private_key');
    expect(pk?.maskedExcerpt).toBe('[PRIVATE KEY BLOCK]');
  });
});

// ─── JWT detection ────────────────────────────────────────────────────────────

describe('JWT token detection', () => {
  it('detects a JWT-formatted token', () => {
    const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scan(text);
    expect(result.detections.some((d) => d.category === 'jwt')).toBe(true);
  });
});

// ─── Multiple findings ────────────────────────────────────────────────────────

describe('Multiple findings in one prompt', () => {
  it('detects multiple categories simultaneously', () => {
    const text = `
My email is testuser@example.com
The API key is sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB
Password = MySecret123
    `.trim();
    const result = scan(text);
    const cats = new Set(result.detections.map((d) => d.category));
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });

  it('returns unique IDs for each detection', () => {
    const text = 'user@a.com AND admin@b.com AND sk-proj-abcdefghijklmnopqrstuvwxyz1234ABCDEFGH';
    const result = scan(text);
    const ids = result.detections.map((d) => d.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ─── Overlap resolution ───────────────────────────────────────────────────────

describe('Overlap resolution', () => {
  it('does not produce overlapping detections', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZXN0IjoidmFsdWUifQ.signature';
    const result = scan(text);
    const sorted = [...result.detections].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    }
  });
});

// ─── Settings disabled ────────────────────────────────────────────────────────

describe('Settings — category disabled', () => {
  it('respects disabled detection engine', () => {
    const result = scanText('sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB', {
      ...fullSettings,
      enabled: false,
    });
    expect(result.detections).toHaveLength(0);
  });

  it('respects disabled api_key category', () => {
    const settings = { ...fullSettings, categories: { ...fullSettings.categories, api_key: false } };
    const result = scan('sk-proj-abcdefghijklmnopqrstuvwxyz1234567890AB', settings);
    expect(result.detections.filter((d) => d.category === 'api_key')).toHaveLength(0);
  });
});

// ─── Scan metadata ────────────────────────────────────────────────────────────

describe('Scan metadata', () => {
  it('returns a scanId', () => {
    const result = scan('hello');
    expect(result.scanId).toBeTruthy();
  });

  it('returns correct inputLength', () => {
    const text = 'hello world';
    const result = scan(text);
    expect(result.inputLength).toBe(text.length);
  });

  it('returns a scannedAt timestamp', () => {
    const before = Date.now();
    const result = scan('test');
    expect(result.scannedAt).toBeGreaterThanOrEqual(before);
  });
});
