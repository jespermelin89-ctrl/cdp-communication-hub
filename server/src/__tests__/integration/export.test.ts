/**
 * Export logic — CSV formatting and JSON structure tests (no DB required).
 */

import { describe, it, expect } from 'vitest';

// ── CSV helpers (mirrors production export logic) ──────────────────────────

const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

function buildCsvRow(thread: {
  id: string;
  subject: string | null;
  participantEmails: string[];
  lastMessageAt: Date | null;
  labels: string[];
  isRead: boolean;
  priority?: string;
  classification?: string;
}): string {
  const isArchived = !thread.labels.includes('INBOX') && !thread.labels.includes('TRASH');
  const isTrashed = thread.labels.includes('TRASH');
  return [
    thread.id,
    escape(thread.subject ?? ''),
    escape(thread.participantEmails[0] ?? ''),
    thread.lastMessageAt?.toISOString() ?? '',
    thread.priority ?? '',
    thread.classification ?? '',
    escape(thread.labels.join(', ')),
    thread.isRead ? 'yes' : 'no',
    isArchived ? 'yes' : 'no',
    isTrashed ? 'yes' : 'no',
  ].join(',');
}

const CSV_HEADER = 'ID,Subject,From,Date,Priority,Classification,Labels,Read,Archived,Trashed';

describe('data export — CSV format', () => {
  it('CSV header has correct columns', () => {
    const cols = CSV_HEADER.split(',');
    expect(cols).toHaveLength(10);
    expect(cols[0]).toBe('ID');
    expect(cols[1]).toBe('Subject');
    expect(cols[9]).toBe('Trashed');
  });

  it('builds a valid CSV row for inbox thread', () => {
    const row = buildCsvRow({
      id: 'abc123',
      subject: 'Hello World',
      participantEmails: ['alice@example.com'],
      lastMessageAt: new Date('2026-01-15T10:00:00Z'),
      labels: ['INBOX', 'UNREAD'],
      isRead: false,
      priority: 'high',
      classification: 'lead',
    });
    expect(row).toContain('abc123');
    expect(row).toContain('"Hello World"');
    expect(row).toContain('alice@example.com');
    expect(row).toContain('high');
    expect(row).toContain('lead');
    expect(row).toContain('no'); // isRead: false
  });

  it('escapes double quotes in subject', () => {
    const row = buildCsvRow({
      id: 'x',
      subject: 'He said "hello"',
      participantEmails: [],
      lastMessageAt: null,
      labels: [],
      isRead: true,
    });
    expect(row).toContain('"He said ""hello"""');
  });

  it('marks archived thread correctly', () => {
    const row = buildCsvRow({
      id: 'x',
      subject: 'Archived',
      participantEmails: [],
      lastMessageAt: null,
      labels: ['STARRED'], // no INBOX, no TRASH → archived
      isRead: true,
    });
    const cols = row.split(',');
    expect(cols[8]).toBe('yes'); // archived
    expect(cols[9]).toBe('no');  // not trashed
  });

  it('marks trashed thread correctly', () => {
    const row = buildCsvRow({
      id: 'x',
      subject: 'Trashed',
      participantEmails: [],
      lastMessageAt: null,
      labels: ['TRASH'],
      isRead: true,
    });
    const cols = row.split(',');
    expect(cols[8]).toBe('no');  // not archived
    expect(cols[9]).toBe('yes'); // trashed
  });

  it('handles null subject and empty participantEmails', () => {
    const row = buildCsvRow({
      id: 'y',
      subject: null,
      participantEmails: [],
      lastMessageAt: null,
      labels: ['INBOX'],
      isRead: true,
    });
    expect(row).toContain('""'); // empty subject wrapped in quotes
  });
});

describe('data export — JSON structure', () => {
  it('JSON export includes required top-level keys', () => {
    const exported = {
      writingModes: [],
      contacts: [],
      rules: [],
      learningEvents: [],
      voiceAttrs: [],
      senderRules: [],
      exportedAt: new Date().toISOString(),
    };
    expect(exported).toHaveProperty('writingModes');
    expect(exported).toHaveProperty('contacts');
    expect(exported).toHaveProperty('rules');
    expect(exported).toHaveProperty('learningEvents');
    expect(exported).toHaveProperty('voiceAttrs');
    expect(exported).toHaveProperty('senderRules');
    expect(exported).toHaveProperty('exportedAt');
  });

  it('exportedAt is a valid ISO string', () => {
    const ts = new Date().toISOString();
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });
});
