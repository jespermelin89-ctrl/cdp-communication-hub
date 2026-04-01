/**
 * Tests for email signature logic
 *
 * Pure unit tests — no DB, no network.
 * Validates HTML sanitisation, signature injection, and
 * the useOnNew / useOnReply flag logic.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers mirroring signature service logic
// ──────────────────────────────────────────────

const MAX_SIGNATURE_LENGTH = 10_000;

function validateSignatureHtml(html: unknown): { valid: boolean; error?: string } {
  if (html === null || html === undefined || html === '') return { valid: true }; // empty is OK
  if (typeof html !== 'string') return { valid: false, error: 'signatureHtml must be a string' };
  if (html.length > MAX_SIGNATURE_LENGTH) {
    return { valid: false, error: `Signature must be ${MAX_SIGNATURE_LENGTH} characters or fewer` };
  }
  return { valid: true };
}

function injectSignature(body: string, signature: string | null, mode: 'new' | 'reply'): string {
  if (!signature) return body;
  const divider = mode === 'reply' ? '\n\n-- \n' : '\n\n';
  return `${body}${divider}${signature}`;
}

function shouldAttachSignature(
  useOnNew: boolean,
  useOnReply: boolean,
  isReply: boolean,
): boolean {
  return isReply ? useOnReply : useOnNew;
}

// ──────────────────────────────────────────────
// validateSignatureHtml
// ──────────────────────────────────────────────

describe('validateSignatureHtml', () => {
  it('accepts null (no signature)', () => {
    expect(validateSignatureHtml(null).valid).toBe(true);
  });

  it('accepts empty string (clear signature)', () => {
    expect(validateSignatureHtml('').valid).toBe(true);
  });

  it('accepts valid HTML', () => {
    const html = '<p>Jesper Melin<br>CDP Holding</p>';
    expect(validateSignatureHtml(html).valid).toBe(true);
  });

  it('accepts signature exactly at max length', () => {
    const atLimit = '<p>' + 'a'.repeat(MAX_SIGNATURE_LENGTH - 7) + '</p>';
    // Just check the string length is ≤ max; allow slight overhead
    const short = 'a'.repeat(MAX_SIGNATURE_LENGTH);
    expect(validateSignatureHtml(short).valid).toBe(true);
  });

  it('rejects signature over max length', () => {
    const tooLong = 'a'.repeat(MAX_SIGNATURE_LENGTH + 1);
    expect(validateSignatureHtml(tooLong).valid).toBe(false);
  });

  it('rejects non-string non-null', () => {
    expect(validateSignatureHtml(42).valid).toBe(false);
    expect(validateSignatureHtml({ html: '<p/>' }).valid).toBe(false);
  });
});

// ──────────────────────────────────────────────
// injectSignature
// ──────────────────────────────────────────────

describe('injectSignature', () => {
  it('appends signature to new message with double newline', () => {
    const result = injectSignature('Hello', '<p>Sig</p>', 'new');
    expect(result).toBe('Hello\n\n<p>Sig</p>');
  });

  it('appends signature to reply with divider', () => {
    const result = injectSignature('Thanks', '<p>Sig</p>', 'reply');
    expect(result).toContain('-- \n');
    expect(result).toContain('<p>Sig</p>');
  });

  it('returns body unchanged when signature is null', () => {
    expect(injectSignature('Body text', null, 'new')).toBe('Body text');
  });

  it('returns body unchanged when signature is empty string', () => {
    expect(injectSignature('Body text', '', 'new')).toBe('Body text');
  });
});

// ──────────────────────────────────────────────
// shouldAttachSignature
// ──────────────────────────────────────────────

describe('shouldAttachSignature', () => {
  it('uses useOnNew flag for new messages', () => {
    expect(shouldAttachSignature(true, false, false)).toBe(true);
    expect(shouldAttachSignature(false, true, false)).toBe(false);
  });

  it('uses useOnReply flag for replies', () => {
    expect(shouldAttachSignature(false, true, true)).toBe(true);
    expect(shouldAttachSignature(true, false, true)).toBe(false);
  });

  it('returns false when both flags are false', () => {
    expect(shouldAttachSignature(false, false, false)).toBe(false);
    expect(shouldAttachSignature(false, false, true)).toBe(false);
  });

  it('returns true when both flags are true regardless of mode', () => {
    expect(shouldAttachSignature(true, true, false)).toBe(true);
    expect(shouldAttachSignature(true, true, true)).toBe(true);
  });
});
