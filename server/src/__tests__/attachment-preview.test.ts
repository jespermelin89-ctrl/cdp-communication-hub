/**
 * Tests for attachment preview / MIME classification logic
 *
 * Pure unit tests — no DB, no network.
 * Validates MIME-to-category mapping and inline-display decisions
 * used in AttachmentPreview component and /attachments/:id/data route.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers mirroring client + server attachment logic
// ──────────────────────────────────────────────

type AttachmentCategory = 'image' | 'pdf' | 'spreadsheet' | 'document' | 'archive' | 'audio' | 'video' | 'other';

function categoriseMime(mimeType: string): AttachmentCategory {
  const m = mimeType.toLowerCase().split(';')[0].trim();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    m === 'text/csv'
  ) return 'spreadsheet';
  if (
    m === 'application/msword' ||
    m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    m === 'text/plain' ||
    m === 'text/html'
  ) return 'document';
  if (
    m === 'application/zip' ||
    m === 'application/x-rar-compressed' ||
    m === 'application/x-7z-compressed' ||
    m === 'application/gzip'
  ) return 'archive';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'other';
}

function canShowInline(category: AttachmentCategory): boolean {
  return category === 'image' || category === 'pdf';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isSafeAttachmentFilename(filename: string): boolean {
  // Basic check — no path traversal, no null bytes
  if (filename.includes('\0')) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (filename === '.' || filename === '..') return false;
  return filename.trim().length > 0;
}

// ──────────────────────────────────────────────
// categoriseMime
// ──────────────────────────────────────────────

describe('categoriseMime', () => {
  it('categorises image types', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']) {
      expect(categoriseMime(m)).toBe('image');
    }
  });

  it('categorises PDF', () => {
    expect(categoriseMime('application/pdf')).toBe('pdf');
  });

  it('categorises spreadsheets', () => {
    expect(categoriseMime('application/vnd.ms-excel')).toBe('spreadsheet');
    expect(categoriseMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet');
    expect(categoriseMime('text/csv')).toBe('spreadsheet');
  });

  it('categorises documents', () => {
    expect(categoriseMime('application/msword')).toBe('document');
    expect(categoriseMime('text/plain')).toBe('document');
  });

  it('categorises archives', () => {
    expect(categoriseMime('application/zip')).toBe('archive');
    expect(categoriseMime('application/x-7z-compressed')).toBe('archive');
  });

  it('categorises audio', () => {
    expect(categoriseMime('audio/mpeg')).toBe('audio');
    expect(categoriseMime('audio/wav')).toBe('audio');
  });

  it('categorises video', () => {
    expect(categoriseMime('video/mp4')).toBe('video');
  });

  it('returns other for unknown types', () => {
    expect(categoriseMime('application/octet-stream')).toBe('other');
    expect(categoriseMime('application/x-custom')).toBe('other');
  });

  it('strips charset from mime type', () => {
    expect(categoriseMime('text/plain; charset=utf-8')).toBe('document');
  });
});

// ──────────────────────────────────────────────
// canShowInline
// ──────────────────────────────────────────────

describe('canShowInline', () => {
  it('allows inline for image and pdf', () => {
    expect(canShowInline('image')).toBe(true);
    expect(canShowInline('pdf')).toBe(true);
  });

  it('disallows inline for other categories', () => {
    for (const c of ['spreadsheet', 'document', 'archive', 'audio', 'video', 'other'] as AttachmentCategory[]) {
      expect(canShowInline(c)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// formatFileSize
// ──────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });
});

// ──────────────────────────────────────────────
// isSafeAttachmentFilename
// ──────────────────────────────────────────────

describe('isSafeAttachmentFilename', () => {
  it('accepts normal filenames', () => {
    expect(isSafeAttachmentFilename('invoice.pdf')).toBe(true);
    expect(isSafeAttachmentFilename('photo_2024.jpg')).toBe(true);
  });

  it('rejects path traversal with forward slash', () => {
    expect(isSafeAttachmentFilename('../secret.txt')).toBe(false);
    expect(isSafeAttachmentFilename('/etc/passwd')).toBe(false);
  });

  it('rejects backslash path traversal', () => {
    expect(isSafeAttachmentFilename('..\\secret.txt')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isSafeAttachmentFilename('file\0.txt')).toBe(false);
  });

  it('rejects dot-only names', () => {
    expect(isSafeAttachmentFilename('.')).toBe(false);
    expect(isSafeAttachmentFilename('..')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeAttachmentFilename('')).toBe(false);
    expect(isSafeAttachmentFilename('   ')).toBe(false);
  });
});
