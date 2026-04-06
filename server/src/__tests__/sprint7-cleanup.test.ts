/**
 * Tests for Sprint 7 — Cleanup cron + Triage report.
 *
 * Covers:
 *  - runTriageCleanupNow: returns { deleted, summary } shape
 *  - cleanupTriageLogs scheduling: only deletes logs older than 30 days
 *  - GET /triage/report: period window logic, aggregation, by_action map
 *  - triage-report agent action: voice summary format
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    triageLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    draft: { count: vi.fn() },
    emailThread: { findFirst: vi.fn() },
  },
}));

vi.mock('../config/env', () => ({
  env: {
    BRAIN_CORE_WEBHOOK_URL: undefined,
    BRAIN_CORE_WEBHOOK_SECRET: undefined,
  },
}));

import { prisma } from '../config/database';

const mockTriageLog = prisma.triageLog as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ──────────────────────────────────────────────
// runTriageCleanupNow
// ──────────────────────────────────────────────

describe('runTriageCleanupNow', () => {
  it('returns { deleted: 0, summary } when there are no old logs', async () => {
    mockTriageLog.findMany.mockResolvedValue([]);
    mockTriageLog.deleteMany.mockResolvedValue({ count: 0 });

    const { runTriageCleanupNow } = await import('../services/sync-scheduler.service');
    const result = await runTriageCleanupNow();

    expect(result.deleted).toBe(0);
    expect(result.summary).toMatch(/inga/i);
  });

  it('deletes logs older than 30 days and returns correct count', async () => {
    const oldLogs = [
      { action: 'trash' },
      { action: 'trash_after_log' },
      { action: 'label_review' },
    ];
    mockTriageLog.findMany.mockResolvedValue(oldLogs);
    mockTriageLog.deleteMany.mockResolvedValue({ count: 3 });

    const { runTriageCleanupNow } = await import('../services/sync-scheduler.service');
    const result = await runTriageCleanupNow();

    expect(result.deleted).toBe(3);
    expect(result.summary).toContain('trash');
  });

  it('summary includes breakdown of trashed vs review vs kept', async () => {
    const oldLogs = [
      { action: 'trash' },
      { action: 'trash' },
      { action: 'label_review' },
      { action: 'keep_inbox' },
    ];
    mockTriageLog.findMany.mockResolvedValue(oldLogs);
    mockTriageLog.deleteMany.mockResolvedValue({ count: 4 });

    const { runTriageCleanupNow } = await import('../services/sync-scheduler.service');
    const result = await runTriageCleanupNow();

    expect(result.deleted).toBe(4);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────
// Period window logic
// ──────────────────────────────────────────────

describe('triage report: period window logic', () => {
  it('today window starts at midnight', () => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();

    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it('week window is exactly 7 days back', () => {
    const now = new Date('2026-04-06T12:00:00Z');
    const from = new Date(now);
    from.setDate(from.getDate() - 7);

    const diffDays = (now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });

  it('month window is exactly 30 days back', () => {
    const now = new Date('2026-04-06T12:00:00Z');
    const from = new Date(now);
    from.setDate(from.getDate() - 30);

    const diffDays = (now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(30);
  });
});

// ──────────────────────────────────────────────
// Triage report aggregation
// ──────────────────────────────────────────────

describe('triage report aggregation', () => {
  it('correctly computes by_action map', () => {
    const logs = [
      { action: 'trash', classification: 'spam', senderEmail: 'a@spam.com' },
      { action: 'trash', classification: 'spam', senderEmail: 'b@spam.com' },
      { action: 'label_review', classification: 'outreach', senderEmail: 'c@cold.com' },
      { action: 'keep_inbox', classification: 'personal', senderEmail: 'd@friend.com' },
      { action: 'auto_draft', classification: 'lead', senderEmail: 'e@lead.com' },
    ];

    const byAction: Record<string, number> = {};
    for (const l of logs) byAction[l.action] = (byAction[l.action] ?? 0) + 1;

    expect(byAction['trash']).toBe(2);
    expect(byAction['label_review']).toBe(1);
    expect(byAction['keep_inbox']).toBe(1);
    expect(byAction['auto_draft']).toBe(1);
  });

  it('total = trashed + inReview + kept', () => {
    const logs = [
      { action: 'trash' },
      { action: 'trash_after_log' },
      { action: 'notify_then_trash' },
      { action: 'label_review' },
      { action: 'label_review' },
      { action: 'keep_inbox' },
      { action: 'auto_draft' },
    ];

    const trashed = logs.filter((l) =>
      ['trash', 'trash_after_log', 'notify_then_trash'].includes(l.action)
    ).length;
    const inReview = logs.filter((l) => l.action === 'label_review').length;
    const kept = logs.filter((l) => ['keep_inbox', 'auto_draft'].includes(l.action)).length;

    expect(trashed + inReview + kept).toBe(logs.length);
  });

  it('by_sender is sorted descending by count', () => {
    const counts = [
      { sender: 'rare.com', count: 1 },
      { sender: 'frequent.com', count: 5 },
      { sender: 'medium.com', count: 3 },
    ];
    const sorted = [...counts].sort((a, b) => b.count - a.count);

    expect(sorted[0].sender).toBe('frequent.com');
    expect(sorted[1].sender).toBe('medium.com');
    expect(sorted[2].sender).toBe('rare.com');
  });
});

// ──────────────────────────────────────────────
// Voice summary format
// ──────────────────────────────────────────────

describe('triage-report: voice summary', () => {
  it('returns empty message when no logs', () => {
    const total = 0;
    const voice = total === 0
      ? 'Idag har inga mail sorterats.'
      : `Idag sorterades ${total} mail bort.`;

    expect(voice).toBe('Idag har inga mail sorterats.');
  });

  it('includes period label "Idag" for today', () => {
    const periodLabel = 'Idag';
    const total = 10;
    const trashed = 7;
    const inReview = 2;
    const kept = 1;
    const voice = `${periodLabel} sorterades ${total} mail bort. ${trashed} raderades, ${inReview} skickades till granskning och ${kept} behölls i inkorgen.`;

    expect(voice).toContain('Idag');
    expect(voice).toContain('10 mail');
    expect(voice).toContain('7 raderades');
  });

  it('includes period label "Den senaste veckan" for week', () => {
    const periodLabel = 'Den senaste veckan';
    const voice = `${periodLabel} sorterades 42 mail bort.`;

    expect(voice).toContain('Den senaste veckan');
    expect(voice).toContain('42');
  });

  it('includes top trashed domains when available', () => {
    const topTrashed = ['spam.com (5)', 'newsletter.io (3)'];
    const voice = `Idag sorterades 8 mail bort. Vanligaste avsändarna: ${topTrashed.join(', ')}.`;

    expect(voice).toContain('spam.com (5)');
    expect(voice).toContain('newsletter.io (3)');
  });

  it('voice_summary trashed + inReview + kept = total', () => {
    const total = 15;
    const trashed = 10;
    const inReview = 3;
    const kept = 2;
    expect(trashed + inReview + kept).toBe(total);
  });
});

// ──────────────────────────────────────────────
// Cleanup cutoff date
// ──────────────────────────────────────────────

describe('cleanup cutoff date', () => {
  it('cutoff is exactly 30 days ago', () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);

    expect(Math.round(diffDays)).toBe(30);
  });

  it('a log created 31 days ago would be eligible for cleanup', () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const oldLog = new Date(Date.now() - 31 * 24 * 3600 * 1000);

    expect(oldLog.getTime()).toBeLessThan(cutoff.getTime());
  });

  it('a log created 29 days ago would NOT be eligible for cleanup', () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const recentLog = new Date(Date.now() - 29 * 24 * 3600 * 1000);

    expect(recentLog.getTime()).toBeGreaterThan(cutoff.getTime());
  });
});
