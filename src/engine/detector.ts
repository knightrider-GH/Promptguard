/**
 * PromptGuard Detection Engine
 * All pattern matching runs locally in the browser.
 * No prompt text is sent to any external service.
 */

import type { Detection, DetectionCategory, DetectionSettings, ScanResult, Severity } from '../types';

// ─── Utility ────────────────────────────────────────────────────────────────

let _idCounter = 0;
function makeId(): string {
  return `det_${Date.now()}_${++_idCounter}`;
}

function makeScanId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function maskValue(value: string): string {
  if (value.length <= 4) return '••••';
  const show = Math.min(4, Math.floor(value.length * 0.15));
  return value.slice(0, show) + '•'.repeat(Math.min(8, value.length - show));
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return maskValue(email);
  const masked = user.length <= 2 ? '••' : user[0] + '•'.repeat(Math.min(4, user.length - 1));
  return `${masked}@${domain}`;
}

function maskMiddle(value: string): string {
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '•'.repeat(Math.min(12, value.length - 8)) + value.slice(-4);
}

// ─── Shannon entropy heuristic ───────────────────────────────────────────────

function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const ch of str) freq[ch] = (freq[ch] ?? 0) + 1;
  let h = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    h -= p * Math.log2(p);
  }
  return h;
}

// ─── Rule type ───────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  category: DetectionCategory;
  label: string;
  severity: Severity;
  confidence: number;
  pattern: RegExp;
  explanation: string;
  recommendation: string;
  getMasked?: (match: string) => string;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

