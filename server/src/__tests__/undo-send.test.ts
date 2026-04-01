/**
 * Tests for undo-send / delayed-send logic
 *
 * Pure unit tests — no DB, no network.
 * Validates delay handling, cancellability window, and
 * delayed-send status rules used in the drafts routes.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers mirroring drafts.ts logic
// ──────────────────────────────────────────────

const MIN_DELAY = 0;
const MAX_DELAY = 30; // seconds

function clampDelay(delay: unknown): number {
  if (delay === null || delay === undefined || typeof delay === 'object') return 5; // default
  const n = Number(delay);
  if (!Number.isFinite(n) || isNaN(n)) return 5; // default
  return Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.round(n)));
}

function computeScheduledAt(nowMs: number, delaySeconds: number): Date {
  return new Date(nowMs + delaySeconds * 1000);
}

function isCancellable(scheduledAt: Date, nowMs: number): boolean {
  return scheduledAt.getTime() > nowMs;
}

function canQueueDelayedSend(currentStatus: string): boolean {
  return currentStatus === 'pending' || currentStatus === 'approved';
}

function canCancelDelayedSend(currentStatus: string, scheduledAt: Date | null, nowMs: number): boolean {
  if (currentStatus !== 'approved') return false;
  if (!scheduledAt) return false;
  return isCancellable(scheduledAt, nowMs);
}

function shouldSendImmediately(delaySeconds: number): boolean {
  return delaySeconds <= 0;
}

// ──────────────────────────────────────────────
// clampDelay
// ──────────────────────────────────────────────

describe('clampDelay', () => {
  it('returns value within 0-30 unchanged', () => {
    expect(clampDelay(10)).toBe(10);
    expect(clampDelay(0)).toBe(0);
    expect(clampDelay(30)).toBe(30);
  });

  it('clamps values below 0 to 0', () => {
    expect(clampDelay(-5)).toBe(0);
  });

  it('clamps values above 30 to 30', () => {
    expect(clampDelay(60)).toBe(30);
    expect(clampDelay(1000)).toBe(30);
  });

  it('rounds fractional seconds', () => {
    expect(clampDelay(5.7)).toBe(6);
    expect(clampDelay(5.2)).toBe(5);
  });

  it('returns default 5 for non-numeric input', () => {
    expect(clampDelay('abc')).toBe(5);
    expect(clampDelay(null)).toBe(5);
    expect(clampDelay(undefined)).toBe(5);
    expect(clampDelay(Infinity)).toBe(5);
  });
});

// ──────────────────────────────────────────────
// computeScheduledAt
// ──────────────────────────────────────────────

describe('computeScheduledAt', () => {
  it('adds correct milliseconds to now', () => {
    const now = 1_700_000_000_000;
    const result = computeScheduledAt(now, 10);
    expect(result.getTime()).toBe(now + 10_000);
  });

  it('returns now when delay is 0', () => {
    const now = 1_700_000_000_000;
    const result = computeScheduledAt(now, 0);
    expect(result.getTime()).toBe(now);
  });

  it('handles max delay of 30 seconds', () => {
    const now = 1_700_000_000_000;
    const result = computeScheduledAt(now, 30);
    expect(result.getTime()).toBe(now + 30_000);
  });
});

// ──────────────────────────────────────────────
// isCancellable
// ──────────────────────────────────────────────

describe('isCancellable', () => {
  it('returns true when scheduledAt is in the future', () => {
    const now = 1_700_000_000_000;
    const future = new Date(now + 5_000);
    expect(isCancellable(future, now)).toBe(true);
  });

  it('returns false when scheduledAt is in the past', () => {
    const now = 1_700_000_000_000;
    const past = new Date(now - 1);
    expect(isCancellable(past, now)).toBe(false);
  });

  it('returns false when scheduledAt equals now', () => {
    const now = 1_700_000_000_000;
    const exact = new Date(now);
    expect(isCancellable(exact, now)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// canQueueDelayedSend
// ──────────────────────────────────────────────

describe('canQueueDelayedSend', () => {
  it('allows delayed send from pending and approved', () => {
    expect(canQueueDelayedSend('pending')).toBe(true);
    expect(canQueueDelayedSend('approved')).toBe(true);
  });

  it('disallows transition from other statuses', () => {
    for (const s of ['draft', 'sending', 'sent', 'failed', 'pending_approval', 'discarded']) {
      expect(canQueueDelayedSend(s)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// canCancelDelayedSend
// ──────────────────────────────────────────────

describe('canCancelDelayedSend', () => {
  const now = 1_700_000_000_000;
  const future = new Date(now + 5_000);
  const past = new Date(now - 1);

  it('allows cancellation when status is approved and scheduledAt is future', () => {
    expect(canCancelDelayedSend('approved', future, now)).toBe(true);
  });

  it('disallows cancellation when scheduledAt is past', () => {
    expect(canCancelDelayedSend('approved', past, now)).toBe(false);
  });

  it('disallows cancellation when status is not approved', () => {
    expect(canCancelDelayedSend('pending', future, now)).toBe(false);
    expect(canCancelDelayedSend('sent', future, now)).toBe(false);
  });

  it('disallows cancellation when scheduledAt is null', () => {
    expect(canCancelDelayedSend('approved', null, now)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// shouldSendImmediately
// ──────────────────────────────────────────────

describe('shouldSendImmediately', () => {
  it('treats 0 seconds as immediate send', () => {
    expect(shouldSendImmediately(0)).toBe(true);
  });

  it('treats negative values as immediate send', () => {
    expect(shouldSendImmediately(-1)).toBe(true);
  });

  it('does not treat positive delays as immediate send', () => {
    expect(shouldSendImmediately(1)).toBe(false);
  });
});
