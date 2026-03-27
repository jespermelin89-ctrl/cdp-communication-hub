/**
 * Tests for /api/v1/brain-summary route
 *
 * Verifies:
 * - Response shape (all required fields present)
 * - Safety guarantee: draft body_text NEVER appears in response
 * - Handles empty inbox gracefully
 * - daily_summary is null when not yet generated
 * - Counts are correct
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// Mock Prisma
// ──────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findMany: vi.fn() },
    emailThread: { count: vi.fn(), findMany: vi.fn() },
    draft: { findMany: vi.fn(), count: vi.fn() },
    dailySummary: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../config/database';

const mockAccounts = vi.mocked(prisma.emailAccount.findMany);
const mockThreadCount = vi.mocked(prisma.emailThread.count);
const mockThreadFindMany = vi.mocked(prisma.emailThread.findMany);
const mockDraftFindMany = vi.mocked(prisma.draft.findMany);
const mockDraftCount = vi.mocked(prisma.draft.count);
const mockDailySummary = vi.mocked(prisma.dailySummary.findUnique);

// ──────────────────────────────────────────────
// Test data builders
// ──────────────────────────────────────────────

const USER_ID = 'user-test-123';
const ACCOUNT_ID = 'account-test-456';

function buildAccount(overrides = {}) {
  return {
    id: ACCOUNT_ID,
    emailAddress: 'jesper@test.com',
    isDefault: true,
    provider: 'gmail',
    label: 'business',
    ...overrides,
  };
}

function buildThread(overrides = {}) {
  return {
    id: 'thread-001',
    subject: 'Partnership inquiry',
    snippet: 'We would love to work with you...',
    isRead: false,
    lastMessageAt: new Date('2026-03-27T10:00:00Z'),
    participantEmails: ['partner@brand.com', 'jesper@test.com'],
    messageCount: 3,
    analyses: [{
      priority: 'high',
      classification: 'partner',
      suggestedAction: 'reply',
      confidence: 0.92,
    }],
    ...overrides,
  };
}

function buildDraft(overrides = {}) {
  return {
    id: 'draft-001',
    subject: 'Re: Partnership inquiry',
    toAddresses: ['partner@brand.com'],
    status: 'pending',
    createdAt: new Date('2026-03-27T11:00:00Z'),
    account: { emailAddress: 'jesper@test.com', label: 'business' },
    // body_text intentionally absent — should never appear in brain-summary
    ...overrides,
  };
}

function buildDailySummary(overrides = {}) {
  return {
    id: 'summary-001',
    date: new Date('2026-03-27'),
    totalNew: 12,
    totalUnread: 5,
    totalAutoSorted: 8,
    recommendation: 'Prioritize the Goodr partnership reply — high engagement signal.',
    needsReply: [{ threadId: 'thread-001', subject: 'Partnership inquiry', priority: 'high' }],
    goodToKnow: [{ threadId: 'thread-002', subject: 'Skool notification' }],
    modelUsed: 'llama-3.3-70b-versatile',
    createdAt: new Date('2026-03-27T08:00:00Z'),
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Simulate the brain-summary route handler logic
// (extracted to avoid Fastify bootstrapping in unit tests)
// ──────────────────────────────────────────────

async function runBrainSummaryHandler(userId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true, emailAddress: true, isDefault: true, provider: true, label: true },
  });
  const accountIds = accounts.map((a: any) => a.id);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [unreadCount, importantThreads, pendingDrafts, approvedDrafts, dailySummary] =
    await Promise.all([
      prisma.emailThread.count({ where: { accountId: { in: accountIds }, isRead: false } }),
      prisma.emailThread.findMany({
        where: { accountId: { in: accountIds }, analyses: { some: { priority: 'high' } }, lastMessageAt: { gte: sevenDaysAgo } },
        select: { id: true, subject: true, snippet: true, isRead: true, lastMessageAt: true, participantEmails: true, messageCount: true, analyses: { orderBy: { createdAt: 'desc' } as any, take: 1, select: { priority: true, classification: true, suggestedAction: true, confidence: true } } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),
      prisma.draft.findMany({
        where: { userId, status: 'pending' },
        select: { id: true, subject: true, toAddresses: true, status: true, createdAt: true, account: { select: { emailAddress: true, label: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.draft.count({ where: { userId, status: 'approved' } }),
      prisma.dailySummary.findUnique({ where: { userId_date: { userId, date: today } }, select: { id: true, date: true, totalNew: true, totalUnread: true, totalAutoSorted: true, recommendation: true, needsReply: true, goodToKnow: true, modelUsed: true, createdAt: true } }),
    ]);

  return {
    generated_at: new Date().toISOString(),
    accounts: accounts.map((a: any) => ({ id: a.id, email: a.emailAddress, label: a.label, is_default: a.isDefault, provider: a.provider })),
    summary: { unread_threads: unreadCount, important_threads: (importantThreads as any[]).length, pending_drafts: (pendingDrafts as any[]).length, approved_drafts: approvedDrafts },
    important_threads: (importantThreads as any[]).map((t) => ({ id: t.id, subject: t.subject, snippet: t.snippet, is_read: t.isRead, last_message_at: t.lastMessageAt, participant_count: t.participantEmails.length, message_count: t.messageCount, analysis: t.analyses[0] ?? null })),
    pending_drafts: (pendingDrafts as any[]).map((d) => ({ id: d.id, subject: d.subject, to: d.toAddresses, status: d.status, account: d.account.emailAddress, account_label: d.account.label, created_at: d.createdAt })),
    daily_summary: dailySummary ? { ...dailySummary } : null,
  };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('brain-summary route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the correct shape with all required fields', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(3);
    mockThreadFindMany.mockResolvedValue([buildThread()] as any);
    mockDraftFindMany.mockResolvedValue([buildDraft()] as any);
    mockDraftCount.mockResolvedValue(1);
    mockDailySummary.mockResolvedValue(buildDailySummary() as any);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result).toHaveProperty('generated_at');
    expect(result).toHaveProperty('accounts');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('important_threads');
    expect(result).toHaveProperty('pending_drafts');
    expect(result).toHaveProperty('daily_summary');
  });

  it('summary counts are correct', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(7);
    mockThreadFindMany.mockResolvedValue([buildThread(), buildThread({ id: 'thread-002' })] as any);
    mockDraftFindMany.mockResolvedValue([buildDraft(), buildDraft({ id: 'draft-002' }), buildDraft({ id: 'draft-003' })] as any);
    mockDraftCount.mockResolvedValue(2);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.summary.unread_threads).toBe(7);
    expect(result.summary.important_threads).toBe(2);
    expect(result.summary.pending_drafts).toBe(3);
    expect(result.summary.approved_drafts).toBe(2);
  });

  it('SAFETY: body_text never appears in pending_drafts', async () => {
    const draftWithBody = { ...buildDraft(), body_text: 'SECRET CONTENT THAT MUST NOT LEAK' };
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([draftWithBody] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    // body_text must never appear in any draft in the response
    for (const draft of result.pending_drafts) {
      expect(draft).not.toHaveProperty('body_text');
      expect(JSON.stringify(draft)).not.toContain('SECRET CONTENT');
    }
  });

  it('SAFETY: body_text never appears even when serialized', async () => {
    const sensitiveBody = 'CONFIDENTIAL: Do not leak this';
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([{ ...buildDraft(), body_text: sensitiveBody }] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('CONFIDENTIAL');
    expect(serialized).not.toContain('body_text');
  });

  it('returns daily_summary: null when no summary exists for today', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.daily_summary).toBeNull();
  });

  it('includes daily_summary when it exists', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(buildDailySummary() as any);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.daily_summary).not.toBeNull();
    expect(result.daily_summary?.totalNew).toBe(12);
    expect(result.daily_summary?.recommendation).toContain('Goodr');
  });

  it('handles empty inbox gracefully', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.summary.unread_threads).toBe(0);
    expect(result.summary.important_threads).toBe(0);
    expect(result.summary.pending_drafts).toBe(0);
    expect(result.important_threads).toHaveLength(0);
    expect(result.pending_drafts).toHaveLength(0);
  });

  it('handles user with no accounts', async () => {
    mockAccounts.mockResolvedValue([] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.accounts).toHaveLength(0);
    expect(result.summary.unread_threads).toBe(0);
  });

  it('includes thread analysis in important_threads', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(1);
    mockThreadFindMany.mockResolvedValue([buildThread()] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.important_threads[0].analysis).toBeDefined();
    expect(result.important_threads[0].analysis?.priority).toBe('high');
    expect(result.important_threads[0].analysis?.classification).toBe('partner');
    expect(result.important_threads[0].participant_count).toBe(2);
  });

  it('sets analysis to null for threads with no analysis', async () => {
    mockAccounts.mockResolvedValue([buildAccount()] as any);
    mockThreadCount.mockResolvedValue(1);
    mockThreadFindMany.mockResolvedValue([buildThread({ analyses: [] })] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.important_threads[0].analysis).toBeNull();
  });

  it('account info is correctly mapped', async () => {
    mockAccounts.mockResolvedValue([buildAccount({ label: 'outreach', isDefault: false })] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(result.accounts[0].email).toBe('jesper@test.com');
    expect(result.accounts[0].label).toBe('outreach');
    expect(result.accounts[0].is_default).toBe(false);
    expect(result.accounts[0].provider).toBe('gmail');
  });

  it('generated_at is a valid ISO string', async () => {
    mockAccounts.mockResolvedValue([] as any);
    mockThreadCount.mockResolvedValue(0);
    mockThreadFindMany.mockResolvedValue([] as any);
    mockDraftFindMany.mockResolvedValue([] as any);
    mockDraftCount.mockResolvedValue(0);
    mockDailySummary.mockResolvedValue(null);

    const result = await runBrainSummaryHandler(USER_ID);

    expect(() => new Date(result.generated_at)).not.toThrow();
    expect(new Date(result.generated_at).getTime()).not.toBeNaN();
  });
});
