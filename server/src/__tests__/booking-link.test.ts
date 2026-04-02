import { describe, expect, it } from 'vitest';
import { normalizeBookingLinkInput } from '../utils/booking-link';

describe('normalizeBookingLinkInput', () => {
  it('returns undefined when field is omitted', () => {
    expect(normalizeBookingLinkInput(undefined)).toBeUndefined();
  });

  it('allows clearing the field with null or empty string', () => {
    expect(normalizeBookingLinkInput(null)).toBeNull();
    expect(normalizeBookingLinkInput('   ')).toBeNull();
  });

  it('normalizes a valid https URL', () => {
    expect(normalizeBookingLinkInput('https://www.meet-r.com/en/jesper')).toBe('https://www.meet-r.com/en/jesper');
  });

  it('rejects malformed URLs', () => {
    expect(() => normalizeBookingLinkInput('not-a-url')).toThrow('valid URL');
  });

  it('rejects non-http protocols', () => {
    expect(() => normalizeBookingLinkInput('ftp://example.com')).toThrow('http or https');
  });
});
