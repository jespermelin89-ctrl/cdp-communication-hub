/**
 * Server smoke tests — lightweight checks on pure utility logic.
 *
 * Covers:
 *  1. cleanJsonResponse — markdown fence stripping
 *  2. matchClassificationRule — sender/subject pattern matching
 *  3. Chat route — AI fallback keyword exclusion logic
 */

import { describe, it, expect } from 'vitest';

// ── cleanJsonResponse (duplicate of production function for isolation) ─────────

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

describe('cleanJsonResponse — smoke', () => {
  it('returns clean JSON unchanged', () => {
    expect(cleanJsonResponse('{"a":1}')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(cleanJsonResponse('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips plain ``` fences', () => {
    expect(cleanJsonResponse('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('extracts JSON from surrounding prose text', () => {
    expect(cleanJsonResponse('Here you go: {"x":"y"} done.')).toBe('{"x":"y"}');
  });

  it('handles deeply nested objects', () => {
    const input = '{"a":{"b":{"c":3}}}';
    expect(cleanJsonResponse(input)).toBe(input);
  });
});

// ── matchClassificationRule ───────────────────────────────────────────────────

interface SenderRule {
  senderPattern: string;
  subjectPattern?: string | null;
  isRegex: boolean;
}

function matchClassificationRule(
  rule: SenderRule,
  sender: string,
  subject: string
): boolean {
  try {
    const senderMatch = rule.isRegex
      ? new RegExp(rule.senderPattern, 'i').test(sender)
      : sender.toLowerCase().includes(rule.senderPattern.toLowerCase());

    if (!senderMatch) return false;
    if (!rule.subjectPattern) return true;

    return rule.isRegex
      ? new RegExp(rule.subjectPattern, 'i').test(subject)
      : subject.toLowerCase().includes(rule.subjectPattern.toLowerCase());
  } catch {
    return false;
  }
}

describe('matchClassificationRule — smoke', () => {
  it('matches exact sender substring', () => {
    const rule: SenderRule = { senderPattern: 'noreply@github.com', isRegex: false };
    expect(matchClassificationRule(rule, 'noreply@github.com', 'PR merged')).toBe(true);
  });

  it('does not match wrong sender', () => {
    const rule: SenderRule = { senderPattern: 'noreply@github.com', isRegex: false };
    expect(matchClassificationRule(rule, 'info@company.com', 'Hello')).toBe(false);
  });

  it('applies subject pattern filter (plain)', () => {
    const rule: SenderRule = { senderPattern: '@github.com', subjectPattern: 'Run failed', isRegex: false };
    expect(matchClassificationRule(rule, 'noreply@github.com', 'Run failed: ci.yml')).toBe(true);
    expect(matchClassificationRule(rule, 'noreply@github.com', 'PR opened')).toBe(false);
  });

  it('matches regex sender pattern', () => {
    const rule: SenderRule = { senderPattern: 'no.?reply@', isRegex: true };
    expect(matchClassificationRule(rule, 'noreply@example.com', 'test')).toBe(true);
    expect(matchClassificationRule(rule, 'no-reply@example.com', 'test')).toBe(true);
    expect(matchClassificationRule(rule, 'info@example.com', 'test')).toBe(false);
  });

  it('returns false for invalid regex without throwing', () => {
    const rule: SenderRule = { senderPattern: '[invalid', isRegex: true };
    expect(() => matchClassificationRule(rule, 'any@example.com', 'test')).not.toThrow();
    expect(matchClassificationRule(rule, 'any@example.com', 'test')).toBe(false);
  });

  it('sender match with no subject pattern always returns true', () => {
    const rule: SenderRule = { senderPattern: 'acme.com', isRegex: false, subjectPattern: null };
    expect(matchClassificationRule(rule, 'billing@acme.com', 'Invoice #123')).toBe(true);
  });
});

// ── Chat route — keyword routing logic ───────────────────────────────────────

function resolveKeywordIntent(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('sammanfatt') || m.includes('summary') || m.includes('överblick')) return 'inbox_summary';
  if (m.includes('skräp') || m.includes('spam') || m.includes('block')) return 'spam';
  if (m.includes('regler') || m.includes('rules') || m.includes('filter')) return 'list_rules';
  if (m.includes('kategorier') || m.includes('categories')) return 'list_categories';
  if (m.includes('viktig') || m.includes('priorit')) return 'high_priority';
  if (m.includes('oläs') || m.includes('unread')) return 'unread';
  return 'ai_fallback';
}

describe('chat route — keyword intent resolver', () => {
  it('routes summary keywords to inbox_summary', () => {
    expect(resolveKeywordIntent('Sammanfatta min inkorg')).toBe('inbox_summary');
    expect(resolveKeywordIntent('Give me a summary')).toBe('inbox_summary');
  });

  it('routes spam keywords to spam', () => {
    expect(resolveKeywordIntent('markera som skräp')).toBe('spam');
    expect(resolveKeywordIntent('block this sender')).toBe('spam');
  });

  it('routes rules/filter keywords', () => {
    expect(resolveKeywordIntent('visa mina regler')).toBe('list_rules');
    expect(resolveKeywordIntent('list my filters')).toBe('list_rules');
  });

  it('routes category keywords', () => {
    expect(resolveKeywordIntent('visa kategorier')).toBe('list_categories');
  });

  it('routes priority keywords', () => {
    expect(resolveKeywordIntent('visa viktiga mail')).toBe('high_priority');
  });

  it('routes unread keywords', () => {
    expect(resolveKeywordIntent('olästa mail')).toBe('unread');
    expect(resolveKeywordIntent('show unread')).toBe('unread');
  });

  it('falls through to ai_fallback for unknown queries', () => {
    expect(resolveKeywordIntent('Hur mår du Amanda?')).toBe('ai_fallback');
    expect(resolveKeywordIntent('Vad ska jag svara på det här mailet?')).toBe('ai_fallback');
    expect(resolveKeywordIntent('')).toBe('ai_fallback');
  });
});
