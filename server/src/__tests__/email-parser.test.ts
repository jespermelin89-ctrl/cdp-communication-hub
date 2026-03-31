import { describe, expect, it } from 'vitest';
import { buildRfc2822Email } from '../utils/email-parser';

describe('buildRfc2822Email', () => {
  it('includes Bcc recipients when provided', () => {
    const rawEmail = buildRfc2822Email({
      from: 'sender@example.com',
      to: ['to@example.com'],
      cc: ['cc@example.com'],
      bcc: ['hidden@example.com'],
      subject: 'Hello',
      body: 'Body text',
    });

    expect(rawEmail).toContain('To: to@example.com');
    expect(rawEmail).toContain('Cc: cc@example.com');
    expect(rawEmail).toContain('Bcc: hidden@example.com');
  });
});
