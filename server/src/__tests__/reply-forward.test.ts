/**
 * Reply & Forward — Sprint 8 tests
 *
 * Tests for reply draft creation, In-Reply-To header logic,
 * reply-all recipient calculation, and forward header insertion.
 */

import { describe, it, expect } from 'vitest';

// ── Reply type helpers ────────────────────────────────────────────────────────

interface Message {
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  messageId?: string;
  subject?: string;
}

function buildReplyToAddresses(msg: Message, accountEmail: string): string[] {
  return [msg.fromAddress];
}

function buildReplyAllToAddresses(msg: Message, accountEmail: string): { to: string[]; cc: string[] } {
  const to = [msg.fromAddress];
  const cc = [...msg.toAddresses, ...msg.ccAddresses].filter(
    (e) => e !== accountEmail && e !== msg.fromAddress
  );
  return { to, cc };
}

function buildInReplyToHeader(originalMessageId?: string): string | null {
  if (!originalMessageId) return null;
  return originalMessageId.startsWith('<')
    ? originalMessageId
    : `<${originalMessageId}>`;
}

function buildForwardSubject(subject?: string): string {
  const s = subject ?? '';
  return s.toLowerCase().startsWith('fwd: ') || s.toLowerCase().startsWith('fw: ')
    ? s
    : `Fwd: ${s}`;
}

function buildForwardBody(originalMsg: Message, body: string): string {
  const header = '---------- Vidarebefordrat meddelande ----------';
  const meta = `Från: ${originalMsg.fromAddress}\nTill: ${originalMsg.toAddresses.join(', ')}\nÄmne: ${originalMsg.subject ?? ''}`;
  return `${header}\n${meta}\n\n${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Reply draft creation', () => {
  const accountEmail = 'me@example.com';
  const originalMsg: Message = {
    fromAddress: 'sender@example.com',
    toAddresses: ['me@example.com', 'colleague@example.com'],
    ccAddresses: ['cc@example.com'],
    messageId: 'msg-id-12345@gmail.com',
    subject: 'Test Thread',
  };

  it('Reply: to = original sender only', () => {
    const to = buildReplyToAddresses(originalMsg, accountEmail);
    expect(to).toEqual(['sender@example.com']);
    expect(to).toHaveLength(1);
  });

  it('Reply All: to = original sender, cc = other recipients minus self', () => {
    const { to, cc } = buildReplyAllToAddresses(originalMsg, accountEmail);
    expect(to).toEqual(['sender@example.com']);
    expect(cc).toContain('colleague@example.com');
    expect(cc).toContain('cc@example.com');
    expect(cc).not.toContain(accountEmail);
  });

  it('Reply All: excludes original sender from cc', () => {
    const { cc } = buildReplyAllToAddresses(originalMsg, accountEmail);
    expect(cc).not.toContain('sender@example.com');
  });

  it('buildInReplyToHeader wraps in angle brackets if missing', () => {
    expect(buildInReplyToHeader('msg-id-12345')).toBe('<msg-id-12345>');
  });

  it('buildInReplyToHeader keeps existing angle brackets', () => {
    expect(buildInReplyToHeader('<msg-id-12345>')).toBe('<msg-id-12345>');
  });

  it('buildInReplyToHeader returns null for missing messageId', () => {
    expect(buildInReplyToHeader(undefined)).toBeNull();
    expect(buildInReplyToHeader('')).toBeNull();
  });

  it('Forward: prepends Fwd: to subject', () => {
    expect(buildForwardSubject('Test Thread')).toBe('Fwd: Test Thread');
  });

  it('Forward: does not double-prefix Fwd:', () => {
    expect(buildForwardSubject('Fwd: Already forwarded')).toBe('Fwd: Already forwarded');
    expect(buildForwardSubject('fwd: already')).toBe('fwd: already');
  });

  it('Forward: includes forward header in body', () => {
    const body = 'Original email content here.';
    const forwarded = buildForwardBody(originalMsg, body);
    expect(forwarded).toContain('---------- Vidarebefordrat meddelande ----------');
    expect(forwarded).toContain('sender@example.com');
    expect(forwarded).toContain(body);
  });

  it('Reply type determination: replyAll includes more recipients than reply', () => {
    const replyTo = buildReplyToAddresses(originalMsg, accountEmail);
    const { to: replyAllTo, cc: replyAllCc } = buildReplyAllToAddresses(originalMsg, accountEmail);
    const totalReply = replyTo.length;
    const totalReplyAll = replyAllTo.length + replyAllCc.length;
    expect(totalReplyAll).toBeGreaterThanOrEqual(totalReply);
  });
});
