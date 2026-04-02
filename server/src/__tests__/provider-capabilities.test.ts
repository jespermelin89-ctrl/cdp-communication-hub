import { describe, expect, it } from 'vitest';
import { getThreadMutationUnsupportedError } from '../utils/thread-provider-capabilities';

describe('getThreadMutationUnsupportedError', () => {
  it('allows Gmail thread mutations', () => {
    expect(getThreadMutationUnsupportedError('gmail', 'archive')).toBeNull();
    expect(getThreadMutationUnsupportedError('gmail', 'read')).toBeNull();
  });

  it('blocks IMAP thread mutations until remote write-back exists', () => {
    expect(getThreadMutationUnsupportedError('imap', 'archive')).toContain('currently limited to Gmail accounts');
    expect(getThreadMutationUnsupportedError('imap', 'read')).toContain('currently limited to Gmail accounts');
    expect(getThreadMutationUnsupportedError('imap', 'spam')).toContain('currently limited to Gmail accounts');
  });

  it('returns a clear message for unknown providers', () => {
    expect(getThreadMutationUnsupportedError('microsoft', 'trash')).toContain("Provider 'microsoft'");
  });
});
