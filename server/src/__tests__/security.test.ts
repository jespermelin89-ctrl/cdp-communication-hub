/**
 * Security tests — input sanitization, email validation, body length limits.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeLabel, sanitizeSearch, isValidEmail } from '../utils/sanitize';
import { CreateDraftSchema, GenerateDraftRequestSchema } from '../utils/validators';

describe('sanitizeLabel', () => {
  it('strips XSS script tags', () => {
    const result = sanitizeLabel('<script>alert(1)</script>LABEL');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('script');
    expect(result).toContain('LABEL');
  });

  it('strips special characters', () => {
    const result = sanitizeLabel('hello world!@#');
    expect(result).toBe('HELLOWORLD');
  });

  it('keeps Swedish characters (ÅÄÖ)', () => {
    const result = sanitizeLabel('ÅÄÖ_test');
    expect(result).toContain('ÅÄÖ');
    expect(result).toContain('_TEST');
  });

  it('truncates to 50 characters', () => {
    const long = 'A'.repeat(100);
    expect(sanitizeLabel(long).length).toBeLessThanOrEqual(50);
  });

  it('neutralizes XSS by stripping angle brackets and special chars', () => {
    const result = sanitizeLabel('<script>xss</script>');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('/');
    // Letters remain (uppercased), but the tag structure is gone — safe for use as label
    expect(result).toBe('SCRIPTXSSSCRIPT');
  });
});

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('name+tag@subdomain.domain.org')).toBe(true);
    expect(isValidEmail('jesper.melin89@gmail.com')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@nodomain.com')).toBe(false);
    expect(isValidEmail('no@tld')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('spaces in@email.com')).toBe(false);
  });
});

describe('sanitizeSearch', () => {
  it('strips control characters', () => {
    const result = sanitizeSearch('hello\x00world\x1F');
    expect(result).toBe('helloworld');
  });

  it('trims whitespace', () => {
    expect(sanitizeSearch('  query  ')).toBe('query');
  });

  it('truncates to 200 characters', () => {
    const long = 'x'.repeat(300);
    expect(sanitizeSearch(long).length).toBeLessThanOrEqual(200);
  });
});

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

describe('CreateDraftSchema — body length validation', () => {
  it('accepts a valid draft', () => {
    const result = CreateDraftSchema.safeParse({
      account_id: VALID_UUID,
      to_addresses: ['a@example.com'],
      subject: 'Test',
      body_text: 'Hello world',
    });
    expect(result.success).toBe(true);
  });

  it('rejects draft with empty body', () => {
    const result = CreateDraftSchema.safeParse({
      account_id: VALID_UUID,
      to_addresses: ['a@example.com'],
      subject: 'Test',
      body_text: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects draft with empty subject', () => {
    const result = CreateDraftSchema.safeParse({
      account_id: VALID_UUID,
      to_addresses: ['a@example.com'],
      subject: '',
      body_text: 'Hello',
    });
    expect(result.success).toBe(false);
  });
});

describe('GenerateDraftRequestSchema — instruction length', () => {
  it('rejects instruction over 2000 characters', () => {
    const result = GenerateDraftRequestSchema.safeParse({
      account_id: VALID_UUID,
      instruction: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid instruction', () => {
    const result = GenerateDraftRequestSchema.safeParse({
      account_id: VALID_UUID,
      instruction: 'Write a reply saying thanks',
    });
    expect(result.success).toBe(true);
  });
});