const RULES: Rule[] = [
  // === PRIVATE KEYS ===
  {
    id: 'private_key_pem',
    category: 'private_key',
    label: 'PEM Private Key',
    severity: 'critical',
    confidence: 0.99,
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gi,
    explanation: 'A PEM-formatted private key was detected. This is highly sensitive cryptographic material.',
    recommendation: 'Never share private keys with AI assistants. Remove this key before sending.',
    getMasked: () => '[PRIVATE KEY BLOCK]',
  },

  // === API KEYS ===
  {
    id: 'openai_key',
    category: 'api_key',
    label: 'OpenAI API Key',
    severity: 'critical',
    confidence: 0.97,
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9\-_]{20,80}\b/g,
    explanation: 'An OpenAI-format API key was detected.',
    recommendation: 'Rotate this key immediately if exposed. Redact before sending.',
    getMasked: (m) => 'sk-' + '•'.repeat(8),
  },
  {
    id: 'github_pat_classic',
    category: 'api_key',
    label: 'GitHub Personal Access Token',
    severity: 'critical',
    confidence: 0.96,
    pattern: /\bghp_[A-Za-z0-9]{36,}\b/g,
    explanation: 'A GitHub classic personal access token was detected.',
    recommendation: 'Revoke this token immediately if exposed. Redact before sending.',
    getMasked: (m) => 'ghp_' + '•'.repeat(8),
  },
  {
    id: 'github_pat_fine',
    category: 'api_key',
    label: 'GitHub Fine-grained Token',
    severity: 'critical',
    confidence: 0.96,
    pattern: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/g,
    explanation: 'A GitHub fine-grained access token was detected.',
    recommendation: 'Revoke this token immediately if exposed.',
    getMasked: () => 'github_pat_' + '•'.repeat(8),
  },
  {
    id: 'github_oauth',
    category: 'api_key',
    label: 'GitHub OAuth Token',
    severity: 'critical',
    confidence: 0.94,
    pattern: /\bgho_[A-Za-z0-9]{36,}\b/g,
    explanation: 'A GitHub OAuth token was detected.',
    recommendation: 'Revoke this token immediately if exposed.',
    getMasked: () => 'gho_' + '•'.repeat(8),
  },
  {
    id: 'aws_access_key',
    category: 'api_key',
    label: 'AWS Access Key ID',
    severity: 'critical',
    confidence: 0.95,
    pattern: /\b(AKIA|ABIA|ACCA|AROA|AIDA|ASIA)[A-Z0-9]{16}\b/g,
    explanation: 'An AWS access key ID was detected.',
    recommendation: 'Revoke this key in AWS IAM and redact before sending.',
    getMasked: (m) => m.slice(0, 4) + '•'.repeat(12),
  },
  {
    id: 'google_api_key',
    category: 'api_key',
    label: 'Google API Key',
    severity: 'high',
    confidence: 0.85,
    pattern: /\bAIza[A-Za-z0-9\-_]{35}\b/g,
    explanation: 'A Google API key was detected.',
    recommendation: 'Restrict or rotate this key in Google Cloud Console.',
    getMasked: (m) => 'AIza' + '•'.repeat(10),
  },
  {
    id: 'slack_token',
    category: 'api_key',
    label: 'Slack API Token',
    severity: 'high',
    confidence: 0.90,
    pattern: /\bxox[boaprs]-[A-Za-z0-9\-]{8,80}\b/g,
    explanation: 'A Slack API token was detected.',
    recommendation: 'Revoke this token in your Slack workspace settings.',
    getMasked: (m) => m.slice(0, 8) + '•'.repeat(8),
  },
  {
    id: 'stripe_key',
    category: 'api_key',
    label: 'Stripe API Key',
    severity: 'critical',
    confidence: 0.95,
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
    explanation: 'A Stripe API key was detected.',
    recommendation: 'Rotate this key in your Stripe dashboard immediately.',
    getMasked: (m) => m.slice(0, 10) + '•'.repeat(8),
  },
  {
    id: 'sendgrid_key',
    category: 'api_key',
    label: 'SendGrid API Key',
    severity: 'high',
    confidence: 0.93,
    pattern: /\bSG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}\b/g,
    explanation: 'A SendGrid API key was detected.',
    recommendation: 'Rotate this key in your SendGrid account.',
    getMasked: () => 'SG.' + '•'.repeat(8),
  },
  {
    id: 'twilio_key',
    category: 'api_key',
    label: 'Twilio API Key / Auth Token',
    severity: 'high',
    confidence: 0.85,
    pattern: /\bSK[a-f0-9]{32}\b/g,
    explanation: 'A Twilio API key was detected.',
    recommendation: 'Rotate this key in your Twilio console.',
    getMasked: () => 'SK' + '•'.repeat(8),
  },

  // === AUTHORIZATION HEADERS ===
  {
    id: 'auth_bearer',
    category: 'auth_header',
    label: 'Bearer Token (Authorization Header)',
    severity: 'critical',
    confidence: 0.92,
    pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi,
    explanation: 'An HTTP Authorization Bearer header was detected, likely containing an access token.',
    recommendation: 'Redact or rotate this token before sharing.',
    getMasked: (m) => 'Authorization: Bearer ' + '•'.repeat(12),
  },
  {
    id: 'auth_basic',
    category: 'auth_header',
    label: 'Basic Auth Header',
    severity: 'critical',
    confidence: 0.90,
    pattern: /Authorization:\s*Basic\s+[A-Za-z0-9+\/]+=*/gi,
    explanation: 'An HTTP Basic Authorization header was detected, which encodes credentials.',
    recommendation: 'Remove or rotate these credentials immediately.',
    getMasked: () => 'Authorization: Basic ' + '•'.repeat(12),
  },
  {
    id: 'auth_token_header',
    category: 'auth_header',
    label: 'API Token Header',
    severity: 'high',
    confidence: 0.82,
    pattern: /(?:X-API-Key|X-Auth-Token|X-Access-Token|X-Secret-Key):\s*[A-Za-z0-9\-._~+\/]{16,}/gi,
    explanation: 'An API token in an HTTP request header was detected.',
    recommendation: 'Redact this header value before sharing.',
    getMasked: (m) => m.split(':')[0] + ': ' + '•'.repeat(12),
  },

  // === PASSWORDS ===
  {
    id: 'password_assignment',
    category: 'password',
    label: 'Password Assignment',
    severity: 'high',
    confidence: 0.85,
    pattern: /(?:password|passwd|pwd|pass|secret|client_secret|secret_key)\s*[=:]\s*["']?[^\s"'`\r\n]{6,}["']?/gi,
    explanation: 'A password or secret assignment was detected.',
    recommendation: 'Replace the actual value with a placeholder before sharing.',
    getMasked: (m) => {
      const eq = m.search(/[=:]/);
      return m.slice(0, eq + 1) + ' ' + '•'.repeat(8);
    },
  },
  {
    id: 'api_key_assignment',
    category: 'password',
    label: 'API Key Assignment',
    severity: 'high',
    confidence: 0.83,
    pattern: /(?:api_key|apikey|api-key|access_key|secret_access_key)\s*[=:]\s*["']?[A-Za-z0-9\-_./+]{16,}["']?/gi,
    explanation: 'An API key assignment expression was detected.',
    recommendation: 'Redact the key value before sharing.',
    getMasked: (m) => {
      const eq = m.search(/[=:]/);
      return m.slice(0, eq + 1) + ' ' + '•'.repeat(8);
    },
  },
  {
    id: 'token_assignment',
    category: 'access_token',
    label: 'Token Assignment',
    severity: 'high',
    confidence: 0.82,
    pattern: /(?:access_token|refresh_token|auth_token|bearer_token|id_token|session_token)\s*[=:]\s*["']?[A-Za-z0-9\-_.~+\/]{16,}["']?/gi,
    explanation: 'An authentication token assignment was detected.',
    recommendation: 'Redact the token value before sharing.',
    getMasked: (m) => {
      const eq = m.search(/[=:]/);
      return m.slice(0, eq + 1) + ' ' + '•'.repeat(8);
    },
  },

  // === DATABASE CREDENTIALS ===
  {
    id: 'postgres_uri',
    category: 'database_credentials',
    label: 'PostgreSQL Connection String',
    severity: 'critical',
    confidence: 0.92,
    pattern: /postgres(?:ql)?:\/\/[^:\s@]+:[^@\s]+@[^\s"'`]+/gi,
    explanation: 'A PostgreSQL connection URI with embedded credentials was detected.',
    recommendation: 'Remove the credentials from the URI before sharing.',
    getMasked: () => 'postgresql://[USER]:[PASSWORD]@[HOST]/[DB]',
  },
  {
    id: 'mysql_uri',
    category: 'database_credentials',
    label: 'MySQL Connection String',
    severity: 'critical',
    confidence: 0.92,
    pattern: /mysql(?:2)?:\/\/[^:\s@]+:[^@\s]+@[^\s"'`]+/gi,
    explanation: 'A MySQL connection URI with embedded credentials was detected.',
    recommendation: 'Remove the credentials from the URI before sharing.',
    getMasked: () => 'mysql://[USER]:[PASSWORD]@[HOST]/[DB]',
  },
  {
    id: 'mongodb_uri',
    category: 'database_credentials',
    label: 'MongoDB Connection String',
    severity: 'critical',
    confidence: 0.91,
    pattern: /mongodb(?:\+srv)?:\/\/[^:\s@]+:[^@\s]+@[^\s"'`]+/gi,
    explanation: 'A MongoDB connection URI with embedded credentials was detected.',
    recommendation: 'Remove the credentials from the URI before sharing.',
    getMasked: () => 'mongodb://[USER]:[PASSWORD]@[HOST]/[DB]',
  },
  {
    id: 'redis_uri',
    category: 'database_credentials',
    label: 'Redis Connection String',
    severity: 'high',
    confidence: 0.88,
    pattern: /redis(?:s)?:\/\/(?:[^:\s@]+:)?[^@\s]+@[^\s"'`]+/gi,
    explanation: 'A Redis connection URI was detected, potentially with credentials.',
    recommendation: 'Remove any credentials from the URI before sharing.',
    getMasked: () => 'redis://[PASSWORD]@[HOST]/[DB]',
  },

  // === JWT TOKENS ===
  {
    id: 'jwt_token',
    category: 'jwt',
    label: 'JSON Web Token (JWT)',
    severity: 'high',
    confidence: 0.88,
    pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]+=*\b/g,
    explanation: 'A JWT-formatted token was detected. It may contain session credentials or user identity.',
    recommendation: 'Avoid sharing JWT tokens; they may grant access to accounts.',
    getMasked: (m) => 'eyJ' + '•'.repeat(8) + '.' + '•'.repeat(8) + '.' + '•'.repeat(8),
  },

  // === EMAIL ===
  {
    id: 'email_address',
    category: 'email',
    label: 'Email Address',
    severity: 'medium',
    confidence: 0.90,
    pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    explanation: 'An email address was detected.',
    recommendation: 'Consider whether sharing this email address is necessary.',
    getMasked: (m) => maskEmail(m),
  },

  // === PHONE NUMBERS ===
  {
    id: 'phone_intl',
    category: 'phone',
    label: 'Phone Number (International)',
    severity: 'medium',
    confidence: 0.75,
    pattern: /(?<!\d)(?:\+\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}(?!\d)/g,
    explanation: 'A phone number was detected.',
    recommendation: 'Consider whether sharing this phone number is necessary.',
    getMasked: (m) => m.slice(0, 3) + '•'.repeat(4) + m.slice(-2),
  },

  // === SOCIAL SECURITY NUMBER ===
  {
    id: 'ssn_us',
    category: 'ssn',
    label: 'Social Security Number (SSN)',
    severity: 'critical',
    confidence: 0.92,
    pattern: /(?<![\w\d])(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}(?![\w\d])/g,
    explanation: 'A US Social Security Number (SSN) was detected. This is highly sensitive government-issued identity information.',
    recommendation: 'Never share your SSN with AI systems. Remove it before sending.',
    getMasked: (m) => '•••-••-' + m.replace(/[\s\-]/g, '').slice(-4),
  },

  // === CREDIT CARD NUMBERS ===
  {
    id: 'credit_card_visa',
    category: 'credit_card',
    label: 'Credit / Debit Card Number',
    severity: 'critical',
    confidence: 0.93,
    pattern: /(?<!\d)(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2})|35\d{3}|3(?:0[0-5]|[68]\d)\d)[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{3,4}(?!\d)/g,
    explanation: 'A credit or debit card number (Visa, Mastercard, Amex, Discover, or JCB) was detected.',
    recommendation: 'Never share full card numbers with AI systems. Remove it before sending.',
    getMasked: (m) => {
      const digits = m.replace(/[\s\-]/g, '');
      return '•••• •••• •••• ' + digits.slice(-4);
    },
  },

  // === IBAN (Bank Account) ===
  {
    id: 'iban_number',
    category: 'iban',
    label: 'IBAN Bank Account Number',
    severity: 'high',
    confidence: 0.88,
    pattern: /\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){3,6}[A-Z0-9]{1,4}\b/g,
    explanation: 'An IBAN (International Bank Account Number) was detected. This identifies a specific bank account.',
    recommendation: 'Do not share your IBAN with AI systems unless absolutely necessary.',
    getMasked: (m) => m.slice(0, 4) + ' •••• •••• ' + m.replace(/\s/g, '').slice(-4),
  },

  // === DATE OF BIRTH ===
  {
    id: 'date_of_birth',
    category: 'date_of_birth',
    label: 'Date of Birth',
    severity: 'medium',
    confidence: 0.72,
    pattern: /(?:(?:dob|date[\s_]?of[\s_]?birth|born[\s_]?on|birth[\s_]?date)\s*[=:\/]?\s*)(?:\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}|\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2})/gi,
    explanation: 'A date of birth was detected. This is sensitive personal identifying information.',
    recommendation: 'Avoid sharing your date of birth with AI systems.',
    getMasked: () => '••/••/••••',
  },

  // === NATIONAL ID (Aadhaar, PAN, etc.) ===
  {
    id: 'aadhaar_id',
    category: 'national_id',
    label: 'Aadhaar Number (India)',
    severity: 'critical',
    confidence: 0.88,
    pattern: /(?<![\w\d-])[2-9]\d{3}[\s]\d{4}[\s]\d{4}(?![\w\d-])/g,
    explanation: 'An Aadhaar-format 12-digit ID number was detected. This is a sensitive Indian government identity document.',
    recommendation: 'Never share your Aadhaar number with AI systems.',
    getMasked: (m) => '•••• •••• ' + m.replace(/\s/g, '').slice(-4),
  },
  {
    id: 'pan_india',
    category: 'national_id',
    label: 'PAN Card Number (India)',
    severity: 'high',
    confidence: 0.91,
    pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    explanation: 'An Indian PAN (Permanent Account Number) was detected.',
    recommendation: 'Do not share your PAN card number with AI systems.',
    getMasked: (m) => m.slice(0, 2) + '•••••••' + m.slice(-1),
  },
  {
    id: 'passport_generic',
    category: 'national_id',
    label: 'Passport Number',
    severity: 'high',
    confidence: 0.78,
    pattern: /(?:passport[\s_]?(?:no|num|number)?[:\s#]*)[A-Z]{1,2}\d{7,9}\b/gi,
    explanation: 'A passport number was detected. This is sensitive government-issued identity information.',
    recommendation: 'Never share your passport number with AI systems.',
    getMasked: (m) => {
      const parts = m.split(/[:\s#]+/);
      return parts.slice(0, -1).join(' ') + ' ' + '•'.repeat(8);
    },
  },

  // === CRYPTO WALLET ===
  {
    id: 'bitcoin_address',
    category: 'crypto_wallet',
    label: 'Bitcoin Wallet Address',
    severity: 'high',
    confidence: 0.90,
    pattern: /\b(?:bc1[a-z0-9]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g,
    explanation: 'A Bitcoin wallet address was detected.',
    recommendation: 'Be cautious sharing wallet addresses — it exposes your financial identity.',
    getMasked: (m) => m.slice(0, 6) + '•'.repeat(10) + m.slice(-4),
  },
  {
    id: 'ethereum_address',
    category: 'crypto_wallet',
    label: 'Ethereum Wallet Address',
    severity: 'high',
    confidence: 0.93,
    pattern: /\b0x[a-fA-F0-9]{40}\b/g,
    explanation: 'An Ethereum wallet address was detected.',
    recommendation: 'Be cautious sharing wallet addresses — it exposes your financial identity.',
    getMasked: (m) => '0x' + '•'.repeat(8) + m.slice(-6),
  },

  // === SSH KEYS ===
  {
    id: 'ssh_private_key',
    category: 'ssh_key',
    label: 'SSH Private Key',
    severity: 'critical',
    confidence: 0.99,
    pattern: /-----BEGIN (?:OPENSSH|RSA|DSA|EC|ED25519) PRIVATE KEY-----[\s\S]+?-----END (?:OPENSSH|RSA|DSA|EC|ED25519) PRIVATE KEY-----/gi,
    explanation: 'An SSH private key was detected. This grants unauthorized access to servers.',
    recommendation: 'Never share SSH private keys. Remove immediately before sending.',
    getMasked: () => '[SSH PRIVATE KEY BLOCK — REDACTED]',
  },
  {
    id: 'ssh_public_key',
    category: 'ssh_key',
    label: 'SSH Public Key',
    severity: 'medium',
    confidence: 0.85,
    pattern: /\bssh-(?:rsa|ed25519|ecdsa|dss)\s+[A-Za-z0-9+\/=]{40,}\s*(?:\S+@\S+)?\b/g,
    explanation: 'An SSH public key was detected. While less sensitive, it reveals your server access fingerprint.',
    recommendation: 'Consider if sharing your SSH public key in this context is necessary.',
    getMasked: (m) => m.split(' ')[0] + ' ' + '•'.repeat(12) + '...',
  },

  // === IP ADDRESS ===
  {
    id: 'private_ip',
    category: 'ip_address',
    label: 'Private IP Address',
    severity: 'low',
    confidence: 0.82,
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    explanation: 'A private network IP address was detected. This may reveal your internal network topology.',
    recommendation: 'Avoid sharing internal IP addresses to prevent network information leakage.',
    getMasked: (m) => {
      const parts = m.split('.');
      return parts[0] + '.' + parts[1] + '.•••.•••';
    },
  },

  // === PHYSICAL ADDRESS ===
  {
    id: 'physical_address',
    category: 'physical_address',
    label: 'Physical / Street Address',
    severity: 'medium',
    confidence: 0.65,
    pattern: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b\.?(?:\s*,\s*(?:Apt|Suite|Ste|Unit|#)\s*\w+)?(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?(?:\s*,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?/g,
    explanation: 'A physical street address was detected. This is sensitive location information.',
    recommendation: 'Avoid sharing your home or work address with AI systems.',
    getMasked: () => '[ADDRESS — REDACTED]',
  },
];

// ─── Conflict resolution ──────────────────────────────────────────────────────

/**
 * Removes detections that are fully contained within higher-confidence detections
 * and deduplicates overlapping matches.
 */
function resolveConflicts(detections: Detection[]): Detection[] {
  if (detections.length <= 1) return detections;

  // Sort by start position, then by length descending (longer = more specific)
  const sorted = [...detections].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: Detection[] = [];
  for (const det of sorted) {
    const overlaps = result.some(
      (existing) => det.start < existing.end && det.end > existing.start,
    );
    if (!overlaps) {
      result.push(det);
    }
  }
  return result;
}

// ─── High-entropy heuristic ───────────────────────────────────────────────────

function detectHighEntropy(
  text: string,
  threshold: number,
  minLength: number,
): Detection[] {
  const results: Detection[] = [];
  // Look for long alphanumeric tokens that aren't clearly URLs/paths
  const tokenPattern = /[A-Za-z0-9+/=\-_]{20,}/g;
  let m: RegExpExecArray | null;
  while ((m = tokenPattern.exec(text)) !== null) {
    const token = m[0];
    if (token.length < minLength) continue;
    // Skip if looks like a URL component
    if (/^https?/.test(token)) continue;
    const entropy = shannonEntropy(token);
    if (entropy >= threshold) {
      results.push({
        id: makeId(),
        category: 'high_entropy',
        label: 'High-Entropy String',
        severity: 'low',
        confidence: Math.min(0.6, (entropy - threshold) / 2 + 0.3),
        start: m.index,
        end: m.index + token.length,
        maskedExcerpt: maskMiddle(token),
        explanation: `A high-entropy string (entropy ${entropy.toFixed(2)}) was detected. It may be a key or secret.`,
        recommendation: 'Review whether this value should be shared.',
        ruleId: 'high_entropy',
      });
    }
  }
  return results;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export function scanText(text: string, settings: DetectionSettings): ScanResult {
  if (!text || text.trim().length === 0) {
    return {
      detections: [],
      scannedAt: Date.now(),
      inputLength: text.length,
      scanId: makeScanId(),
    };
  }

  if (!settings.enabled) {
    return {
      detections: [],
      scannedAt: Date.now(),
      inputLength: text.length,
      scanId: makeScanId(),
    };
  }

  const allDetections: Detection[] = [];

  for (const rule of RULES) {
    if (!settings.categories[rule.category]) continue;

    // Skip phone for strict-only if sensitivity is balanced? No — phone is always on when enabled
    // Entropy-only heuristic is done separately below

    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      const masked = rule.getMasked ? rule.getMasked(value) : maskValue(value);
      allDetections.push({
        id: makeId(),
        category: rule.category,
        label: rule.label,
        severity: rule.severity,
        confidence: rule.confidence,
        start: match.index,
        end: match.index + value.length,
        maskedExcerpt: masked,
        explanation: rule.explanation,
        recommendation: rule.recommendation,
        ruleId: rule.id,
      });
    }
  }

  // High-entropy heuristic
  if (settings.categories.high_entropy) {
    const entropyDetections = detectHighEntropy(
      text,
      settings.entropyThreshold,
      settings.entropyMinLength,
    );
    allDetections.push(...entropyDetections);
  }

  const resolved = resolveConflicts(allDetections);

  return {
    detections: resolved,
    scannedAt: Date.now(),
    inputLength: text.length,
    scanId: makeScanId(),
  };
}

export type { Detection, ScanResult, DetectionSettings };
