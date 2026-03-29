/**
 * Tests for thread label logic
 *
 * Pure unit tests — no DB, no network. Tests label merge and
 * system-label exclusion logic used in PATCH /threads/:id.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// System label constants (mirror threads.ts)
// ──────────────────────────────────────────────

const SYSTEM_LABELS = new Set(['INBOX', 'UNREAD', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT']);

function isSystemLabel(label: string): boolean {
  return SYSTEM_LABELS.has(label.toUpperCase());
}

function mergeLabels(existingLabels: string[], customLabels: string[]): string[] {
  const system = existingLabels.filter((l) => isSystemLabel(l));
  const unique = new Set([...system, ...customLabels.filter(l => !isSystemLabel(l))]);
  return Array.from(unique);
}

function extractCustomLabels(labels: string[]): string[] {
  return labels.filter((l) => !isSystemLabel(l));
}

// ──────────────────────────────────────────────
// isSystemLabel
// ──────────────────────────────────────────────

describe('isSystemLabel', () => {
  it('recognises all Gmail system labels', () => {
    for (const label of ['INBOX', 'UNREAD', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT']) {
      expect(isSystemLabel(label)).toBe(true);
    }
  });

  it('returns false for custom labels', () => {
    expect(isSystemLabel('follow-up')).toBe(false);
    expect(isSystemLabel('VIP')).toBe(false);
    expect(isSystemLabel('project-alpha')).toBe(false);
  });
});

// ──────────────────────────────────────────────
// extractCustomLabels
// ──────────────────────────────────────────────

describe('extractCustomLabels', () => {
  it('returns only non-system labels', () => {
    const labels = ['INBOX', 'UNREAD', 'follow-up', 'VIP'];
    expect(extractCustomLabels(labels)).toEqual(['follow-up', 'VIP']);
  });

  it('returns empty array when all labels are system labels', () => {
    expect(extractCustomLabels(['INBOX', 'STARRED'])).toEqual([]);
  });

  it('returns all labels when none are system labels', () => {
    const custom = ['alpha', 'beta', 'gamma'];
    expect(extractCustomLabels(custom)).toEqual(custom);
  });

  it('handles empty input', () => {
    expect(extractCustomLabels([])).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// mergeLabels
// ──────────────────────────────────────────────

describe('mergeLabels', () => {
  it('preserves system labels from existing set', () => {
    const result = mergeLabels(['INBOX', 'UNREAD'], ['follow-up']);
    expect(result).toContain('INBOX');
    expect(result).toContain('UNREAD');
    expect(result).toContain('follow-up');
  });

  it('does not duplicate labels', () => {
    const result = mergeLabels(['INBOX', 'follow-up'], ['follow-up', 'new-tag']);
    const followUpCount = result.filter(l => l === 'follow-up').length;
    expect(followUpCount).toBe(1);
  });

  it('strips system labels from customLabels input (prevents injection)', () => {
    // A client that tries to set SPAM via customLabels should be ignored
    const result = mergeLabels(['INBOX'], ['SPAM', 'valid-tag']);
    expect(result).not.toContain('SPAM');
    expect(result).toContain('valid-tag');
  });

  it('removes all custom labels when customLabels is empty', () => {
    const result = mergeLabels(['INBOX', 'STARRED', 'old-tag'], []);
    expect(result).toContain('INBOX');
    expect(result).toContain('STARRED');
    expect(result).not.toContain('old-tag');
  });

  it('handles thread with no system labels', () => {
    const result = mergeLabels([], ['tag1', 'tag2']);
    expect(result).toEqual(expect.arrayContaining(['tag1', 'tag2']));
  });
});

// ──────────────────────────────────────────────
// Label validation
// ──────────────────────────────────────────────

describe('label validation', () => {
  const MAX_LABEL_LENGTH = 32;
  const MAX_LABELS_PER_THREAD = 20;

  function validateLabels(labels: unknown): { valid: boolean; error?: string } {
    if (!Array.isArray(labels)) return { valid: false, error: 'Labels must be an array' };
    if (labels.length > MAX_LABELS_PER_THREAD) {
      return { valid: false, error: `Max ${MAX_LABELS_PER_THREAD} labels per thread` };
    }
    for (const l of labels) {
      if (typeof l !== 'string') return { valid: false, error: 'Each label must be a string' };
      if (l.length > MAX_LABEL_LENGTH) return { valid: false, error: `Label too long (max ${MAX_LABEL_LENGTH} chars)` };
    }
    return { valid: true };
  }

  it('accepts a valid labels array', () => {
    expect(validateLabels(['tag1', 'tag2'])).toEqual({ valid: true });
  });

  it('rejects non-array input', () => {
    expect(validateLabels('tag1')).toMatchObject({ valid: false });
    expect(validateLabels(null)).toMatchObject({ valid: false });
  });

  it('rejects array exceeding max count', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(validateLabels(tooMany)).toMatchObject({ valid: false });
  });

  it('rejects labels exceeding max length', () => {
    const longLabel = 'a'.repeat(33);
    expect(validateLabels([longLabel])).toMatchObject({ valid: false });
  });

  it('rejects non-string elements', () => {
    expect(validateLabels([123, 'valid'])).toMatchObject({ valid: false });
  });
});
