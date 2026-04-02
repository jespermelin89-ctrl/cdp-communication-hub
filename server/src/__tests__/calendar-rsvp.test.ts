import { describe, expect, it } from 'vitest';
import {
  getCalendarEventStartIso,
  pickInviteEventMatch,
  resolveInviteResponseAttendeeEmail,
} from '../services/calendar.service';

describe('calendar RSVP helpers', () => {
  it('prefers the event whose start matches the invite start', () => {
    const events = [
      {
        id: 'later',
        status: 'confirmed',
        start: { dateTime: '2026-04-10T09:00:00.000Z' },
      },
      {
        id: 'match',
        status: 'confirmed',
        start: { dateTime: '2026-04-09T08:00:00.000Z' },
      },
    ] as any;

    const result = pickInviteEventMatch(events, '2026-04-09T08:00:00.000Z');
    expect(result?.id).toBe('match');
  });

  it('falls back to the first non-cancelled event when invite start is missing', () => {
    const result = pickInviteEventMatch([
      { id: 'cancelled', status: 'cancelled', start: { dateTime: '2026-04-08T08:00:00.000Z' } },
      { id: 'confirmed', status: 'confirmed', start: { dateTime: '2026-04-09T08:00:00.000Z' } },
    ] as any);

    expect(result?.id).toBe('confirmed');
  });

  it('prefers the self attendee email when updating RSVP status', () => {
    const result = resolveInviteResponseAttendeeEmail({
      attendees: [
        { email: 'other@example.com' },
        { email: 'self@example.com', self: true },
      ],
    } as any, 'owner@example.com');

    expect(result).toBe('self@example.com');
  });

  it('falls back to the account email when there is no self attendee', () => {
    const result = resolveInviteResponseAttendeeEmail({
      attendees: [{ email: 'guest@example.com' }],
    } as any, 'owner@example.com');

    expect(result).toBe('owner@example.com');
  });

  it('normalizes all-day event starts into ISO timestamps', () => {
    const result = getCalendarEventStartIso({
      start: { date: '2026-04-11' },
    } as any);

    expect(result).toBe('2026-04-11T00:00:00.000Z');
  });
});
