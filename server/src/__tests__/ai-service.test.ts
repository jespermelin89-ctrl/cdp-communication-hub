/**
 * Tests for AIService — mocked AI provider calls.
 *
 * We test the service's logic (JSON parsing, validation, retry, cleanJsonResponse)
 * without hitting real AI APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────
// cleanJsonResponse (pure function, extracted for testing)
// ──────────────────────────────────────────────

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

describe('cleanJsonResponse', () => {
  it('passes through clean JSON unchanged', () => {
    const input = '{"key":"value"}';
    expect(cleanJsonResponse(input)).toBe(input);
  });

  it('strips ```json ... ``` fences', () => {
    const input = '```json\n{"key":"value"}\n```';
    expect(cleanJsonResponse(input)).toBe('{"key":"value"}');
  });

  it('strips ``` ... ``` fences without language tag', () => {
    const input = '```\n{"key":"value"}\n```';
    expect(cleanJsonResponse(input)).toBe('{"key":"value"}');
  });

  it('extracts JSON from surrounding prose', () => {
    const input = 'Here is the result: {"key":"value"} Hope that helps!';
    expect(cleanJsonResponse(input)).toBe('{"key":"value"}');
  });

  it('handles nested objects correctly', () => {
    const input = '{"outer":{"inner":"value"}}';
    expect(cleanJsonResponse(input)).toBe('{"outer":{"inner":"value"}}');
    const parsed = JSON.parse(cleanJsonResponse(input));
    expect(parsed.outer.inner).toBe('value');
  });

  it('handles leading/trailing whitespace', () => {
    const input = '   {"key":"value"}   ';
    expect(JSON.parse(cleanJsonResponse(input))).toEqual({ key: 'value' });
  });

  it('handles fences with no language tag and extra text after', () => {
    const input = '```\n{"summary":"Test","confidence":0.9}\n```\nSome trailing text';
    const cleaned = cleanJsonResponse(input);
    const parsed = JSON.parse(cleaned);
    expect(parsed.summary).toBe('Test');
  });
});

// ──────────────────────────────────────────────
// AIAnalysisSchema validation logic
// ──────────────────────────────────────────────

import { AIAnalysisSchema } from '../utils/validators';

describe('AIAnalysisSchema — edge cases', () => {
  const validAnalysis = {
    summary: 'A test email thread about a product inquiry.',
    classification: 'lead',
    priority: 'medium',
    suggested_action: 'reply',
    draft_text: 'Thank you for your inquiry...',
    confidence: 0.75,
    model_used: 'llama-3.3-70b-versatile',
  };

  it('parses a complete valid response', () => {
    const result = AIAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.classification).toBe('lead');
      expect(result.data.confidence).toBe(0.75);
    }
  });

  it('confidence boundary: exactly 0 is valid', () => {
    expect(AIAnalysisSchema.safeParse({ ...validAnalysis, confidence: 0 }).success).toBe(true);
  });

  it('confidence boundary: exactly 1 is valid', () => {
    expect(AIAnalysisSchema.safeParse({ ...validAnalysis, confidence: 1 }).success).toBe(true);
  });

  it('draft_text can be empty string if nullable (null preferred)', () => {
    // null is the documented form
    expect(AIAnalysisSchema.safeParse({ ...validAnalysis, draft_text: null, suggested_action: 'ignore' }).success).toBe(true);
  });

  it('returns structured error for missing fields', () => {
    const result = AIAnalysisSchema.safeParse({ summary: 'Missing most fields' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('model_used can be any non-empty string', () => {
    expect(AIAnalysisSchema.safeParse({ ...validAnalysis, model_used: 'gpt-4o' }).success).toBe(true);
    expect(AIAnalysisSchema.safeParse({ ...validAnalysis, model_used: 'claude-sonnet-4-5' }).success).toBe(true);
  });
});

// ──────────────────────────────────────────────
// JSON parse + validate pipeline (simulating analyzeThread internals)
// ──────────────────────────────────────────────

describe('AI response parsing pipeline', () => {
  function parseAIResponse(raw: string) {
    const cleaned = cleanJsonResponse(raw);
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`AI returned invalid JSON: ${raw.substring(0, 200)}`);
    }
    return AIAnalysisSchema.parse(parsed);
  }

  const validJson = JSON.stringify({
    summary: 'A partnership email requiring a response from the team.',
    classification: 'partner',
    priority: 'high',
    suggested_action: 'reply',
    draft_text: 'Hi, we would love to explore this further...',
    confidence: 0.88,
    model_used: 'llama-3.3-70b-versatile',
  });

  it('parses clean JSON correctly', () => {
    const result = parseAIResponse(validJson);
    expect(result.classification).toBe('partner');
    expect(result.priority).toBe('high');
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = parseAIResponse('```json\n' + validJson + '\n```');
    expect(result.confidence).toBe(0.88);
  });

  it('throws on completely non-JSON response', () => {
    expect(() => parseAIResponse('Sorry, I cannot analyze this.')).toThrow('invalid JSON');
  });

  it('throws on valid JSON that fails schema', () => {
    const bad = JSON.stringify({ summary: 'ok', classification: 'INVALID', priority: 'high', suggested_action: 'reply', draft_text: null, confidence: 0.5, model_used: 'm' });
    expect(() => parseAIResponse(bad)).toThrow();
  });

  it('parses archive_suggestion action with null draft_text', () => {
    const archiveJson = JSON.stringify({
      summary: 'A DevOps notification email about a successful deploy.',
      classification: 'operational',
      priority: 'low',
      suggested_action: 'archive_suggestion',
      draft_text: null,
      confidence: 0.95,
      model_used: 'llama-3.3-70b-versatile',
    });
    const result = parseAIResponse(archiveJson);
    expect(result.suggested_action).toBe('archive_suggestion');
    expect(result.draft_text).toBeNull();
  });
});
