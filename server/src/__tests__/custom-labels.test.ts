/**
 * Tests for custom label management logic
 *
 * Pure unit tests — no DB, no network.
 * Validates label creation rules, color validation, and
 * position normalisation used in the /labels routes.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers mirroring labels.ts logic
// ──────────────────────────────────────────────

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const MAX_LABEL_NAME = 32;
const MAX_LABELS_PER_USER = 100;

function validateLabelName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== 'string' || !name.trim()) return { valid: false, error: 'Name is required' };
  if (name.trim().length > MAX_LABEL_NAME) {
    return { valid: false, error: `Name must be ${MAX_LABEL_NAME} characters or fewer` };
  }
  return { valid: true };
}

function validateColor(color: unknown): { valid: boolean; error?: string } {
  if (typeof color !== 'string') return { valid: false, error: 'Color must be a string' };
  if (!HEX_COLOR_RE.test(color)) return { valid: false, error: 'Color must be a valid hex code (#RGB or #RRGGBB)' };
  return { valid: true };
}

function reorderPositions(labels: Array<{ id: string; position: number }>): Array<{ id: string; position: number }> {
  return labels
    .sort((a, b) => a.position - b.position)
    .map((l, i) => ({ ...l, position: i }));
}

function wouldExceedLimit(existingCount: number): boolean {
  return existingCount >= MAX_LABELS_PER_USER;
}

// ──────────────────────────────────────────────
// validateLabelName
// ──────────────────────────────────────────────

describe('validateLabelName', () => {
  it('accepts a valid short name', () => {
    expect(validateLabelName('Work').valid).toBe(true);
  });

  it('accepts a name exactly at the limit', () => {
    const atLimit = 'a'.repeat(MAX_LABEL_NAME);
    expect(validateLabelName(atLimit).valid).toBe(true);
  });

  it('rejects a name one character over the limit', () => {
    const tooLong = 'a'.repeat(MAX_LABEL_NAME + 1);
    expect(validateLabelName(tooLong).valid).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateLabelName('').valid).toBe(false);
  });

  it('rejects a whitespace-only string', () => {
    expect(validateLabelName('   ').valid).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(validateLabelName(null).valid).toBe(false);
    expect(validateLabelName(42).valid).toBe(false);
    expect(validateLabelName(undefined).valid).toBe(false);
  });
});

// ──────────────────────────────────────────────
// validateColor
// ──────────────────────────────────────────────

describe('validateColor', () => {
  it('accepts 6-digit hex', () => {
    expect(validateColor('#6B7280').valid).toBe(true);
    expect(validateColor('#FFFFFF').valid).toBe(true);
    expect(validateColor('#000000').valid).toBe(true);
  });

  it('accepts 3-digit hex', () => {
    expect(validateColor('#FFF').valid).toBe(true);
    expect(validateColor('#abc').valid).toBe(true);
  });

  it('rejects hex without #', () => {
    expect(validateColor('6B7280').valid).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(validateColor('#GGGGGG').valid).toBe(false);
  });

  it('rejects rgb() format', () => {
    expect(validateColor('rgb(0,0,0)').valid).toBe(false);
  });

  it('rejects non-string', () => {
    expect(validateColor(null).valid).toBe(false);
    expect(validateColor(12345).valid).toBe(false);
  });
});

// ──────────────────────────────────────────────
// reorderPositions
// ──────────────────────────────────────────────

describe('reorderPositions', () => {
  it('assigns sequential positions starting from 0', () => {
    const labels = [
      { id: 'a', position: 5 },
      { id: 'b', position: 2 },
      { id: 'c', position: 8 },
    ];
    const result = reorderPositions(labels);
    expect(result.map((l) => l.position)).toEqual([0, 1, 2]);
  });

  it('preserves relative order', () => {
    const labels = [
      { id: 'a', position: 10 },
      { id: 'b', position: 3 },
      { id: 'c', position: 7 },
    ];
    const result = reorderPositions(labels);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('c');
    expect(result[2].id).toBe('a');
  });

  it('handles a single label', () => {
    const result = reorderPositions([{ id: 'only', position: 99 }]);
    expect(result).toEqual([{ id: 'only', position: 0 }]);
  });

  it('handles empty array', () => {
    expect(reorderPositions([])).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// wouldExceedLimit
// ──────────────────────────────────────────────

describe('wouldExceedLimit', () => {
  it('returns false when under limit', () => {
    expect(wouldExceedLimit(MAX_LABELS_PER_USER - 1)).toBe(false);
  });

  it('returns true at the limit', () => {
    expect(wouldExceedLimit(MAX_LABELS_PER_USER)).toBe(true);
  });

  it('returns true above the limit', () => {
    expect(wouldExceedLimit(MAX_LABELS_PER_USER + 10)).toBe(true);
  });

  it('returns false at zero', () => {
    expect(wouldExceedLimit(0)).toBe(false);
  });
});
