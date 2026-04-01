/**
 * Tests for email template logic (Sprint 3 / v1.1)
 *
 * Pure unit tests — no DB, no network required.
 */

import { describe, it, expect } from 'vitest';

// ── Template variable substitution ────────────────────────────────────────

function substituteTemplateVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

describe('Template variable substitution', () => {
  it('replaces a single variable', () => {
    const result = substituteTemplateVariables('Hej {{name}}!', { name: 'Jesper' });
    expect(result).toBe('Hej Jesper!');
  });

  it('replaces multiple variables', () => {
    const result = substituteTemplateVariables(
      'Hej {{name}}, ang. {{topic}}.',
      { name: 'Anna', topic: 'projektet' }
    );
    expect(result).toBe('Hej Anna, ang. projektet.');
  });

  it('leaves unknown variables intact', () => {
    const result = substituteTemplateVariables('{{unknown}} borde finnas', {});
    expect(result).toBe('{{unknown}} borde finnas');
  });

  it('handles empty variables object', () => {
    const result = substituteTemplateVariables('Ingen variabel här', {});
    expect(result).toBe('Ingen variabel här');
  });

  it('handles adjacent variables', () => {
    const result = substituteTemplateVariables(
      '{{first}}{{last}}',
      { first: 'Jesper', last: 'Melin' }
    );
    expect(result).toBe('JesperMelin');
  });
});

// ── Template validation ────────────────────────────────────────────────────

function validateTemplate(template: { name?: string; bodyText?: string; subject?: string }): string[] {
  const errors: string[] = [];
  if (!template.name?.trim()) errors.push('name is required');
  if (template.name && template.name.length > 200) errors.push('name too long');
  return errors;
}

describe('Template validation', () => {
  it('requires a name', () => {
    const errors = validateTemplate({ bodyText: 'body' });
    expect(errors).toContain('name is required');
  });

  it('rejects empty name', () => {
    const errors = validateTemplate({ name: '   ', bodyText: 'body' });
    expect(errors).toContain('name is required');
  });

  it('passes with valid name and body', () => {
    const errors = validateTemplate({ name: 'Snabbsvar', bodyText: 'Hej!' });
    expect(errors).toHaveLength(0);
  });

  it('passes with name only (body optional)', () => {
    const errors = validateTemplate({ name: 'Tom mall' });
    expect(errors).toHaveLength(0);
  });

  it('rejects overly long name', () => {
    const errors = validateTemplate({ name: 'x'.repeat(201) });
    expect(errors).toContain('name too long');
  });
});

// ── Template category normalisation ──────────────────────────────────────

const VALID_CATEGORIES = ['general', 'meeting', 'follow-up', 'outreach', 'support'] as const;
type Category = typeof VALID_CATEGORIES[number];

function normaliseCategory(input: string | undefined): Category {
  if (input && VALID_CATEGORIES.includes(input as Category)) return input as Category;
  return 'general';
}

describe('Template category normalisation', () => {
  it('passes through known categories', () => {
    expect(normaliseCategory('meeting')).toBe('meeting');
    expect(normaliseCategory('follow-up')).toBe('follow-up');
  });

  it('defaults to general for unknown categories', () => {
    expect(normaliseCategory('anything')).toBe('general');
    expect(normaliseCategory(undefined)).toBe('general');
  });
});
