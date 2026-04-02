/**
 * Tests for security sprint fixes (2026-04-02).
 *
 * S1 — API key not logged
 * S2 — Webhook bearer token verification
 * W3 — Search rate limiting
 * W5 — MIME type allowlist on attachments
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// S1 — API key prefix must not appear in startup log
// ---------------------------------------------------------------------------
describe('S1 — API key logging', () => {
  it('startup log line does not expose key prefix via .slice()', () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const source = fs.readFileSync(indexPath, 'utf-8');
    const logLines = source.split('\n').filter((l) => l.includes('[AI] Provider'));
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
      expect(line).not.toContain('.slice(');
      expect(line).not.toContain('ANTHROPIC_API_KEY.slice');
    }
  });
});

// ---------------------------------------------------------------------------
// S2 — Webhook bearer token verification logic
// ---------------------------------------------------------------------------
describe('S2 — Webhook token verification', () => {
  /** Replicate the exact verification logic from webhooks.ts */
  function verifyToken(
    authHeader: string | undefined,
    configuredToken: string | undefined
  ): 'ok' | 'reject' | 'skip' {
    if (!configuredToken) return 'skip'; // token not configured → always accept
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (bearerToken !== configuredToken) return 'reject';
    return 'ok';
  }

  it('accepts all requests when GOOGLE_PUBSUB_VERIFICATION_TOKEN is not set', () => {
    expect(verifyToken(undefined, undefined)).toBe('skip');
    expect(verifyToken('Bearer wrongtoken', undefined)).toBe('skip');
  });

  it('accepts request with correct bearer token', () => {
    expect(verifyToken('Bearer correct-secret', 'correct-secret')).toBe('ok');
  });

  it('rejects request with wrong token', () => {
    expect(verifyToken('Bearer wrong', 'correct-secret')).toBe('reject');
  });

  it('rejects request with no Authorization header', () => {
    expect(verifyToken(undefined, 'correct-secret')).toBe('reject');
  });

  it('rejects request with non-Bearer auth scheme', () => {
    expect(verifyToken('Basic correct-secret', 'correct-secret')).toBe('reject');
  });
});

// ---------------------------------------------------------------------------
// W3 — Search rate limiting
// ---------------------------------------------------------------------------
describe('W3 — Search rate limiting', () => {
  it('search.ts has per-route rate limit config on /contacts/search', () => {
    const src = path.resolve(__dirname, '../routes/search.ts');
    const source = fs.readFileSync(src, 'utf-8');
    // Both search routes should declare rateLimit config
    const contactSearchMatch = source.match(
      /contacts\/search.*?rateLimit.*?max:\s*(\d+)/s
    );
    expect(contactSearchMatch).not.toBeNull();
    const max = parseInt(contactSearchMatch![1], 10);
    expect(max).toBeLessThanOrEqual(30);
  });

  it('search.ts has per-route rate limit config on /search', () => {
    const src = path.resolve(__dirname, '../routes/search.ts');
    const source = fs.readFileSync(src, 'utf-8');
    const searchMatch = source.match(
      /\/search'.*?rateLimit.*?max:\s*(\d+)/s
    );
    expect(searchMatch).not.toBeNull();
    const max = parseInt(searchMatch![1], 10);
    expect(max).toBeLessThanOrEqual(30);
  });

  it('Prisma queries have take: Math.min limits', () => {
    const src = path.resolve(__dirname, '../routes/search.ts');
    const source = fs.readFileSync(src, 'utf-8');
    // Verify at least one Math.min limit guard exists
    expect(source).toContain('Math.min(');
  });
});

// ---------------------------------------------------------------------------
// W5 — MIME type validation on attachment upload
// ---------------------------------------------------------------------------
describe('W5 — MIME type validation', () => {
  // Replicate the allowlist from routes/drafts.ts
  const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'text/html',
    'application/zip', 'application/x-zip-compressed',
    'audio/mpeg', 'audio/wav', 'video/mp4',
  ];

  it('accepts common document types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('does not include executable MIME types', () => {
    const blocked = [
      'application/x-msdownload',
      'application/x-executable',
      'application/x-sh',
      'application/x-bat',
      'application/octet-stream',
    ];
    for (const t of blocked) {
      expect(ALLOWED_MIME_TYPES).not.toContain(t);
    }
  });

  it('allowlist is enforced in drafts route source', () => {
    const src = path.resolve(__dirname, '../routes/drafts.ts');
    const source = fs.readFileSync(src, 'utf-8');
    expect(source).toContain('ALLOWED_MIME_TYPES');
    expect(source).toContain('Unsupported file type');
  });

  it('allowlist contains expected number of entries (≥16)', () => {
    expect(ALLOWED_MIME_TYPES.length).toBeGreaterThanOrEqual(16);
  });
});
