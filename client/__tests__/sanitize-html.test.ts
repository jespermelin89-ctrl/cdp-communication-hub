/**
 * Tests for the sanitize-html utility
 *
 * Verifies that the sanitizer strips dangerous content and preserves
 * safe HTML structure. No DOM environment needed — all string-based.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../lib/sanitize-html';

describe('sanitizeHtml — script removal', () => {
  it('removes <script> tags and their content', () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert("xss")');
    expect(result).toContain('<p>Hello</p>');
  });

  it('removes multi-line script blocks', () => {
    const html = '<p>text</p><script type="text/javascript">\nconsole.log("evil");\n</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('console.log');
  });
});

describe('sanitizeHtml — style removal', () => {
  it('removes <style> tags', () => {
    const result = sanitizeHtml('<style>body { display: none; }</style><p>Safe</p>');
    expect(result).not.toContain('<style>');
    expect(result).not.toContain('display: none');
    expect(result).toContain('<p>Safe</p>');
  });
});

describe('sanitizeHtml — event handler removal', () => {
  it('strips onclick handlers (double-quoted)', () => {
    const result = sanitizeHtml('<a onclick="evil()">click</a>');
    expect(result).not.toContain('onclick');
  });

  it('strips onmouseover handlers (single-quoted)', () => {
    const result = sanitizeHtml("<img onmouseover='evil()' src='x.jpg'>");
    expect(result).not.toContain('onmouseover');
  });

  it('strips onerror handlers', () => {
    const result = sanitizeHtml('<img onerror=evil() src="x.jpg">');
    expect(result).not.toContain('onerror');
  });
});

describe('sanitizeHtml — javascript: URL removal', () => {
  it('removes javascript: hrefs (double-quoted)', () => {
    const result = sanitizeHtml('<a href="javascript:evil()">link</a>');
    expect(result).not.toContain('javascript:');
  });

  it('removes javascript: hrefs (single-quoted)', () => {
    const result = sanitizeHtml("<a href='javascript:void(0)'>link</a>");
    expect(result).not.toContain('javascript:');
  });
});

describe('sanitizeHtml — dangerous element removal', () => {
  it('removes <iframe>', () => {
    const result = sanitizeHtml('<p>text</p><iframe src="evil.com"></iframe>');
    expect(result).not.toContain('iframe');
  });

  it('removes <form>', () => {
    const result = sanitizeHtml('<form action="evil.com"><input name="x"></form><p>ok</p>');
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
  });

  it('removes <object> and <embed>', () => {
    const result = sanitizeHtml('<object data="evil.swf"></object><embed src="evil.swf">');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });
});

describe('sanitizeHtml — data URI restriction', () => {
  it('removes non-image data URIs from src', () => {
    const result = sanitizeHtml('<script src="data:text/javascript,alert(1)"></script>');
    // script already removed, but also test on an img-like element
    const result2 = sanitizeHtml('<audio src="data:audio/ogg,evil">');
    expect(result2).not.toContain('data:audio');
  });

  it('preserves image data URIs', () => {
    const result = sanitizeHtml('<img src="data:image/png;base64,abc123">');
    expect(result).toContain('data:image/png');
  });
});

describe('sanitizeHtml — link target injection', () => {
  it('adds target="_blank" and rel="noopener noreferrer" to links', () => {
    const result = sanitizeHtml('<a href="https://example.com">visit</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});

describe('sanitizeHtml — safe content preservation', () => {
  it('preserves safe HTML tags', () => {
    const html = '<p>Hello <strong>World</strong></p><ul><li>Item</li></ul>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>World</strong>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item</li>');
  });

  it('preserves blockquotes', () => {
    const html = '<blockquote>Quoted text</blockquote>';
    const result = sanitizeHtml(html);
    expect(result).toContain('<blockquote>');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
