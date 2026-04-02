import { describe, expect, it, vi } from 'vitest';
import { revalidateDraftCaches, revalidateThreadCaches } from '@/hooks/use-event-stream';
import { isDraftCacheKey, isThreadCacheKey } from '@/lib/cache-keys';

describe('useEventStream cache invalidation helpers', () => {
  it('revalidates both thread detail and inbox list caches', () => {
    const mutate = vi.fn();

    revalidateThreadCaches(mutate as any, 'thread-123');

    expect(mutate).toHaveBeenNthCalledWith(1, '/threads/thread-123');
    expect(mutate).toHaveBeenNthCalledWith(2, isThreadCacheKey);
  });

  it('revalidates thread list caches even without a specific thread id', () => {
    const mutate = vi.fn();

    revalidateThreadCaches(mutate as any);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(isThreadCacheKey);
  });

  it('revalidates draft caches via the shared draft key matcher', () => {
    const mutate = vi.fn();

    revalidateDraftCaches(mutate as any);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(isDraftCacheKey);
  });
});
