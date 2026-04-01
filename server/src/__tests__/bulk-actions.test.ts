/**
 * Tests for bulk-action helpers
 *
 * Pure unit tests — no DB, no network.
 * Validates the request-body parsing and deduplication logic
 * used in POST /threads/bulk/*.
 */

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────
// Helpers that mirror the bulk-action route logic
// ──────────────────────────────────────────────

function parseBulkBody(body: unknown): { threadIds: string[]; error?: string } {
  if (!body || typeof body !== 'object') return { threadIds: [], error: 'Body must be an object' };
  const { threadIds } = body as Record<string, unknown>;
  if (!Array.isArray(threadIds)) return { threadIds: [], error: 'threadIds must be an array' };
  if (threadIds.length === 0) return { threadIds: [], error: 'threadIds must not be empty' };
  if (threadIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return { threadIds: [], error: 'Each threadId must be a non-empty string' };
  }
  const deduped = [...new Set(threadIds as string[])];
  return { threadIds: deduped };
}

function parseBulkClassify(body: unknown): {
  threadIds: string[];
  classification: string;
  error?: string;
} {
  const { threadIds, error } = parseBulkBody(body);
  if (error) return { threadIds: [], classification: '', error };
  const { classification } = body as Record<string, unknown>;
  const allowed = ['primary', 'social', 'promotions', 'updates', 'forums'];
  if (!classification || !allowed.includes(classification as string)) {
    return { threadIds: [], classification: '', error: `classification must be one of: ${allowed.join(', ')}` };
  }
  return { threadIds, classification: classification as string };
}

function parseBulkPriority(body: unknown): {
  threadIds: string[];
  priority: string;
  error?: string;
} {
  const { threadIds, error } = parseBulkBody(body);
  if (error) return { threadIds: [], priority: '', error };
  const { priority } = body as Record<string, unknown>;
  const allowed = ['high', 'normal', 'low'];
  if (!priority || !allowed.includes(priority as string)) {
    return { threadIds: [], priority: '', error: `priority must be one of: ${allowed.join(', ')}` };
  }
  return { threadIds, priority: priority as string };
}

// ──────────────────────────────────────────────
// parseBulkBody
// ──────────────────────────────────────────────

describe('parseBulkBody', () => {
  it('accepts valid threadIds array', () => {
    const result = parseBulkBody({ threadIds: ['a', 'b', 'c'] });
    expect(result.error).toBeUndefined();
    expect(result.threadIds).toEqual(['a', 'b', 'c']);
  });

  it('deduplicates repeated IDs', () => {
    const result = parseBulkBody({ threadIds: ['a', 'b', 'a', 'c', 'b'] });
    expect(result.threadIds).toEqual(['a', 'b', 'c']);
  });

  it('rejects non-object body', () => {
    expect(parseBulkBody(null).error).toBeTruthy();
    expect(parseBulkBody('string').error).toBeTruthy();
  });

  it('rejects missing threadIds', () => {
    expect(parseBulkBody({}).error).toBeTruthy();
  });

  it('rejects empty array', () => {
    expect(parseBulkBody({ threadIds: [] }).error).toBeTruthy();
  });

  it('rejects array with empty string', () => {
    expect(parseBulkBody({ threadIds: ['a', ''] }).error).toBeTruthy();
  });

  it('rejects array with non-string element', () => {
    expect(parseBulkBody({ threadIds: ['a', 42] }).error).toBeTruthy();
  });
});

// ──────────────────────────────────────────────
// parseBulkClassify
// ──────────────────────────────────────────────

describe('parseBulkClassify', () => {
  it('accepts valid classification values', () => {
    for (const c of ['primary', 'social', 'promotions', 'updates', 'forums']) {
      const result = parseBulkClassify({ threadIds: ['id1'], classification: c });
      expect(result.error).toBeUndefined();
      expect(result.classification).toBe(c);
    }
  });

  it('rejects invalid classification', () => {
    expect(parseBulkClassify({ threadIds: ['id1'], classification: 'spam' }).error).toBeTruthy();
  });

  it('rejects missing classification', () => {
    expect(parseBulkClassify({ threadIds: ['id1'] }).error).toBeTruthy();
  });

  it('propagates threadIds error', () => {
    expect(parseBulkClassify({ threadIds: [], classification: 'primary' }).error).toBeTruthy();
  });
});

// ──────────────────────────────────────────────
// parseBulkPriority
// ──────────────────────────────────────────────

describe('parseBulkPriority', () => {
  it('accepts valid priority values', () => {
    for (const p of ['high', 'normal', 'low']) {
      const result = parseBulkPriority({ threadIds: ['id1'], priority: p });
      expect(result.error).toBeUndefined();
      expect(result.priority).toBe(p);
    }
  });

  it('rejects invalid priority', () => {
    expect(parseBulkPriority({ threadIds: ['id1'], priority: 'critical' }).error).toBeTruthy();
  });

  it('rejects missing priority', () => {
    expect(parseBulkPriority({ threadIds: ['id1'] }).error).toBeTruthy();
  });
});
