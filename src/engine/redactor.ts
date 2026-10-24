/**
 * PromptGuard Redaction Engine
 * Replaces detected sensitive portions with safe placeholders.
 * Temporary mappings stay in memory only — never persisted.
 */

import type { Detection, RedactionResult } from '../types';

const CATEGORY_PLACEHOLDER: Record<string, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  api_key: 'API_KEY',
  password: 'PASSWORD',
  access_token: 'ACCESS_TOKEN',
  auth_header: 'AUTH_HEADER',
  database_credentials: 'DATABASE_CREDENTIALS',
  private_key: 'PRIVATE_KEY',
  jwt: 'JWT_TOKEN',
  high_entropy: 'HIGH_ENTROPY_VALUE',
};

function categoryPlaceholder(category: string): string {
  return CATEGORY_PLACEHOLDER[category] ?? 'SENSITIVE_DATA';
}

/**
 * Redact a specific set of detections from the original text.
 * Uses offset-safe reconstruction — processes matches from right to left
 * so earlier replacements do not shift the offsets of subsequent ones.
 *
 * @param text Original prompt text (not mutated).
 * @param detections All available detections from the scan.
 * @param selectedIds IDs of detections to redact. If null, redacts all.
 */
export function redactText(
  text: string,
  detections: Detection[],
  selectedIds: string[] | null,
): RedactionResult {
  const toRedact = selectedIds === null
    ? detections
    : detections.filter((d) => selectedIds.includes(d.id));

  if (toRedact.length === 0) {
    return {
      sanitizedText: text,
      redactedIds: [],
      placeholderMap: new Map(),
    };
  }

  // Sort by start position descending so we replace from right to left
  const sorted = [...toRedact].sort((a, b) => b.start - a.start);

  // Track category counters for unique placeholder numbering
  const categoryCounters: Record<string, number> = {};
  const placeholderMap = new Map<string, { category: string; placeholder: string }>();
  const idToPlaceholder: Map<string, string> = new Map();

  // Assign placeholders (in left-to-right order so numbering is logical)
  const leftToRight = [...toRedact].sort((a, b) => a.start - b.start);
  for (const det of leftToRight) {
    const base = categoryPlaceholder(det.category);
    categoryCounters[base] = (categoryCounters[base] ?? 0) + 1;
    const placeholder = `[REDACTED_${base}_${categoryCounters[base]}]`;
    idToPlaceholder.set(det.id, placeholder);
    placeholderMap.set(placeholder, { category: det.category, placeholder });
  }

  // Apply replacements right-to-left to preserve offsets
  let result = text;
  for (const det of sorted) {
    const placeholder = idToPlaceholder.get(det.id)!;
    result = result.slice(0, det.start) + placeholder + result.slice(det.end);
  }

  return {
    sanitizedText: result,
    redactedIds: toRedact.map((d) => d.id),
    placeholderMap,
  };
}

/**
 * Convenience wrapper — redact all detections.
 */
export function redactAll(text: string, detections: Detection[]): RedactionResult {
  return redactText(text, detections, null);
}

/**
 * Convenience wrapper — redact selected detections by ID.
 */
export function redactSelected(
  text: string,
  detections: Detection[],
  selectedIds: string[],
): RedactionResult {
  return redactText(text, detections, selectedIds);
}
