/**
 * Tests for Zod validation schemas (validators.ts)
 *
 * These are pure unit tests — no DB, no network, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
  AIAnalysisSchema,
  CreateDraftSchema,
  UpdateDraftSchema,
  ThreadQuerySchema,
  DraftQuerySchema,
  AnalyzeThreadRequestSchema,
  GenerateDraftRequestSchema,
  SummarizeInboxRequestSchema,
} from '../utils/validators';

// ──────────────────────────────────────────────
// AIAnalysisSchema
// ──────────────────────────────────────────────

describe('AIAnalysisSchema', () => {
  const valid = {
    summary: 'This thread is about a partnership proposal from a fitness brand.',
    classification: 'partner',
    priority: 'high',
    suggested_action: 'reply',
    draft_text: 'Hi, thanks for reaching out...',
    confidence: 0.9,
    model_used: 'llama-3.3-70b-versatile',
  };

  it('accepts a fully valid analysis object', () => {
    expect(() => AIAnalysisSchema.parse(valid)).not.toThrow();
  });

  it('accepts null draft_text', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, draft_text: null })).not.toThrow();
  });

  it('rejects unknown classification', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, classification: 'unknown' })).toThrow();
  });

  it('rejects unknown priority', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, priority: 'critical' })).toThrow();
  });

  it('rejects unknown suggested_action', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, suggested_action: 'delete' })).toThrow();
  });

  it('rejects confidence > 1', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence < 0', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, confidence: -0.1 })).toThrow();
  });

  it('rejects summary shorter than 10 chars', () => {
    expect(() => AIAnalysisSchema.parse({ ...valid, summary: 'Short' })).toThrow();
  });

  it('accepts all valid classifications', () => {
    const classifications = ['lead', 'partner', 'personal', 'spam', 'operational', 'founder', 'outreach'];
    for (const cls of classifications) {
      expect(() => AIAnalysisSchema.parse({ ...valid, classification: cls })).not.toThrow();
    }
  });

  it('accepts all valid priorities', () => {
    for (const p of ['high', 'medium', 'low']) {
      expect(() => AIAnalysisSchema.parse({ ...valid, priority: p })).not.toThrow();
    }
  });

  it('accepts all valid suggested_actions', () => {
    for (const a of ['reply', 'ignore', 'review_later', 'archive_suggestion']) {
      expect(() => AIAnalysisSchema.parse({ ...valid, suggested_action: a, draft_text: a === 'reply' ? 'text' : null })).not.toThrow();
    }
  });
});

// ──────────────────────────────────────────────
// CreateDraftSchema
// ──────────────────────────────────────────────

describe('CreateDraftSchema', () => {
  const valid = {
    account_id: '550e8400-e29b-41d4-a716-446655440000',
    to_addresses: ['recipient@example.com'],
    subject: 'Test email',
    body_text: 'Hello there',
  };

  it('accepts a valid draft', () => {
    expect(() => CreateDraftSchema.parse(valid)).not.toThrow();
  });

  it('accepts optional thread_id, cc_addresses, and bcc_addresses', () => {
    const withOptionals = {
      ...valid,
      thread_id: '550e8400-e29b-41d4-a716-446655440001',
      cc_addresses: ['cc@example.com'],
      bcc_addresses: ['hidden@example.com'],
    };
    expect(() => CreateDraftSchema.parse(withOptionals)).not.toThrow();
  });

  it('rejects invalid account_id (not uuid)', () => {
    expect(() => CreateDraftSchema.parse({ ...valid, account_id: 'not-a-uuid' })).toThrow();
  });

  it('rejects empty to_addresses', () => {
    expect(() => CreateDraftSchema.parse({ ...valid, to_addresses: [] })).toThrow();
  });

  it('rejects invalid email in to_addresses', () => {
    expect(() => CreateDraftSchema.parse({ ...valid, to_addresses: ['not-an-email'] })).toThrow();
  });

  it('rejects empty subject', () => {
    expect(() => CreateDraftSchema.parse({ ...valid, subject: '' })).toThrow();
  });

  it('rejects empty body_text', () => {
    expect(() => CreateDraftSchema.parse({ ...valid, body_text: '' })).toThrow();
  });

  it('defaults cc_addresses and bcc_addresses to empty arrays', () => {
    const result = CreateDraftSchema.parse(valid);
    expect(result.cc_addresses).toEqual([]);
    expect(result.bcc_addresses).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// UpdateDraftSchema
// ──────────────────────────────────────────────

describe('UpdateDraftSchema', () => {
  it('accepts partial updates', () => {
    expect(() => UpdateDraftSchema.parse({ subject: 'New subject' })).not.toThrow();
    expect(() => UpdateDraftSchema.parse({ body_text: 'New body' })).not.toThrow();
    expect(() => UpdateDraftSchema.parse({ to_addresses: ['a@b.com'] })).not.toThrow();
    expect(() => UpdateDraftSchema.parse({ bcc_addresses: ['hidden@example.com'] })).not.toThrow();
  });

  it('accepts empty object (no-op update)', () => {
    expect(() => UpdateDraftSchema.parse({})).not.toThrow();
  });

  it('rejects empty subject string', () => {
    expect(() => UpdateDraftSchema.parse({ subject: '' })).toThrow();
  });
});

// ──────────────────────────────────────────────
// ThreadQuerySchema
// ──────────────────────────────────────────────

describe('ThreadQuerySchema', () => {
  it('uses defaults for page and limit', () => {
    const result = ThreadQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
  });

  it('coerces string numbers to integers', () => {
    const result = ThreadQuerySchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects limit > 100', () => {
    expect(() => ThreadQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects page < 1', () => {
    expect(() => ThreadQuerySchema.parse({ page: 0 })).toThrow();
  });
});

// ──────────────────────────────────────────────
// DraftQuerySchema
// ──────────────────────────────────────────────

describe('DraftQuerySchema', () => {
  it('accepts valid statuses', () => {
    for (const s of ['pending', 'approved', 'sent', 'failed', 'discarded']) {
      expect(() => DraftQuerySchema.parse({ status: s })).not.toThrow();
    }
  });

  it('rejects unknown status', () => {
    expect(() => DraftQuerySchema.parse({ status: 'deleted' })).toThrow();
  });
});

// ──────────────────────────────────────────────
// AI Request Schemas
// ──────────────────────────────────────────────

describe('AnalyzeThreadRequestSchema', () => {
  it('accepts valid uuid', () => {
    expect(() => AnalyzeThreadRequestSchema.parse({ thread_id: '550e8400-e29b-41d4-a716-446655440000' })).not.toThrow();
  });

  it('rejects non-uuid', () => {
    expect(() => AnalyzeThreadRequestSchema.parse({ thread_id: 'abc123' })).toThrow();
  });

  it('rejects missing thread_id', () => {
    expect(() => AnalyzeThreadRequestSchema.parse({})).toThrow();
  });
});

describe('GenerateDraftRequestSchema', () => {
  const valid = {
    account_id: '550e8400-e29b-41d4-a716-446655440000',
    instruction: 'Write a follow-up email about the partnership proposal',
  };

  it('accepts minimal valid input', () => {
    expect(() => GenerateDraftRequestSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty instruction', () => {
    expect(() => GenerateDraftRequestSchema.parse({ ...valid, instruction: '' })).toThrow();
  });

  it('rejects instruction > 2000 chars', () => {
    expect(() => GenerateDraftRequestSchema.parse({ ...valid, instruction: 'x'.repeat(2001) })).toThrow();
  });
});

describe('SummarizeInboxRequestSchema', () => {
  it('accepts valid account_id', () => {
    expect(() => SummarizeInboxRequestSchema.parse({ account_id: '550e8400-e29b-41d4-a716-446655440000' })).not.toThrow();
  });

  it('rejects missing account_id', () => {
    expect(() => SummarizeInboxRequestSchema.parse({})).toThrow();
  });
});
