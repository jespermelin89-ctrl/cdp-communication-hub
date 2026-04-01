import { describe, expect, it } from 'vitest';
import { isDraftCacheKey, isThreadCacheKey } from '@/lib/cache-keys';

describe('cache key helpers', () => {
  it('matches string thread detail/list keys', () => {
    expect(isThreadCacheKey('/threads')).toBe(true);
    expect(isThreadCacheKey('/threads/thread-123')).toBe(true);
  });

  it('matches inbox infinite-list array keys', () => {
    expect(isThreadCacheKey(['threads-infinite', 'account-1', 'query', 'inbox', 1])).toBe(true);
  });

  it('does not match unrelated keys as threads', () => {
    expect(isThreadCacheKey('/drafts')).toBe(false);
    expect(isThreadCacheKey(['compose-accounts'])).toBe(false);
  });

  it('matches drafts list/detail keys', () => {
    expect(isDraftCacheKey('/drafts')).toBe(true);
    expect(isDraftCacheKey('/drafts/draft-123')).toBe(true);
  });

  it('does not match unrelated keys as drafts', () => {
    expect(isDraftCacheKey('/threads')).toBe(false);
    expect(isDraftCacheKey(['threads-infinite', 'account-1'])).toBe(false);
  });
});
