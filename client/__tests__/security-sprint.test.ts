/**
 * Tests for client-side security sprint fixes (2026-04-02).
 *
 * S3 — Signature preview XSS prevention
 * S4 — Compose DOMParser (no innerHTML for text extraction)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// S3 — Signature preview uses sanitizeHtml
// ---------------------------------------------------------------------------
describe('S3 — Signature XSS prevention', () => {
  it('signature preview page imports sanitizeHtml', () => {
    const src = path.resolve(
      __dirname,
      '../app/settings/signatures/page.tsx'
    );
    const source = fs.readFileSync(src, 'utf-8');
    expect(source).toContain("import { sanitizeHtml }");
  });

  it('signature preview uses sanitizeHtml before dangerouslySetInnerHTML', () => {
    const src = path.resolve(
      __dirname,
      '../app/settings/signatures/page.tsx'
    );
    const source = fs.readFileSync(src, 'utf-8');
    // Must wrap htmlContent in sanitizeHtml, not pass it raw
    expect(source).toContain('sanitizeHtml(htmlContent)');
    // Must not pass raw htmlContent directly to __html
    expect(source).not.toContain('__html: htmlContent }');
  });

  it('sanitizeHtml strips script tags', async () => {
    const { sanitizeHtml } = await import('../lib/sanitize-html');
    const malicious = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert("xss")');
    expect(result).toContain('<p>Safe</p>');
  });

  it('sanitizeHtml strips event handlers', async () => {
    const { sanitizeHtml } = await import('../lib/sanitize-html');
    const malicious = '<img src="x" onerror="steal(document.cookie)">';
    const result = sanitizeHtml(malicious);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('steal(');
  });
});

// ---------------------------------------------------------------------------
// S4 — Compose editor uses DOMParser for text extraction
// ---------------------------------------------------------------------------
describe('S4 — Compose DOMParser for plain-text extraction', () => {
  it('compose page uses DOMParser, not innerHTML assignment', () => {
    const src = path.resolve(__dirname, '../app/compose/page.tsx');
    const source = fs.readFileSync(src, 'utf-8');
    expect(source).toContain('new DOMParser()');
    expect(source).toContain("parseFromString(html, 'text/html')");
  });

  it('compose page does not assign html to innerHTML for text extraction', () => {
    const src = path.resolve(__dirname, '../app/compose/page.tsx');
    const source = fs.readFileSync(src, 'utf-8');
    // The old unsafe pattern: tmp.innerHTML = html
    // Note: RichTextEditor itself may use innerHTML internally — we only
    // care about the plain-text extraction block in the onChange handler
    const lines = source.split('\n');
    const extractionBlock = lines
      .filter((l) => l.includes('textContent') || l.includes('DOMParser'))
      .join('\n');
    expect(extractionBlock).toContain('DOMParser');
    expect(extractionBlock).not.toContain('innerHTML = html');
  });
});
