import { describe, expect, it } from 'vitest';
import {
  buildAvailabilitySlots,
  buildCalendarEventDescription,
  buildCalendarEventSummary,
  clampCalendarDays,
  clampCalendarLimit,
  clampSlotMinutes,
  resolveCalendarTimeZone,
} from '../services/calendar.service';
import {
  getGoogleScopes,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '../config/oauth';

describe('Google OAuth scopes', () => {
  it('adds calendar read access only when requested', () => {
    expect(getGoogleScopes()).not.toContain(GOOGLE_CALENDAR_READONLY_SCOPE);
    expect(getGoogleScopes({ feature: 'calendar' })).toContain(GOOGLE_CALENDAR_READONLY_SCOPE);
    expect(getGoogleScopes({ feature: 'calendar_write' })).toContain(GOOGLE_CALENDAR_EVENTS_SCOPE);
  });
});

describe('calendar availability helpers', () => {
  it('clamps days, limit, and slot duration into safe ranges', () => {
    expect(clampCalendarDays(30)).toBe(14);
    expect(clampCalendarDays(0)).toBe(1);
    expect(clampCalendarLimit(20)).toBe(12);
    expect(clampCalendarLimit(0)).toBe(1);
    expect(clampSlotMinutes(7)).toBe(15);
    expect(clampSlotMinutes(37)).toBe(30);
    expect(clampSlotMinutes(200)).toBe(120);
  });

  it('falls back to UTC for invalid time zones', () => {
    expect(resolveCalendarTimeZone('Invalid/Zone')).toBe('UTC');
    expect(resolveCalendarTimeZone('Europe/Stockholm')).toBe('Europe/Stockholm');
  });

  it('builds available slots around busy periods in the requested time zone', () => {
    const slots = buildAvailabilitySlots({
      from: new Date('2026-04-07T07:00:00.000Z'),
      to: new Date('2026-04-07T12:00:00.000Z'),
      slotMinutes: 30,
      limit: 4,
      timeZone: 'Europe/Stockholm',
      quietHoursStart: 22,
      quietHoursEnd: 7,
      busy: [
        { start: '2026-04-07T08:00:00.000Z', end: '2026-04-07T08:30:00.000Z' },
        { start: '2026-04-07T09:30:00.000Z', end: '2026-04-07T10:00:00.000Z' },
      ],
    });

    expect(slots.map((slot) => slot.start)).toEqual([
      '2026-04-07T07:00:00.000Z',
      '2026-04-07T07:30:00.000Z',
      '2026-04-07T08:30:00.000Z',
      '2026-04-07T09:00:00.000Z',
    ]);
  });

  it('skips weekend slots even when the calendar is empty', () => {
    const slots = buildAvailabilitySlots({
      from: new Date('2026-04-11T08:00:00.000Z'),
      to: new Date('2026-04-11T12:00:00.000Z'),
      slotMinutes: 30,
      limit: 2,
      timeZone: 'Europe/Stockholm',
      quietHoursStart: 22,
      quietHoursEnd: 7,
      busy: [],
    });

    expect(slots).toEqual([]);
  });

  it('builds a safe tentative event summary from a reply subject', () => {
    expect(buildCalendarEventSummary('Re: Demo med Jesper')).toBe('Tentativt: Demo med Jesper');
    expect(buildCalendarEventSummary(null)).toBe('Tentativt möte');
  });

  it('builds a descriptive hold note without promising sent invites', () => {
    const description = buildCalendarEventDescription({
      threadSubject: 'Demo med kund',
      participants: ['alice@example.com', 'alice@example.com', 'bob@example.com'],
    });

    expect(description).toContain('Demo med kund');
    expect(description).toContain('alice@example.com, bob@example.com');
    expect(description).toContain('Ingen extern mötesinbjudan har skickats automatiskt.');
  });
});
