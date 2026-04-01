/**
 * Snooze — Sprint 8 tests
 *
 * Tests for snooze/unsnooze logic, auto-unsnooze predicate, and snoozed filter.
 * Extends the existing snooze-logic tests.
 */

import { describe, it, expect } from 'vitest';

// ── Snooze predicate ──────────────────────────────────────────────────────────

interface Thread {
  id: string;
  snoozedUntil: Date | null;
  subject: string;
}

function shouldWake(thread: Thread, now: Date): boolean {
  return thread.snoozedUntil !== null && thread.snoozedUntil <= now;
}

function isSnoozed(thread: Thread, now: Date): boolean {
  return thread.snoozedUntil !== null && thread.snoozedUntil > now;
}

// ── SnoozePicker date helpers (mirrors SnoozePicker.tsx) ─────────────────────

function computeLaterToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(d.getHours() + 3);
  return d;
}

function computeTomorrow8(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

function computeNextMonday8(now: Date = new Date()): Date {
  const d = new Date(now);
  const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(8, 0, 0, 0);
  return d;
}

function computeNextWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Snooze logic', () => {
  const now = new Date('2026-04-01T10:00:00.000Z');

  it('shouldWake returns true for overdue snooze', () => {
    const t: Thread = { id: '1', snoozedUntil: new Date('2026-04-01T09:00:00.000Z'), subject: 'Old' };
    expect(shouldWake(t, now)).toBe(true);
  });

  it('shouldWake returns false for future snooze', () => {
    const t: Thread = { id: '2', snoozedUntil: new Date('2026-04-02T08:00:00.000Z'), subject: 'Future' };
    expect(shouldWake(t, now)).toBe(false);
  });

  it('shouldWake returns false for null snoozedUntil', () => {
    const t: Thread = { id: '3', snoozedUntil: null, subject: 'Normal' };
    expect(shouldWake(t, now)).toBe(false);
  });

  it('isSnoozed returns true for thread snoozed until future', () => {
    const t: Thread = { id: '4', snoozedUntil: new Date('2026-04-02T08:00:00.000Z'), subject: 'Snoozed' };
    expect(isSnoozed(t, now)).toBe(true);
  });

  it('isSnoozed returns false for past snooze (already woken)', () => {
    const t: Thread = { id: '5', snoozedUntil: new Date('2026-03-31T08:00:00.000Z'), subject: 'Past' };
    expect(isSnoozed(t, now)).toBe(false);
  });

  it('auto-unsnooze filter selects only overdue threads', () => {
    const threads: Thread[] = [
      { id: 'a', snoozedUntil: new Date('2026-03-31T10:00:00.000Z'), subject: 'Overdue' },
      { id: 'b', snoozedUntil: new Date('2026-04-02T10:00:00.000Z'), subject: 'Future' },
      { id: 'c', snoozedUntil: null, subject: 'Normal' },
    ];
    const toWake = threads.filter((t) => shouldWake(t, now));
    expect(toWake).toHaveLength(1);
    expect(toWake[0].id).toBe('a');
  });

  it('computeLaterToday adds 3 hours', () => {
    const base = new Date('2026-04-01T10:00:00.000Z');
    const result = computeLaterToday(base);
    expect(result.getUTCHours()).toBe(13);
  });

  it('computeTomorrow8 sets next day at 08:00 local', () => {
    const base = new Date('2026-04-01T10:00:00.000Z');
    const result = computeTomorrow8(base);
    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
    // Should be April 2nd
    expect(result.getDate()).toBe(2);
  });

  it('computeNextMonday8 finds the next Monday', () => {
    // 2026-04-01 is a Wednesday (day 3)
    const base = new Date('2026-04-01T10:00:00.000Z');
    const result = computeNextMonday8(base);
    expect(result.getDay()).toBe(1); // Monday = 1
    expect(result.getHours()).toBe(8);
  });

  it('computeNextWeek adds 7 days', () => {
    const base = new Date('2026-04-01T10:00:00.000Z');
    const result = computeNextWeek(base);
    const diff = result.getTime() - base.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
