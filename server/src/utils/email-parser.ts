/**
 * Email parsing utilities for Gmail API responses.
 * Handles RFC 2822 construction and Gmail message parsing.
 */

/**
 * Extract a header value from Gmail message headers
 */
export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string | undefined {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

/**
 * Parse email addresses from a header value.
 * Handles formats like: "Name <email@example.com>, other@example.com"
 */
export function parseEmailAddresses(headerValue: string): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(',')
    .map((addr) => {
      const match = addr.match(/<(.+?)>/);
      return (match ? match[1] : addr).trim().toLowerCase();
    })
    .filter(Boolean);
}

/**
 * Decode base64url-encoded content from Gmail API
 */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Encode content to base64url for Gmail API
 */
export function encodeBase64Url(data: string): string {
  return Buffer.from(data, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Extract the text body from a Gmail message payload.
 * Handles both simple and multipart messages.
 */
export function extractBody(
  payload: any,
  mimeType: 'text/plain' | 'text/html' = 'text/plain'
): string | null {
  // Simple message
  if (payload.mimeType === mimeType && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart message
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
      if (part.parts) {
        const nested = extractBody(part, mimeType);
        if (nested) return nested;
      }
    }
  }

  return null;
}

/**
 * Build an RFC 2822 email string for sending via Gmail API.
 */
export function buildRfc2822Email(options: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];

  lines.push(`From: ${options.from}`);
  lines.push(`To: ${options.to.join(', ')}`);
  if (options.cc && options.cc.length > 0) {
    lines.push(`Cc: ${options.cc.join(', ')}`);
  }
  if (options.bcc && options.bcc.length > 0) {
    lines.push(`Bcc: ${options.bcc.join(', ')}`);
  }
  lines.push(`Subject: ${options.subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=utf-8');

  // Thread reply headers
  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  if (options.references) {
    lines.push(`References: ${options.references}`);
  }

  lines.push(''); // Blank line separates headers from body
  lines.push(options.body);

  return lines.join('\r\n');
}
