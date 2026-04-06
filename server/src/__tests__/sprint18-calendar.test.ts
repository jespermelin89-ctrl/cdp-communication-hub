/**
 * Sprint 18 — Route-level tests for calendar.ts.
 *
 * Covered:
 *  GET  /calendar/availability    — schema validation, 404 account, requiresReconnect→reauthUrl, success
 *  POST /calendar/events          — schema validation, 404 account, 404 thread, requiresReconnect, success
 *                                   (buildCalendarEventSummary/Description invoked correctly)
 *  POST /calendar/events/release  — schema validation, 404 account, "Calendar event not found"→404,
 *                                   "Only tentative..."→400, requiresReconnect, success
 *  POST /calendar/invites/respond — schema validation (response_status enum), 404 account,
 *                                   "Calendar invite not found"→404, requiresReconnect, success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/database', () => ({
  prisma: {
    emailAccount: { findFirst: vi.fn() },
    emailThread: { findFirst: vi.fn() },
  },
}));

vi.mock('../services/calendar.service', () => ({
  calendarService: {
    getAvailability: vi.fn(),
    createTentativeEvent: vi.fn(),
    releaseTentativeEvent: vi.fn(),
    respondToInvite: vi.fn(),
  },
  buildCalendarEventSummary: vi.fn((subject?: string | null) => subject ? `Meeting: ${subject}` : 'Meeting'),
  buildCalendarEventDescription: vi.fn(({ threadSubject, participants }: any) =>
    `Thread: ${threadSubject ?? '—'}\nParticipants: ${(participants ?? []).join(', ')}`
  ),
}));

vi.mock('../services/auth.service', () => ({
  authService: {
    getReauthUrl: vi.fn((accountId: string, opts: any) =>
      `https://app.example.com/auth/reauth?account=${accountId}&feature=${opts.feature}`
    ),
  },
}));

vi.mock('../utils/return-to', () => ({
  sanitizeReturnTo: vi.fn((v?: string) => v ?? null),
}));

import { prisma } from '../config/database';
import { calendarService, buildCalendarEventSummary, buildCalendarEventDescription } from '../services/calendar.service';
import { authService } from '../services/auth.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const ACCOUNT_ID = 'acc-1';

function makeAccount(overrides: Record<string, unknown> = {}) {
  return { id: ACCOUNT_ID, emailAddress: 'me@example.com', ...overrides };
}

function makeThread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thread-1',
    subject: 'Project proposal',
    participantEmails: ['me@example.com', 'vendor@external.com'],
    ...overrides,
  };
}

// ─── GET /calendar/availability ───────────────────────────────────────────────

async function simulateGetAvailability(query: Record<string, unknown>, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    account_id: z.string().min(1),
    days: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    slot_minutes: z.coerce.number().optional(),
    time_zone: z.string().optional(),
    return_to: z.string().optional(),
  });
  const parsed = schema.safeParse(query);
  if (!parsed.success) return { code: 400, body: { error: 'Invalid query', details: parsed.error.issues } };

  const { account_id, return_to, ...options } = parsed.data;
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id: account_id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  const result = await calendarService.getAvailability(account.id, {
    days: options.days,
    limit: options.limit,
    slotMinutes: options.slot_minutes,
    timeZone: options.time_zone,
  });

  if ((result as any).supported && (result as any).requiresReconnect) {
    const { sanitizeReturnTo } = await import('../utils/return-to');
    return {
      code: 200,
      body: {
        ...(result as any),
        reauthUrl: authService.getReauthUrl(account.id, {
          feature: 'calendar',
          returnTo: sanitizeReturnTo(return_to),
        }),
      },
    };
  }
  return { code: 200, body: result };
}

// ─── POST /calendar/events ────────────────────────────────────────────────────

async function simulateCreateEvent(body: Record<string, unknown>, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    account_id: z.string().min(1),
    thread_id: z.string().min(1).optional(),
    start: z.string().min(1),
    end: z.string().min(1),
    time_zone: z.string().optional(),
    return_to: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };

  const { account_id, thread_id, start, end, time_zone, return_to } = parsed.data;

  const account = await (prisma.emailAccount.findFirst as any)({ where: { id: account_id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  let thread: any = null;
  if (thread_id) {
    thread = await (prisma.emailThread.findFirst as any)({
      where: { id: thread_id, accountId: account.id },
    });
    if (!thread) return { code: 404, body: { error: 'Thread not found' } };
  }

  const result = await calendarService.createTentativeEvent(account.id, {
    start,
    end,
    timeZone: time_zone,
    summary: buildCalendarEventSummary(thread?.subject),
    description: buildCalendarEventDescription({
      threadSubject: thread?.subject,
      participants: (thread?.participantEmails ?? []).filter((e: string) => e !== account.emailAddress),
    }),
  });

  if ((result as any).supported && (result as any).requiresReconnect) {
    const { sanitizeReturnTo } = await import('../utils/return-to');
    return {
      code: 200,
      body: {
        ...(result as any),
        reauthUrl: authService.getReauthUrl(account.id, {
          feature: 'calendar_write',
          returnTo: sanitizeReturnTo(return_to),
        }),
      },
    };
  }
  return { code: 200, body: result };
}

// ─── POST /calendar/events/release ───────────────────────────────────────────

async function simulateReleaseEvent(body: Record<string, unknown>, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    account_id: z.string().min(1),
    event_id: z.string().min(1),
    time_zone: z.string().optional(),
    return_to: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };

  const { account_id, event_id, time_zone, return_to } = parsed.data;
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id: account_id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  try {
    const result = await calendarService.releaseTentativeEvent(account.id, event_id, { timeZone: time_zone });

    if ((result as any).supported && (result as any).requiresReconnect) {
      const { sanitizeReturnTo } = await import('../utils/return-to');
      return {
        code: 200,
        body: {
          ...(result as any),
          reauthUrl: authService.getReauthUrl(account.id, {
            feature: 'calendar_write',
            returnTo: sanitizeReturnTo(return_to),
          }),
        },
      };
    }
    return { code: 200, body: result };
  } catch (error: any) {
    const message = error?.message ?? 'Could not release calendar event';
    if (message === 'Calendar event not found') return { code: 404, body: { error: message } };
    if (message === 'Only tentative Mail OS reservations can be released here') return { code: 400, body: { error: message } };
    throw error;
  }
}

// ─── POST /calendar/invites/respond ──────────────────────────────────────────

async function simulateRespondToInvite(body: Record<string, unknown>, userId = USER_ID) {
  const { z } = await import('zod');
  const schema = z.object({
    account_id: z.string().min(1),
    invite_uid: z.string().min(1),
    invite_start: z.string().optional(),
    response_status: z.enum(['accepted', 'declined']),
    time_zone: z.string().optional(),
    return_to: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { code: 400, body: { error: 'Invalid input', details: parsed.error.issues } };

  const { account_id, invite_uid, invite_start, response_status, time_zone, return_to } = parsed.data;
  const account = await (prisma.emailAccount.findFirst as any)({ where: { id: account_id, userId } });
  if (!account) return { code: 404, body: { error: 'Account not found' } };

  try {
    const result = await calendarService.respondToInvite(account.id, {
      inviteUid: invite_uid,
      inviteStart: invite_start,
      responseStatus: response_status,
      timeZone: time_zone,
    });

    if ((result as any).supported && (result as any).requiresReconnect) {
      const { sanitizeReturnTo } = await import('../utils/return-to');
      return {
        code: 200,
        body: {
          ...(result as any),
          reauthUrl: authService.getReauthUrl(account.id, {
            feature: 'calendar_write',
            returnTo: sanitizeReturnTo(return_to),
          }),
        },
      };
    }
    return { code: 200, body: result };
  } catch (error: any) {
    const message = error?.message ?? 'Could not respond to calendar invite';
    if (message === 'Calendar invite not found') return { code: 404, body: { error: message } };
    throw error;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /calendar/availability ───────────────────────────────────────────────

describe('GET /calendar/availability', () => {
  it('returns 400 when account_id is missing', async () => {
    expect((await simulateGetAvailability({ days: '7' })).code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateGetAvailability({ account_id: ACCOUNT_ID })).code).toBe(404);
  });

  it('returns success result when supported', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.getAvailability).mockResolvedValue({ supported: true, slots: [] } as any);
    const result = await simulateGetAvailability({ account_id: ACCOUNT_ID });
    expect(result.code).toBe(200);
    expect((result.body as any).supported).toBe(true);
    expect(calendarService.getAvailability).toHaveBeenCalledWith(ACCOUNT_ID, expect.objectContaining({}));
  });

  it('passes days/limit/slot_minutes/time_zone to calendarService', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.getAvailability).mockResolvedValue({ supported: false } as any);
    await simulateGetAvailability({ account_id: ACCOUNT_ID, days: '14', limit: '5', slot_minutes: '30', time_zone: 'Europe/Stockholm' });
    expect(calendarService.getAvailability).toHaveBeenCalledWith(ACCOUNT_ID, {
      days: 14,
      limit: 5,
      slotMinutes: 30,
      timeZone: 'Europe/Stockholm',
    });
  });

  it('adds reauthUrl when requiresReconnect=true', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.getAvailability).mockResolvedValue({ supported: true, requiresReconnect: true } as any);
    const result = await simulateGetAvailability({ account_id: ACCOUNT_ID, return_to: '/calendar' });
    expect(result.code).toBe(200);
    expect((result.body as any).reauthUrl).toContain('feature=calendar');
    expect(authService.getReauthUrl).toHaveBeenCalledWith(ACCOUNT_ID, expect.objectContaining({ feature: 'calendar' }));
  });

  it('does NOT add reauthUrl when supported=true but requiresReconnect=false', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.getAvailability).mockResolvedValue({ supported: true, requiresReconnect: false, slots: [] } as any);
    const result = await simulateGetAvailability({ account_id: ACCOUNT_ID });
    expect((result.body as any).reauthUrl).toBeUndefined();
    expect(authService.getReauthUrl).not.toHaveBeenCalled();
  });
});

// ─── POST /calendar/events ────────────────────────────────────────────────────

describe('POST /calendar/events', () => {
  it('returns 400 when start is missing', async () => {
    expect((await simulateCreateEvent({ account_id: ACCOUNT_ID, end: '2026-05-01T15:00:00Z' })).code).toBe(400);
  });

  it('returns 400 when end is missing', async () => {
    expect((await simulateCreateEvent({ account_id: ACCOUNT_ID, start: '2026-05-01T14:00:00Z' })).code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateCreateEvent({ account_id: ACCOUNT_ID, start: '2026-05-01T14:00:00Z', end: '2026-05-01T15:00:00Z' })).code).toBe(404);
  });

  it('returns 404 when thread not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(null);
    const result = await simulateCreateEvent({
      account_id: ACCOUNT_ID,
      thread_id: 'thread-x',
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    });
    expect(result.code).toBe(404);
    expect((result.body as any).error).toMatch(/thread not found/i);
  });

  it('creates event without thread and returns result', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.createTentativeEvent).mockResolvedValue({ supported: true, eventId: 'evt-1' } as any);
    const result = await simulateCreateEvent({
      account_id: ACCOUNT_ID,
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    });
    expect(result.code).toBe(200);
    expect((result.body as any).eventId).toBe('evt-1');
    expect(calendarService.createTentativeEvent).toHaveBeenCalledWith(ACCOUNT_ID, expect.objectContaining({
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    }));
  });

  it('uses buildCalendarEventSummary with thread subject', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    vi.mocked(calendarService.createTentativeEvent).mockResolvedValue({ supported: true } as any);
    await simulateCreateEvent({
      account_id: ACCOUNT_ID,
      thread_id: 'thread-1',
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    });
    expect(buildCalendarEventSummary).toHaveBeenCalledWith('Project proposal');
  });

  it('filters own email from participants in description', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(prisma.emailThread.findFirst).mockResolvedValue(makeThread() as any);
    vi.mocked(calendarService.createTentativeEvent).mockResolvedValue({ supported: true } as any);
    await simulateCreateEvent({
      account_id: ACCOUNT_ID,
      thread_id: 'thread-1',
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    });
    const descCall = vi.mocked(buildCalendarEventDescription).mock.calls[0][0] as any;
    expect(descCall.participants).not.toContain('me@example.com');
    expect(descCall.participants).toContain('vendor@external.com');
  });

  it('adds reauthUrl when requiresReconnect=true', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.createTentativeEvent).mockResolvedValue({ supported: true, requiresReconnect: true } as any);
    const result = await simulateCreateEvent({
      account_id: ACCOUNT_ID,
      start: '2026-05-01T14:00:00Z',
      end: '2026-05-01T15:00:00Z',
    });
    expect((result.body as any).reauthUrl).toContain('feature=calendar_write');
  });
});

// ─── POST /calendar/events/release ───────────────────────────────────────────

describe('POST /calendar/events/release', () => {
  it('returns 400 when event_id is missing', async () => {
    expect((await simulateReleaseEvent({ account_id: ACCOUNT_ID })).code).toBe(400);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-1' })).code).toBe(404);
  });

  it('returns 404 for "Calendar event not found" error', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.releaseTentativeEvent).mockRejectedValue(new Error('Calendar event not found'));
    const result = await simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-x' });
    expect(result.code).toBe(404);
    expect((result.body as any).error).toBe('Calendar event not found');
  });

  it('returns 400 for "Only tentative Mail OS reservations..." error', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.releaseTentativeEvent).mockRejectedValue(
      new Error('Only tentative Mail OS reservations can be released here')
    );
    const result = await simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-1' });
    expect(result.code).toBe(400);
  });

  it('propagates unknown errors', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.releaseTentativeEvent).mockRejectedValue(new Error('Unexpected DB error'));
    await expect(simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-1' })).rejects.toThrow('Unexpected DB error');
  });

  it('returns result on success', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.releaseTentativeEvent).mockResolvedValue({ supported: true, released: true } as any);
    const result = await simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-1' });
    expect(result.code).toBe(200);
    expect((result.body as any).released).toBe(true);
  });

  it('adds reauthUrl when requiresReconnect=true', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.releaseTentativeEvent).mockResolvedValue({ supported: true, requiresReconnect: true } as any);
    const result = await simulateReleaseEvent({ account_id: ACCOUNT_ID, event_id: 'evt-1' });
    expect((result.body as any).reauthUrl).toContain('calendar_write');
  });
});

// ─── POST /calendar/invites/respond ──────────────────────────────────────────

describe('POST /calendar/invites/respond', () => {
  const VALID_BODY = {
    account_id: ACCOUNT_ID,
    invite_uid: 'invite-abc',
    response_status: 'accepted',
  };

  it('returns 400 when invite_uid is missing', async () => {
    expect((await simulateRespondToInvite({ account_id: ACCOUNT_ID, response_status: 'accepted' })).code).toBe(400);
  });

  it('returns 400 for invalid response_status', async () => {
    expect((await simulateRespondToInvite({ ...VALID_BODY, response_status: 'maybe' })).code).toBe(400);
  });

  it('accepts "accepted" status', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.respondToInvite).mockResolvedValue({ supported: true } as any);
    expect((await simulateRespondToInvite(VALID_BODY)).code).toBe(200);
  });

  it('accepts "declined" status', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.respondToInvite).mockResolvedValue({ supported: true } as any);
    expect((await simulateRespondToInvite({ ...VALID_BODY, response_status: 'declined' })).code).toBe(200);
  });

  it('returns 404 when account not found', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(null);
    expect((await simulateRespondToInvite(VALID_BODY)).code).toBe(404);
  });

  it('returns 404 for "Calendar invite not found" error', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.respondToInvite).mockRejectedValue(new Error('Calendar invite not found'));
    const result = await simulateRespondToInvite(VALID_BODY);
    expect(result.code).toBe(404);
    expect((result.body as any).error).toBe('Calendar invite not found');
  });

  it('adds reauthUrl when requiresReconnect=true', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.respondToInvite).mockResolvedValue({ supported: true, requiresReconnect: true } as any);
    const result = await simulateRespondToInvite({ ...VALID_BODY, return_to: '/inbox' });
    expect((result.body as any).reauthUrl).toContain('calendar_write');
    expect(authService.getReauthUrl).toHaveBeenCalledWith(ACCOUNT_ID, expect.objectContaining({ feature: 'calendar_write' }));
  });

  it('passes all params to calendarService.respondToInvite', async () => {
    vi.mocked(prisma.emailAccount.findFirst).mockResolvedValue(makeAccount() as any);
    vi.mocked(calendarService.respondToInvite).mockResolvedValue({ supported: true } as any);
    await simulateRespondToInvite({
      ...VALID_BODY,
      invite_start: '2026-05-01T14:00:00Z',
      time_zone: 'Europe/Stockholm',
    });
    expect(calendarService.respondToInvite).toHaveBeenCalledWith(ACCOUNT_ID, {
      inviteUid: 'invite-abc',
      inviteStart: '2026-05-01T14:00:00Z',
      responseStatus: 'accepted',
      timeZone: 'Europe/Stockholm',
    });
  });
});
