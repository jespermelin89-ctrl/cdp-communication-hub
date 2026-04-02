import { describe, expect, it } from 'vitest';
import {
  buildCalendarInviteResponseText,
  formatCalendarInviteWindow,
  getCalendarInviteLabel,
  getCalendarInviteReplyRecipients,
  getCalendarInviteResponseStatusLabel,
  getMessageCalendarInvite,
  isInviteAttachmentDownloadable,
} from '@/lib/calendar-invite';

describe('calendar invite helpers', () => {
  const invite = {
    uid: 'demo-123',
    method: 'REQUEST',
    status: 'CONFIRMED',
    summary: 'Demo med Jesper',
    description: null,
    location: 'Google Meet',
    organizer: 'jesper@example.com',
    organizerName: 'Jesper Melin',
    start: '2026-04-09T08:00:00.000Z',
    end: '2026-04-09T08:30:00.000Z',
    timeZone: 'Europe/Stockholm',
    isAllDay: false,
  };

  it('extracts the first invite from message attachments', () => {
    const result = getMessageCalendarInvite({
      attachments: [
        {
          attachmentId: 'att_1',
          filename: 'invite.ics',
          mimeType: 'text/calendar',
          size: 1024,
          downloadable: true,
          calendarInvite: invite,
        },
      ],
    } as any);

    expect(result?.summary).toBe('Demo med Jesper');
  });

  it('formats invite windows with timezone info', () => {
    const result = formatCalendarInviteWindow(invite, 'sv-SE');
    expect(result).toContain('10:00');
    expect(result).toContain('Europe/Stockholm');
  });

  it('labels cancel invites differently', () => {
    expect(getCalendarInviteLabel({ ...invite, method: 'CANCEL' } as any)).toContain('Inställd');
  });

  it('disables downloads for inline invite metadata without attachment ids', () => {
    expect(isInviteAttachmentDownloadable({ attachmentId: '', downloadable: false })).toBe(false);
    expect(isInviteAttachmentDownloadable({ attachmentId: 'att_1', downloadable: true })).toBe(true);
  });

  it('builds an accept response draft body from the invite details', () => {
    const result = buildCalendarInviteResponseText(invite as any, 'accept', {
      locale: 'sv-SE',
      fallbackTimeZone: 'Europe/Stockholm',
    });

    expect(result).toContain('passar bra för mig');
    expect(result).toContain('10:00');
  });

  it('builds a decline response and includes booking link when provided', () => {
    const result = buildCalendarInviteResponseText(invite as any, 'decline', {
      locale: 'sv-SE',
      fallbackTimeZone: 'Europe/Stockholm',
      bookingLink: 'https://www.meet-r.com/en/jesper',
    });

    expect(result).toContain('kan tyvärr inte');
    expect(result).toContain('https://www.meet-r.com/en/jesper');
  });

  it('prefers the organizer for invite reply recipients', () => {
    const result = getCalendarInviteReplyRecipients(
      invite as any,
      ['participant@example.com', 'owner@example.com'],
      'owner@example.com'
    );

    expect(result[0]).toBe('jesper@example.com');
    expect(result).toContain('participant@example.com');
    expect(result).not.toContain('owner@example.com');
  });

  it('renders a readable label for calendar response status', () => {
    expect(getCalendarInviteResponseStatusLabel('accepted')).toContain('Accepterad');
    expect(getCalendarInviteResponseStatusLabel('declined')).toContain('Avböjd');
  });
});
