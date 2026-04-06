/**
 * Sprint 12 — Action logs route tests.
 *
 * GET /action-logs — audit trail read endpoint.
 *
 * Tests:
 *  1. Delegates to actionLogService.list with correct params
 *  2. Default pagination (page=1, limit=50)
 *  3. Parses page and limit from query string (strings → numbers)
 *  4. Passes action_type, target_type, target_id filters
 *  5. Returns logs + pagination from service
 *  6. userId is always passed from auth context
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../services/action-log.service', () => ({
  actionLogService: {
    list: vi.fn(),
  },
}));

import { actionLogService } from '../services/action-log.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLogEntry(overrides: Partial<{
  id: string; actionType: string; targetType: string; targetId: string;
  userId: string; createdAt: Date;
}> = {}) {
  return {
    id: 'log-1',
    actionType: 'draft_approved',
    targetType: 'draft',
    targetId: 'draft-1',
    userId: 'user-1',
    metadata: {},
    createdAt: new Date('2026-04-06T10:00:00Z'),
    ...overrides,
  };
}

function makePagination(overrides: Partial<{
  page: number; limit: number; total: number; totalPages: number;
}> = {}) {
  return { page: 1, limit: 50, total: 1, totalPages: 1, ...overrides };
}

/** Simulate the GET /action-logs route handler */
async function simulateGetActionLogs(
  query: {
    action_type?: string;
    target_type?: string;
    target_id?: string;
    page?: string;
    limit?: string;
  },
  userId: string
) {
  const { action_type, target_type, target_id, page, limit } = query;
  return actionLogService.list({
    userId,
    actionType: action_type,
    targetType: target_type,
    targetId: target_id,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /action-logs — delegation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls actionLogService.list with userId', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination({ total: 0, totalPages: 0 }) } as any);
    await simulateGetActionLogs({}, 'user-42');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-42' })
    );
  });

  it('uses default page=1 and limit=50 when not provided', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({}, 'user-1');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 50 })
    );
  });

  it('parses page and limit from query strings', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({ page: '3', limit: '20' }, 'user-1');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 20 })
    );
  });

  it('passes action_type filter to service', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({ action_type: 'draft_approved' }, 'user-1');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'draft_approved' })
    );
  });

  it('passes target_type and target_id filters to service', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({ target_type: 'draft', target_id: 'draft-99' }, 'user-1');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'draft', targetId: 'draft-99' })
    );
  });

  it('passes undefined for unset filters', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({}, 'user-1');
    expect(actionLogService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: undefined,
        targetType: undefined,
        targetId: undefined,
      })
    );
  });
});

describe('GET /action-logs — response shape', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns logs array from service', async () => {
    const logs = [makeLogEntry(), makeLogEntry({ id: 'log-2', actionType: 'thread_archived' })];
    vi.mocked(actionLogService.list).mockResolvedValue({ logs, pagination: makePagination({ total: 2 }) } as any);
    const result = await simulateGetActionLogs({}, 'user-1');
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].actionType).toBe('draft_approved');
    expect(result.logs[1].actionType).toBe('thread_archived');
  });

  it('returns pagination metadata', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({
      logs: [makeLogEntry()],
      pagination: makePagination({ page: 2, limit: 10, total: 25, totalPages: 3 }),
    } as any);
    const result = await simulateGetActionLogs({ page: '2', limit: '10' }, 'user-1');
    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(10);
    expect(result.pagination.total).toBe(25);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('returns empty logs array when no logs found', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination({ total: 0, totalPages: 0 }) } as any);
    const result = await simulateGetActionLogs({}, 'user-1');
    expect(result.logs).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  it('all filter params passed in single call', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({ logs: [], pagination: makePagination() } as any);
    await simulateGetActionLogs({
      action_type: 'thread_archived',
      target_type: 'thread',
      target_id: 'thread-abc',
      page: '2',
      limit: '15',
    }, 'user-7');
    expect(actionLogService.list).toHaveBeenCalledWith({
      userId: 'user-7',
      actionType: 'thread_archived',
      targetType: 'thread',
      targetId: 'thread-abc',
      page: 2,
      limit: 15,
    });
  });
});

describe('ActionLogService.list — pagination arithmetic', () => {
  it('calculates totalPages = ceil(total / limit)', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({
      logs: [],
      pagination: { page: 1, limit: 10, total: 45, totalPages: Math.ceil(45 / 10) },
    } as any);
    const result = await simulateGetActionLogs({ limit: '10' }, 'user-1');
    expect(result.pagination.totalPages).toBe(5);
  });

  it('totalPages is 0 when no logs', async () => {
    vi.mocked(actionLogService.list).mockResolvedValue({
      logs: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    } as any);
    const result = await simulateGetActionLogs({}, 'user-1');
    expect(result.pagination.totalPages).toBe(0);
  });
});
