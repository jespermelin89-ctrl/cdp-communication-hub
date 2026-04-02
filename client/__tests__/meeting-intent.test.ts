import { describe, expect, it } from 'vitest';
import {
  buildAvailabilityReplyText,
  buildBookingReplyText,
  buildHeldSlotReplyText,
  detectMeetingIntent,
  formatAvailabilitySlot,
} from '@/lib/meeting-intent';

describe('detectMeetingIntent', () => {
  it('detects booking requests in Swedish', () => {
    expect(detectMeetingIntent({
      subject: 'Kan vi boka ett möte nästa vecka?',
      messages: [],
    })).toBe(true);
  });

  it('detects booking requests in English', () => {
    expect(detectMeetingIntent({
      subject: 'Quick sync',
      messages: [{ bodyText: 'Can you share your availability for a meeting?', bodyHtml: null }],
    })).toBe(true);
  });

  it('ignores unrelated threads', () => {
    expect(detectMeetingIntent({
      subject: 'Faktura april',
      messages: [{ bodyText: 'Här kommer månadens rapport.', bodyHtml: null }],
    })).toBe(false);
  });
});

describe('buildBookingReplyText', () => {
  it('includes the booking link in the suggested reply', () => {
    const reply = buildBookingReplyText('https://www.meet-r.com/en/jesper');
    expect(reply).toContain('https://www.meet-r.com/en/jesper');
    expect(reply).toContain('Hej!');
  });
});

describe('availability helpers', () => {
  const slot = {
    start: '2026-04-07T08:00:00.000Z',
    end: '2026-04-07T08:30:00.000Z',
  };

  it('formats availability slots with the provided time zone', () => {
    const label = formatAvailabilitySlot(slot, 'sv-SE', 'Europe/Stockholm');
    expect(label).toContain('Europe/Stockholm');
    expect(label).toContain('10:00');
  });

  it('builds a reply with multiple calendar suggestions and optional booking link', () => {
    const reply = buildAvailabilityReplyText([slot], {
      locale: 'sv-SE',
      timeZone: 'Europe/Stockholm',
      bookingLink: 'https://www.meet-r.com/en/jesper',
    });

    expect(reply).toContain('Här är några tider som ser lediga ut i min kalender');
    expect(reply).toContain('https://www.meet-r.com/en/jesper');
    expect(reply).toContain('10:00');
  });

  it('builds a reply for a specifically reserved calendar slot', () => {
    const reply = buildHeldSlotReplyText(slot, {
      locale: 'sv-SE',
      timeZone: 'Europe/Stockholm',
      bookingLink: 'https://www.meet-r.com/en/jesper',
    });

    expect(reply).toContain('Jag har reserverat');
    expect(reply).toContain('10:00');
    expect(reply).toContain('https://www.meet-r.com/en/jesper');
  });
});
