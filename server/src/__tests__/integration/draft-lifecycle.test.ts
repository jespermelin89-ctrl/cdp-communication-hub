/**
 * Draft lifecycle — state machine logic tests (no DB required).
 * Tests draft status transitions and approval gate enforcement.
 */

import { describe, it, expect } from 'vitest';

type DraftStatus = 'pending' | 'approved' | 'sent' | 'failed' | 'discarded';

interface Draft {
  id: string;
  status: DraftStatus;
  approvedAt?: Date;
  sentAt?: Date;
  scheduledAt?: Date;
  errorMessage?: string;
}

function approveDraft(draft: Draft): Draft {
  if (draft.status !== 'pending') throw new Error('Only pending drafts can be approved');
  return { ...draft, status: 'approved', approvedAt: new Date() };
}

function sendDraft(draft: Draft): Draft {
  if (draft.status !== 'approved') throw new Error('Only approved drafts can be sent');
  return { ...draft, status: 'sent', sentAt: new Date() };
}

function discardDraft(draft: Draft): Draft {
  if (['sent', 'discarded'].includes(draft.status)) {
    throw new Error(`Cannot discard a ${draft.status} draft`);
  }
  return { ...draft, status: 'discarded' };
}

function scheduleDraft(draft: Draft, at: Date): Draft {
  if (draft.status !== 'pending') throw new Error('Only pending drafts can be scheduled');
  return { ...draft, scheduledAt: at };
}

function cancelSchedule(draft: Draft): Draft {
  return { ...draft, scheduledAt: undefined };
}

function markFailed(draft: Draft, error: string): Draft {
  return { ...draft, status: 'failed', errorMessage: error };
}

function canSend(draft: Draft): boolean {
  return draft.status === 'approved';
}

describe('draft lifecycle — state transitions', () => {
  const base: Draft = { id: 'draft-1', status: 'pending' };

  it('approve transitions pending → approved', () => {
    const d = approveDraft(base);
    expect(d.status).toBe('approved');
    expect(d.approvedAt).toBeInstanceOf(Date);
  });

  it('cannot approve a non-pending draft', () => {
    const d: Draft = { ...base, status: 'approved' };
    expect(() => approveDraft(d)).toThrow('Only pending drafts can be approved');
  });

  it('send transitions approved → sent', () => {
    const d = sendDraft({ ...base, status: 'approved' });
    expect(d.status).toBe('sent');
    expect(d.sentAt).toBeInstanceOf(Date);
  });

  it('cannot send a pending draft (approval gate)', () => {
    expect(() => sendDraft(base)).toThrow('Only approved drafts can be sent');
  });

  it('cannot send a discarded draft', () => {
    const d: Draft = { ...base, status: 'discarded' };
    expect(() => sendDraft(d)).toThrow();
  });

  it('discard works on pending and approved', () => {
    expect(discardDraft(base).status).toBe('discarded');
    expect(discardDraft({ ...base, status: 'approved' }).status).toBe('discarded');
  });

  it('cannot discard a sent draft', () => {
    expect(() => discardDraft({ ...base, status: 'sent' })).toThrow();
  });

  it('schedule sets scheduledAt on pending draft', () => {
    const at = new Date('2026-04-01T08:00:00Z');
    const d = scheduleDraft(base, at);
    expect(d.scheduledAt).toEqual(at);
    expect(d.status).toBe('pending'); // status unchanged
  });

  it('cancel schedule clears scheduledAt', () => {
    const d = cancelSchedule({ ...base, scheduledAt: new Date() });
    expect(d.scheduledAt).toBeUndefined();
  });

  it('markFailed records error message', () => {
    const d = markFailed({ ...base, status: 'approved' }, 'SMTP timeout');
    expect(d.status).toBe('failed');
    expect(d.errorMessage).toBe('SMTP timeout');
  });

  it('canSend is true only for approved status', () => {
    expect(canSend(base)).toBe(false);
    expect(canSend({ ...base, status: 'approved' })).toBe(true);
    expect(canSend({ ...base, status: 'sent' })).toBe(false);
    expect(canSend({ ...base, status: 'discarded' })).toBe(false);
    expect(canSend({ ...base, status: 'failed' })).toBe(false);
  });

  it('full happy path: pending → approved → sent', () => {
    let d = base;
    d = approveDraft(d);
    expect(d.status).toBe('approved');
    d = sendDraft(d);
    expect(d.status).toBe('sent');
  });

  it('full scheduled path: pending → schedule → approve → send', () => {
    let d = base;
    d = scheduleDraft(d, new Date('2026-04-02T08:00:00Z'));
    expect(d.scheduledAt).toBeDefined();
    d = approveDraft(d);
    expect(d.status).toBe('approved');
    d = sendDraft(d);
    expect(d.status).toBe('sent');
  });
});
