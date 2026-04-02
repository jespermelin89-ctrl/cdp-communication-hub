import { describe, expect, it } from 'vitest';
import {
  isCalendarInviteMimeType,
  parseCalendarInvite,
} from '../utils/calendar-invite';

describe('parseCalendarInvite', () => {
  it('parses a meeting request with timezone-aware timestamps', () => {
    const invite = parseCalendarInvite([
      'BEGIN:VCALENDAR',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:demo-123',
      'DTSTART;TZID=Europe/Stockholm:20260409T100000',
      'DTEND;TZID=Europe/Stockholm:20260409T103000',
      'SUMMARY:Demo med Jesper',
      'LOCATION:Google Meet',
      'DESCRIPTION:Hej\\nVi ses i Meet',
      'ORGANIZER;CN=Jesper Melin:mailto:jesper@example.com',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(invite).not.toBeNull();
    expect(invite?.method).toBe('REQUEST');
    expect(invite?.summary).toBe('Demo med Jesper');
    expect(invite?.location).toBe('Google Meet');
    expect(invite?.organizer).toBe('jesper@example.com');
    expect(invite?.organizerName).toBe('Jesper Melin');
    expect(invite?.description).toContain('Vi ses i Meet');
    expect(invite?.timeZone).toBe('Europe/Stockholm');
    expect(invite?.start).toBe('2026-04-09T08:00:00.000Z');
    expect(invite?.end).toBe('2026-04-09T08:30:00.000Z');
  });

  it('handles folded lines and all-day events', () => {
    const invite = parseCalendarInvite([
      'BEGIN:VCALENDAR',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      'UID:demo-456',
      'DTSTART;VALUE=DATE:20260410',
      'DTEND;VALUE=DATE:20260411',
      'SUMMARY:Heldagsevent',
      'DESCRIPTION:Första raden',
      ' andra raden',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(invite?.method).toBe('CANCEL');
    expect(invite?.isAllDay).toBe(true);
    expect(invite?.start).toBe('2026-04-10T00:00:00.000Z');
    expect(invite?.description).toBe('Första radenandra raden');
  });

  it('returns null for non-calendar content', () => {
    expect(parseCalendarInvite('hello world')).toBeNull();
  });
});

describe('isCalendarInviteMimeType', () => {
  it('recognizes calendar attachments by mime type or filename', () => {
    expect(isCalendarInviteMimeType('text/calendar', 'invite.dat')).toBe(true);
    expect(isCalendarInviteMimeType('application/octet-stream', 'invite.ics')).toBe(true);
    expect(isCalendarInviteMimeType('application/pdf', 'invite.pdf')).toBe(false);
  });
});
