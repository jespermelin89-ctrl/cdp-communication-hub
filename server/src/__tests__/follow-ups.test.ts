/**
 * Tests for follow-up reminder logic (Sprint 1 / v1.1)
 *
 * Pure unit tests — no DB, no network required.
 */

import { describe, it, expect } from 'vitest';

// ── Helper: compute snooze date ────────────────────────────────────────────

function computeSnoozeDate(opt: {
  hours?: number;
  days?: number;
  tomorrow9?: true;
  nextMonday?: true;
}): Date {
  const now = new Date();
  if (opt.hours) {
    return new Date(now.getTime() + opt.hours * 60 * 60 * 1000);
  }
  if (opt.days) {
    return new Date(now.getTime() + opt.days * 24 * 60 * 60 * 1000);
  }
  if (opt.tomorrow9) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (opt.nextMonday) {
    const d = new Date(now);
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return now;
}

describe('Follow-up reminder: computeSnoozeDate', () => {
  it('adds correct hours for hours option', () => {
    const before = Date.now();
    const result = computeSnoozeDate({ hours: 3 });
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 3 * 3600 * 1000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 3 * 3600 * 1000);
  });

  it('adds correct days for days option', () => {
    const before = Date.now();
    const result = computeSnoozeDate({ days: 7 });
    expect(result.getTime()).toBeGreaterThanOrEqual(before + 7 * 86400 * 1000);
  });

  it('tomorrow9 sets time to 9:00 AM next day', () => {
    const result = computeSnoozeDate({ tomorrow9: true });
    const now = new Date();
    expect(result.getDate()).toBe(new Date(now.getTime() + 86400000).getDate());
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it('nextMonday sets time to 9:00 AM on a Monday', () => {
    const result = computeSnoozeDate({ nextMonday: true });
    expect(result.getDay()).toBe(1); // Monday = 1
    expect(result.getHours()).toBe(9);
  });
});

// ── Helper: is reminder due ────────────────────────────────────────────────

function isReminderDue(remindAt: string | Date): boolean {
  return new Date(remindAt) <= new Date();
}

describe('Follow-up reminder: isReminderDue', () => {
  it('returns true for past dates', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isReminderDue(past)).toBe(true);
  });

  it('returns false for future dates', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isReminderDue(future)).toBe(false);
  });

  it('returns true for exactly now (within tolerance)', () => {
    const now = new Date();
    expect(isReminderDue(now)).toBe(true);
  });
});

// ── Reason labels ──────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  awaiting_reply: 'Väntar svar',
  follow_up: 'Uppföljning',
  custom: 'Anpassad',
};

describe('Follow-up reason labels', () => {
  it('maps all known reasons', () => {
    expect(REASON_LABELS['awaiting_reply']).toBe('Väntar svar');
    expect(REASON_LABELS['follow_up']).toBe('Uppföljning');
    expect(REASON_LABELS['custom']).toBe('Anpassad');
  });

  it('returns undefined for unknown reason', () => {
    expect(REASON_LABELS['unknown_reason']).toBeUndefined();
  });
});
