/**
 * Cursor pagination — Sprint 8 tests
 *
 * Tests cursor encoding/decoding and hasMore logic.
 */

import { describe, it, expect } from 'vitest';

// ── Cursor helpers (mirrors threads.ts logic) ─────────────────────────────────

function encodeCursor(lastMessageAt: Date, id: string): string {
  return Buffer.from(`${lastMessageAt.toISOString()}::${id}`).toString('base64');
}

function decodeCursor(cursor: string): { lastMessageAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [ts, id] = decoded.split('::');
    if (!ts || !id) return null;
    return { lastMessageAt: new Date(ts), id };
  } catch {
    return null;
  }
}

// ── hasMore from extra-item trick ─────────────────────────────────────────────

function paginateItems<T>(items: T[], limit: number): { page: T[]; hasMore: boolean } {
  const hasMore = items.length > limit;
  return { page: items.slice(0, limit), hasMore };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Cursor pagination', () => {
  it('encodes and decodes cursor correctly', () => {
    const date = new Date('2026-04-01T10:00:00.000Z');
    const id = 'thread-uuid-123';
    const cursor = encodeCursor(date, id);
    const decoded = decodeCursor(cursor);

    expect(decoded).not.toBeNull();
    expect(decoded!.lastMessageAt.toISOString()).toBe(date.toISOString());
    expect(decoded!.id).toBe(id);
  });

  it('returns null for invalid cursor', () => {
    expect(decodeCursor('not-base64!!!')).toBeNull();
    expect(decodeCursor(Buffer.from('no-separator').toString('base64'))).toBeNull();
  });

  it('hasMore is true when more items exist', () => {
    const items = Array.from({ length: 26 }, (_, i) => i);
    const { page, hasMore } = paginateItems(items, 25);
    expect(hasMore).toBe(true);
    expect(page).toHaveLength(25);
  });

  it('hasMore is false on last page', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const { page, hasMore } = paginateItems(items, 25);
    expect(hasMore).toBe(false);
    expect(page).toHaveLength(20);
  });

  it('hasMore is false when items equals limit exactly (no extra item)', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { page, hasMore } = paginateItems(items, 25);
    // Fetched limit+1=26 but only 25 returned means no overflow
    expect(hasMore).toBe(false);
    expect(page).toHaveLength(25);
  });

  it('cursor changes per page', () => {
    const date1 = new Date('2026-04-01T10:00:00.000Z');
    const date2 = new Date('2026-03-31T10:00:00.000Z');
    const c1 = encodeCursor(date1, 'id-1');
    const c2 = encodeCursor(date2, 'id-2');
    expect(c1).not.toBe(c2);
  });

  it('handles IDs with hyphens in cursor correctly', () => {
    const date = new Date('2026-04-01T12:00:00.000Z');
    const id = 'clx1234-abcd-5678-efgh-ijklmnop9012';
    const cursor = encodeCursor(date, id);
    const decoded = decodeCursor(cursor);
    expect(decoded!.id).toBe(id);
  });
});
