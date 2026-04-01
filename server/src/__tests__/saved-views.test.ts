/**
 * Tests for saved views / smart filter logic (Sprint 5 / v1.1)
 *
 * Pure unit tests — no DB, no network required.
 */

import { describe, it, expect } from 'vitest';

// ── Filter application ─────────────────────────────────────────────────────

interface ThreadStub {
  classification: string | null;
  priority: string | null;
  isRead: boolean;
  labels: string[];
  subject: string | null;
}

interface ViewFilters {
  classification?: string;
  priority?: string;
  isRead?: boolean;
  label?: string;
  search?: string;
}

function applyViewFilters(threads: ThreadStub[], filters: ViewFilters): ThreadStub[] {
  return threads.filter((t) => {
    if (filters.classification && t.classification !== filters.classification) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.isRead !== undefined && t.isRead !== filters.isRead) return false;
    if (filters.label && !t.labels.includes(filters.label)) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!(t.subject ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

const SAMPLE_THREADS: ThreadStub[] = [
  { classification: 'lead', priority: 'high', isRead: false, labels: ['STARRED'], subject: 'Partnership proposal' },
  { classification: 'lead', priority: 'medium', isRead: true, labels: [], subject: 'Follow up on demo' },
  { classification: 'spam', priority: 'low', isRead: true, labels: [], subject: 'Win a prize' },
  { classification: 'operational', priority: 'low', isRead: false, labels: ['STARRED'], subject: 'Invoice #123' },
  { classification: 'personal', priority: 'medium', isRead: true, labels: [], subject: 'Weekend plans' },
];

describe('applyViewFilters', () => {
  it('filters by classification', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { classification: 'lead' });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.classification === 'lead')).toBe(true);
  });

  it('filters by priority', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { priority: 'high' });
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Partnership proposal');
  });

  it('filters unread', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { isRead: false });
    expect(result).toHaveLength(2);
  });

  it('filters by label', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { label: 'STARRED' });
    expect(result).toHaveLength(2);
  });

  it('filters by search text (subject)', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { search: 'invoice' });
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('Invoice #123');
  });

  it('combines multiple filters', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { classification: 'lead', isRead: false });
    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe('high');
  });

  it('returns all threads when no filters', () => {
    const result = applyViewFilters(SAMPLE_THREADS, {});
    expect(result).toHaveLength(SAMPLE_THREADS.length);
  });

  it('returns empty array when nothing matches', () => {
    const result = applyViewFilters(SAMPLE_THREADS, { classification: 'nonexistent' });
    expect(result).toHaveLength(0);
  });
});

// ── View reorder ──────────────────────────────────────────────────────────

function reorderViews(
  views: { id: string; sortOrder: number }[],
  orderedIds: string[]
): { id: string; sortOrder: number }[] {
  return orderedIds.map((id, index) => {
    const view = views.find((v) => v.id === id);
    if (!view) throw new Error(`View not found: ${id}`);
    return { ...view, sortOrder: index };
  });
}

describe('reorderViews', () => {
  const views = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
    { id: 'c', sortOrder: 2 },
  ];

  it('assigns correct sort orders', () => {
    const result = reorderViews(views, ['c', 'a', 'b']);
    expect(result.find((v) => v.id === 'c')?.sortOrder).toBe(0);
    expect(result.find((v) => v.id === 'a')?.sortOrder).toBe(1);
    expect(result.find((v) => v.id === 'b')?.sortOrder).toBe(2);
  });

  it('throws for unknown id', () => {
    expect(() => reorderViews(views, ['z'])).toThrow();
  });
});
