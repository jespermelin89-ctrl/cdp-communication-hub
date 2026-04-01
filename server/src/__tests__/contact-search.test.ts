/**
 * Tests for contact search / autocomplete logic
 *
 * Pure unit tests — no DB, no network.
 * Validates query normalisation, result ranking, and
 * deduplication used in GET /contacts/search.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

interface ContactResult {
  id: string;
  name: string | null;
  email: string;
  frequency?: number; // how often this contact has been emailed
}

function normaliseQuery(q: unknown): string {
  if (typeof q !== 'string') return '';
  return q.trim().toLowerCase();
}

function filterContacts(contacts: ContactResult[], query: string): ContactResult[] {
  if (!query) return contacts;
  return contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(query) ||
      (c.name && c.name.toLowerCase().includes(query)),
  );
}

function rankContacts(contacts: ContactResult[]): ContactResult[] {
  return [...contacts].sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
}

function dedupeByEmail(contacts: ContactResult[]): ContactResult[] {
  const seen = new Set<string>();
  return contacts.filter((c) => {
    const key = c.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function limitResults(contacts: ContactResult[], limit: number): ContactResult[] {
  const n = Math.max(1, Math.min(limit, 50));
  return contacts.slice(0, n);
}

// ──────────────────────────────────────────────
// Sample data
// ──────────────────────────────────────────────

const CONTACTS: ContactResult[] = [
  { id: '1', name: 'Anna Karlsson', email: 'anna@example.com', frequency: 12 },
  { id: '2', name: 'Björn Lindgren', email: 'bjorn@example.com', frequency: 5 },
  { id: '3', name: null, email: 'noreply@example.com', frequency: 0 },
  { id: '4', name: 'Anna Smith', email: 'anna.smith@other.com', frequency: 8 },
  { id: '5', name: 'Carl Lund', email: 'carl@example.com', frequency: 20 },
];

// ──────────────────────────────────────────────
// normaliseQuery
// ──────────────────────────────────────────────

describe('normaliseQuery', () => {
  it('lowercases and trims', () => {
    expect(normaliseQuery('  ANNA  ')).toBe('anna');
  });

  it('returns empty string for non-string input', () => {
    expect(normaliseQuery(null)).toBe('');
    expect(normaliseQuery(undefined)).toBe('');
    expect(normaliseQuery(42)).toBe('');
  });

  it('preserves multi-word query', () => {
    expect(normaliseQuery('Anna Karlsson')).toBe('anna karlsson');
  });
});

// ──────────────────────────────────────────────
// filterContacts
// ──────────────────────────────────────────────

describe('filterContacts', () => {
  it('returns all contacts when query is empty', () => {
    expect(filterContacts(CONTACTS, '')).toHaveLength(CONTACTS.length);
  });

  it('matches by email', () => {
    const results = filterContacts(CONTACTS, 'anna@example');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('matches by name (case insensitive)', () => {
    const results = filterContacts(CONTACTS, 'anna');
    // Should match Anna Karlsson and Anna Smith
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toContain('1');
    expect(results.map((r) => r.id)).toContain('4');
  });

  it('does not fail on contacts with null name', () => {
    const results = filterContacts(CONTACTS, 'noreply');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('3');
  });

  it('returns empty array when no match', () => {
    expect(filterContacts(CONTACTS, 'zzznotfound')).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// rankContacts
// ──────────────────────────────────────────────

describe('rankContacts', () => {
  it('orders by frequency descending', () => {
    const ranked = rankContacts(CONTACTS);
    const frequencies = ranked.map((c) => c.frequency ?? 0);
    expect(frequencies).toEqual([...frequencies].sort((a, b) => b - a));
  });

  it('treats missing frequency as 0', () => {
    const contacts: ContactResult[] = [
      { id: 'a', name: 'A', email: 'a@x.com' },
      { id: 'b', name: 'B', email: 'b@x.com', frequency: 5 },
    ];
    const ranked = rankContacts(contacts);
    expect(ranked[0].id).toBe('b');
  });
});

// ──────────────────────────────────────────────
// dedupeByEmail
// ──────────────────────────────────────────────

describe('dedupeByEmail', () => {
  it('removes duplicates by email (case-insensitive)', () => {
    const dupes: ContactResult[] = [
      { id: '1', name: 'A', email: 'test@EXAMPLE.COM' },
      { id: '2', name: 'B', email: 'test@example.com' },
    ];
    const result = dedupeByEmail(dupes);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('keeps first occurrence', () => {
    const contacts: ContactResult[] = [
      { id: 'first', name: 'First', email: 'same@x.com' },
      { id: 'second', name: 'Second', email: 'same@x.com' },
    ];
    expect(dedupeByEmail(contacts)[0].id).toBe('first');
  });

  it('returns original list when no duplicates', () => {
    expect(dedupeByEmail(CONTACTS)).toHaveLength(CONTACTS.length);
  });
});

// ──────────────────────────────────────────────
// limitResults
// ──────────────────────────────────────────────

describe('limitResults', () => {
  const arr = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    name: null,
    email: `user${i}@x.com`,
  }));

  it('limits to the requested count', () => {
    expect(limitResults(arr, 5)).toHaveLength(5);
  });

  it('clamps limit to maximum of 50', () => {
    const large = Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: null, email: `u${i}@x.com` }));
    expect(limitResults(large, 100)).toHaveLength(50);
  });

  it('clamps limit to minimum of 1', () => {
    expect(limitResults(arr, 0)).toHaveLength(1);
    expect(limitResults(arr, -5)).toHaveLength(1);
  });

  it('returns all when array is smaller than limit', () => {
    const small = [{ id: '1', name: null, email: 'a@x.com' }];
    expect(limitResults(small, 10)).toHaveLength(1);
  });
});
