/**
 * Tests for attachment download pipeline
 *
 * Pure unit tests — no DB, no network. Tests the base64url conversion
 * and attachment metadata extraction logic.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// base64url → base64 conversion (mirrors gmail.service.ts getAttachment)
// ──────────────────────────────────────────────

function base64urlToBase64(data: string): string {
  return data.replace(/-/g, '+').replace(/_/g, '/');
}

describe('base64url → base64 conversion', () => {
  it('replaces hyphens with plus signs', () => {
    expect(base64urlToBase64('abc-def')).toBe('abc+def');
  });

  it('replaces underscores with slashes', () => {
    expect(base64urlToBase64('abc_def')).toBe('abc/def');
  });

  it('handles mixed replacements', () => {
    expect(base64urlToBase64('a-b_c-d_e')).toBe('a+b/c+d/e');
  });

  it('leaves standard base64 chars unchanged', () => {
    const standard = 'SGVsbG8gV29ybGQ=';
    expect(base64urlToBase64(standard)).toBe(standard);
  });

  it('handles empty string', () => {
    expect(base64urlToBase64('')).toBe('');
  });
});

// ──────────────────────────────────────────────
// Attachment metadata extraction (mirrors gmail.service.ts collectParts)
// ──────────────────────────────────────────────

interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

function collectAttachments(payload: any): AttachmentMeta[] {
  const results: AttachmentMeta[] = [];
  function walk(part: any) {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      results.push({
        filename: part.filename as string,
        mimeType: (part.mimeType ?? '') as string,
        size: Number(part.body?.size ?? 0),
        attachmentId: part.body.attachmentId as string,
      });
    }
    if (part.parts) (part.parts as any[]).forEach(walk);
  }
  walk(payload);
  return results;
}

describe('collectAttachments', () => {
  it('returns empty array for payload with no attachments', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: 'aGVsbG8=' },
    };
    expect(collectAttachments(payload)).toEqual([]);
  });

  it('extracts a single inline attachment', () => {
    const payload = {
      parts: [
        {
          filename: 'invoice.pdf',
          mimeType: 'application/pdf',
          body: { attachmentId: 'att_123', size: 40960 },
        },
      ],
    };
    const result = collectAttachments(payload);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('invoice.pdf');
    expect(result[0].mimeType).toBe('application/pdf');
    expect(result[0].size).toBe(40960);
    expect(result[0].attachmentId).toBe('att_123');
  });

  it('extracts multiple attachments from nested parts', () => {
    const payload = {
      parts: [
        {
          mimeType: 'multipart/mixed',
          parts: [
            {
              filename: 'photo.jpg',
              mimeType: 'image/jpeg',
              body: { attachmentId: 'att_jpg', size: 102400 },
            },
            {
              filename: 'doc.docx',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              body: { attachmentId: 'att_docx', size: 20480 },
            },
          ],
        },
      ],
    };
    const result = collectAttachments(payload);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.filename)).toEqual(['photo.jpg', 'doc.docx']);
  });

  it('skips parts without attachmentId', () => {
    const payload = {
      parts: [
        {
          filename: 'inline-image.png',
          mimeType: 'image/png',
          body: { data: 'base64data', size: 1024 }, // no attachmentId
        },
        {
          filename: 'real-attachment.pdf',
          mimeType: 'application/pdf',
          body: { attachmentId: 'att_pdf', size: 5120 },
        },
      ],
    };
    const result = collectAttachments(payload);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('real-attachment.pdf');
  });

  it('handles null/undefined payload gracefully', () => {
    expect(collectAttachments(null)).toEqual([]);
    expect(collectAttachments(undefined)).toEqual([]);
  });

  it('size defaults to 0 when missing', () => {
    const payload = {
      filename: 'nosize.pdf',
      mimeType: 'application/pdf',
      body: { attachmentId: 'att_nosize' },
    };
    const result = collectAttachments(payload);
    expect(result[0].size).toBe(0);
  });
});
