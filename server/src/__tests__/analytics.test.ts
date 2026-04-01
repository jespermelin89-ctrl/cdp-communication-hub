/**
 * Tests for analytics helper logic (Sprint 4 / v1.1)
 *
 * Pure unit tests — no DB, no network required.
 */

import { describe, it, expect } from 'vitest';

// ── Days-to-date-range ─────────────────────────────────────────────────────

function daysToDateRange(days: number): { since: Date; until: Date } {
  const until = new Date();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { since, until };
}

describe('daysToDateRange', () => {
  it('produces a range of correct width', () => {
    const { since, until } = daysToDateRange(30);
    const diffMs = until.getTime() - since.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it('since is before until', () => {
    const { since, until } = daysToDateRange(7);
    expect(since.getTime()).toBeLessThan(until.getTime());
  });
});

// ── Group by day ──────────────────────────────────────────────────────────

function groupByDay(dates: Date[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

describe('groupByDay', () => {
  it('counts correctly for same-day dates', () => {
    const dates = [new Date('2026-01-15T08:00:00Z'), new Date('2026-01-15T12:00:00Z')];
    const result = groupByDay(dates);
    expect(result['2026-01-15']).toBe(2);
  });

  it('separates different days', () => {
    const dates = [new Date('2026-01-15T08:00:00Z'), new Date('2026-01-16T08:00:00Z')];
    const result = groupByDay(dates);
    expect(result['2026-01-15']).toBe(1);
    expect(result['2026-01-16']).toBe(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupByDay([])).toEqual({});
  });
});

// ── Classification distribution ───────────────────────────────────────────

function classificationDistribution(
  threads: { classification: string | null }[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of threads) {
    const key = t.classification ?? 'unknown';
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

describe('classificationDistribution', () => {
  it('counts each classification', () => {
    const threads = [
      { classification: 'lead' },
      { classification: 'lead' },
      { classification: 'spam' },
      { classification: null },
    ];
    const result = classificationDistribution(threads);
    expect(result['lead']).toBe(2);
    expect(result['spam']).toBe(1);
    expect(result['unknown']).toBe(1);
  });

  it('returns empty object for empty input', () => {
    expect(classificationDistribution([])).toEqual({});
  });
});

// ── Average response time ─────────────────────────────────────────────────

function avgResponseTimeHours(threads: { responseTimeHours: number | null }[]): number | null {
  const valid = threads.map((t) => t.responseTimeHours).filter((h): h is number => h !== null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

describe('avgResponseTimeHours', () => {
  it('computes average correctly', () => {
    const threads = [
      { responseTimeHours: 2 },
      { responseTimeHours: 4 },
      { responseTimeHours: null },
    ];
    expect(avgResponseTimeHours(threads)).toBeCloseTo(3, 5);
  });

  it('returns null when no valid values', () => {
    expect(avgResponseTimeHours([{ responseTimeHours: null }])).toBeNull();
    expect(avgResponseTimeHours([])).toBeNull();
  });
});
