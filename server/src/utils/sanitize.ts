/**
 * Input sanitization helpers.
 * Applied at API boundaries before values reach Prisma or Gmail API.
 */

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Sanitize a Gmail label name.
 * Keeps uppercase ASCII letters, digits, Swedish chars (ÅÄÖåäö), hyphen and underscore.
 * Truncates to 50 characters.
 */
export function sanitizeLabel(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9ÅÄÖÆØÜ_\-]/gi, '')
    .slice(0, 50);
}

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Sanitize a search query string.
 * Strips control characters, trims whitespace, truncates to 200 chars.
 */
export function sanitizeSearch(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 200);
}
