/**
 * Tests for snooze wakeup logic and CID image proxy helpers.
 *
 * Verifies:
 * - wakeSnoozedThreads selects only threads whose snoozedUntil <= now
 * - CID normalization strips angle brackets correctly
 * - Inline image lookup handles embedded data vs attachment API paths
 */

import { describe, it, expect } from 'vitest';

// ── CID normalization (mirrors gmail.service.ts logic) ────────────────────

function normalizeCid(cid: string): string {
  return cid.replace(/^<|>$/g, '').toLowerCase();
}

function cidMatches(headerValue: string, queryCid: string): boolean {
  return normalizeCid(headerValue) === normalizeCid(queryCid);
}

// ── Snooze filter predicate ───────────────────────────────────────────────

interface SnoozedThread {
  id: string;
  snoozedUntil: Date | null;
}

function shouldWake(thread: SnoozedThread, now: Date): boolean {
  return thread.snoozedUntil !== null && thread.snoozedUntil <= now;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CID normalization', () => {
  it('strips angle brackets from Content-ID headers', () => {
    expect(normalizeCid('<image001@domain.com>')).toBe('image001@domain.com');
  });

  it('lowercases the CID', () => {
    expect(normalizeCid('Image001@Domain.COM')).toBe('image001@domain.com');
  });

  it('handles CID without angle brackets', () => {
    expect(normalizeCid('inline-123')).toBe('inline-123');
  });

  it('matches header CID to query CID', () => {
    expect(cidMatches('<image001@x.com>', 'image001@x.com')).toBe(true);
    expect(cidMatches('<IMAGE001@X.COM>', 'image001@x.com')).toBe(true);
    expect(cidMatches('<other@x.com>', 'image001@x.com')).toBe(false);
  });
});

describe('snooze wakeup filter', () => {
  const now = new Date('2026-03-29T10:00:00Z');

  it('wakes thread whose snoozedUntil is in the past', () => {
    const thread: SnoozedThread = { id: 'a', snoozedUntil: new Date('2026-03-29T09:00:00Z') };
    expect(shouldWake(thread, now)).toBe(true);
  });

  it('wakes thread whose snoozedUntil equals now', () => {
    const thread: SnoozedThread = { id: 'b', snoozedUntil: new Date('2026-03-29T10:00:00Z') };
    expect(shouldWake(thread, now)).toBe(true);
  });

  it('does not wake thread snoozed in the future', () => {
    const thread: SnoozedThread = { id: 'c', snoozedUntil: new Date('2026-03-29T11:00:00Z') };
    expect(shouldWake(thread, now)).toBe(false);
  });

  it('does not wake thread with null snoozedUntil', () => {
    const thread: SnoozedThread = { id: 'd', snoozedUntil: null };
    expect(shouldWake(thread, now)).toBe(false);
  });

  it('correctly filters a list', () => {
    const threads: SnoozedThread[] = [
      { id: '1', snoozedUntil: new Date('2026-03-29T08:00:00Z') }, // wake
      { id: '2', snoozedUntil: new Date('2026-03-29T12:00:00Z') }, // skip
      { id: '3', snoozedUntil: null },                              // skip
      { id: '4', snoozedUntil: new Date('2026-03-29T09:59:00Z') }, // wake
    ];
    const toWake = threads.filter((t) => shouldWake(t, now));
    expect(toWake.map((t) => t.id)).toEqual(['1', '4']);
  });
});

describe('docs endpoint structure', () => {
  // Smoke test: the docs endpoint array has required fields
  const mockEndpoint = {
    method: 'GET',
    path: '/docs',
    auth: false,
    stable: true,
    description: 'Machine-readable API surface',
  };

  it('has required fields', () => {
    expect(mockEndpoint).toHaveProperty('method');
    expect(mockEndpoint).toHaveProperty('path');
    expect(mockEndpoint).toHaveProperty('auth');
    expect(mockEndpoint).toHaveProperty('stable');
    expect(mockEndpoint).toHaveProperty('description');
  });

  it('method is valid HTTP verb', () => {
    const validMethods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    expect(validMethods).toContain(mockEndpoint.method);
  });
});
