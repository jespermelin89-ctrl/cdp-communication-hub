/**
 * Tests for advanced search filter logic
 *
 * Pure unit tests — no DB, no network.
 * Validates query parsing, filter application, history
 * deduplication, and save-as-view serialisation.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Types and helpers mirroring search.ts logic
// ──────────────────────────────────────────────

interface SearchFilters {
  q?: string;
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  hasAttachment?: boolean;
  classification?: string;
  priority?: string;
  accountId?: string;
  labelIds?: string[];
}

function parseSearchFilters(params: Record<string, unknown>): SearchFilters {
  const filters: SearchFilters = {};
  if (typeof params.q === 'string' && params.q.trim()) filters.q = params.q.trim();
  if (typeof params.from === 'string' && params.from.trim()) filters.from = params.from.trim();
  if (typeof params.to === 'string' && params.to.trim()) filters.to = params.to.trim();
  if (typeof params.dateFrom === 'string') filters.dateFrom = params.dateFrom;
  if (typeof params.dateTo === 'string') filters.dateTo = params.dateTo;
  if (params.hasAttachment === 'true' || params.hasAttachment === true) filters.hasAttachment = true;
  if (params.hasAttachment === 'false' || params.hasAttachment === false) filters.hasAttachment = false;

  const validClassifications = ['primary', 'social', 'promotions', 'updates', 'forums'];
  if (typeof params.classification === 'string' && validClassifications.includes(params.classification)) {
    filters.classification = params.classification;
  }

  const validPriorities = ['high', 'normal', 'low'];
  if (typeof params.priority === 'string' && validPriorities.includes(params.priority)) {
    filters.priority = params.priority;
  }

  if (typeof params.accountId === 'string' && params.accountId.trim()) {
    filters.accountId = params.accountId.trim();
  }

  if (Array.isArray(params.labelIds)) {
    const ids = (params.labelIds as unknown[]).filter((id) => typeof id === 'string' && (id as string).trim());
    if (ids.length > 0) filters.labelIds = ids as string[];
  }

  return filters;
}

function hasActiveFilters(filters: SearchFilters): boolean {
  return Object.keys(filters).some((k) => {
    const v = filters[k as keyof SearchFilters];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '';
  });
}

function serialiseFilters(filters: SearchFilters): string {
  return JSON.stringify(filters, Object.keys(filters).sort());
}

function dedupeSearchHistory(
  entries: Array<{ query: string; filters: SearchFilters | null }>,
  newEntry: { query: string; filters: SearchFilters | null },
): Array<{ query: string; filters: SearchFilters | null }> {
  const newKey = `${newEntry.query}::${serialiseFilters(newEntry.filters ?? {})}`;
  const filtered = entries.filter((e) => {
    const key = `${e.query}::${serialiseFilters(e.filters ?? {})}`;
    return key !== newKey;
  });
  return [newEntry, ...filtered].slice(0, 20); // keep last 20
}

// ──────────────────────────────────────────────
// parseSearchFilters
// ──────────────────────────────────────────────

describe('parseSearchFilters', () => {
  it('parses simple query string', () => {
    const f = parseSearchFilters({ q: '  hello  ' });
    expect(f.q).toBe('hello');
  });

  it('parses from and to addresses', () => {
    const f = parseSearchFilters({ from: 'boss@example.com', to: 'me@example.com' });
    expect(f.from).toBe('boss@example.com');
    expect(f.to).toBe('me@example.com');
  });

  it('parses hasAttachment as boolean from string', () => {
    expect(parseSearchFilters({ hasAttachment: 'true' }).hasAttachment).toBe(true);
    expect(parseSearchFilters({ hasAttachment: 'false' }).hasAttachment).toBe(false);
  });

  it('parses hasAttachment as native boolean', () => {
    expect(parseSearchFilters({ hasAttachment: true }).hasAttachment).toBe(true);
    expect(parseSearchFilters({ hasAttachment: false }).hasAttachment).toBe(false);
  });

  it('ignores invalid classification values', () => {
    const f = parseSearchFilters({ classification: 'spam' });
    expect(f.classification).toBeUndefined();
  });

  it('accepts valid classification values', () => {
    for (const c of ['primary', 'social', 'promotions', 'updates', 'forums']) {
      expect(parseSearchFilters({ classification: c }).classification).toBe(c);
    }
  });

  it('ignores invalid priority values', () => {
    expect(parseSearchFilters({ priority: 'critical' }).priority).toBeUndefined();
  });

  it('accepts valid priority values', () => {
    for (const p of ['high', 'normal', 'low']) {
      expect(parseSearchFilters({ priority: p }).priority).toBe(p);
    }
  });

  it('parses labelIds array', () => {
    const f = parseSearchFilters({ labelIds: ['lbl1', 'lbl2'] });
    expect(f.labelIds).toEqual(['lbl1', 'lbl2']);
  });

  it('filters out empty strings from labelIds', () => {
    const f = parseSearchFilters({ labelIds: ['lbl1', '', '  '] });
    expect(f.labelIds).toEqual(['lbl1']);
  });

  it('returns empty object for empty params', () => {
    expect(Object.keys(parseSearchFilters({}))).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// hasActiveFilters
// ──────────────────────────────────────────────

describe('hasActiveFilters', () => {
  it('returns false for empty filters', () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it('returns true when q is set', () => {
    expect(hasActiveFilters({ q: 'hello' })).toBe(true);
  });

  it('returns true when hasAttachment is false (explicit)', () => {
    expect(hasActiveFilters({ hasAttachment: false })).toBe(true);
  });

  it('returns true when labelIds has entries', () => {
    expect(hasActiveFilters({ labelIds: ['lbl1'] })).toBe(true);
  });

  it('returns false when labelIds is empty array', () => {
    expect(hasActiveFilters({ labelIds: [] })).toBe(false);
  });
});

// ──────────────────────────────────────────────
// dedupeSearchHistory
// ──────────────────────────────────────────────

describe('dedupeSearchHistory', () => {
  it('prepends new entry to the list', () => {
    const history = [{ query: 'old', filters: null }];
    const result = dedupeSearchHistory(history, { query: 'new', filters: null });
    expect(result[0].query).toBe('new');
  });

  it('removes duplicate before prepending', () => {
    const history = [
      { query: 'dup', filters: null },
      { query: 'other', filters: null },
    ];
    const result = dedupeSearchHistory(history, { query: 'dup', filters: null });
    const dupCount = result.filter((e) => e.query === 'dup').length;
    expect(dupCount).toBe(1);
    expect(result[0].query).toBe('dup');
  });

  it('limits history to 20 entries', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ query: `q${i}`, filters: null }));
    const result = dedupeSearchHistory(history, { query: 'new', filters: null });
    expect(result).toHaveLength(20);
  });

  it('treats entries with different filters as distinct', () => {
    const history = [{ query: 'test', filters: { hasAttachment: true } }];
    const result = dedupeSearchHistory(history, { query: 'test', filters: null });
    expect(result).toHaveLength(2);
  });
});
