/**
 * Thread lifecycle — pure logic tests (no DB required).
 * Tests state transitions, label logic, and thread status helpers.
 */

import { describe, it, expect } from 'vitest';

// ── Label helpers (mirrors production logic) ────────────────────────────────

function archiveThread(labels: string[]): string[] {
  return labels.filter((l) => l !== 'INBOX');
}

function trashThread(labels: string[]): string[] {
  return [...labels.filter((l) => l !== 'INBOX'), 'TRASH'];
}

function restoreThread(labels: string[]): string[] {
  return [...labels.filter((l) => l !== 'TRASH' && l !== 'INBOX'), 'INBOX'];
}

function starThread(labels: string[]): string[] {
  return [...new Set([...labels, 'STARRED'])];
}

function unstarThread(labels: string[]): string[] {
  return labels.filter((l) => l !== 'STARRED');
}

function isInbox(labels: string[]): boolean {
  return labels.includes('INBOX') && !labels.includes('TRASH');
}

function isTrashed(labels: string[]): boolean {
  return labels.includes('TRASH');
}

function isArchived(labels: string[]): boolean {
  return !labels.includes('INBOX') && !labels.includes('TRASH');
}

describe('thread lifecycle — label state machine', () => {
  it('archive removes INBOX label', () => {
    const result = archiveThread(['INBOX', 'UNREAD']);
    expect(result).not.toContain('INBOX');
    expect(result).toContain('UNREAD');
  });

  it('archive does not add TRASH', () => {
    const result = archiveThread(['INBOX']);
    expect(result).not.toContain('TRASH');
  });

  it('trash moves to TRASH and removes INBOX', () => {
    const result = trashThread(['INBOX', 'UNREAD']);
    expect(result).toContain('TRASH');
    expect(result).not.toContain('INBOX');
  });

  it('restore adds INBOX and removes TRASH', () => {
    const result = restoreThread(['TRASH', 'SPAM']);
    expect(result).toContain('INBOX');
    expect(result).not.toContain('TRASH');
  });

  it('star adds STARRED without duplicates', () => {
    const result = starThread(['INBOX', 'STARRED']);
    expect(result.filter((l) => l === 'STARRED').length).toBe(1);
  });

  it('unstar removes STARRED', () => {
    const result = unstarThread(['INBOX', 'STARRED']);
    expect(result).not.toContain('STARRED');
    expect(result).toContain('INBOX');
  });

  it('isInbox: INBOX and not TRASH', () => {
    expect(isInbox(['INBOX'])).toBe(true);
    expect(isInbox(['INBOX', 'TRASH'])).toBe(false);
    expect(isInbox(['TRASH'])).toBe(false);
  });

  it('isTrashed detects TRASH label', () => {
    expect(isTrashed(['TRASH'])).toBe(true);
    expect(isTrashed(['INBOX'])).toBe(false);
  });

  it('isArchived: no INBOX and no TRASH', () => {
    expect(isArchived(['STARRED'])).toBe(true);
    expect(isArchived(['INBOX'])).toBe(false);
    expect(isArchived(['TRASH'])).toBe(false);
  });

  it('full lifecycle: inbox → archive → restore → trash → restore', () => {
    let labels = ['INBOX', 'UNREAD'];
    labels = archiveThread(labels);
    expect(isArchived(labels)).toBe(true);

    labels = restoreThread(labels);
    expect(isInbox(labels)).toBe(true);

    labels = trashThread(labels);
    expect(isTrashed(labels)).toBe(true);

    labels = restoreThread(labels);
    expect(isInbox(labels)).toBe(true);
  });

  it('star survives archive/restore cycle', () => {
    let labels = ['INBOX', 'STARRED'];
    labels = archiveThread(labels);
    labels = restoreThread(labels);
    expect(labels).toContain('STARRED');
  });
});
