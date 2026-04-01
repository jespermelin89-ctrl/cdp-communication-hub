'use client';

/**
 * useInfiniteThreads — Sprint 6
 *
 * SWR infinite hook for cursor-based thread pagination.
 * Loads next page when scroll reaches 200px from bottom.
 */

import { useEffect, useRef, useCallback } from 'react';
import useSWRInfinite from 'swr/infinite';
import { api } from '@/lib/api';

interface ThreadsParams {
  accountId?: string;
  search?: string;
  mailbox?: string;
  label?: string;
  limit?: number;
}

interface Page {
  threads: any[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
  accountCounts?: Record<string, number>;
}

function getKey(params: ThreadsParams) {
  return (pageIndex: number, previousPageData: Page | null): string | null => {
    if (previousPageData && !previousPageData.hasMore) return null;
    const cursor = previousPageData?.nextCursor ?? undefined;

    const parts = [
      `/threads`,
      `?mailbox=${params.mailbox ?? 'inbox'}`,
      params.accountId ? `&account_id=${params.accountId}` : '',
      params.search ? `&search=${encodeURIComponent(params.search)}` : '',
      params.label ? `&label=${encodeURIComponent(params.label)}` : '',
      `&limit=${params.limit ?? 25}`,
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : `&page=${pageIndex + 1}`,
    ];
    return parts.join('');
  };
}

async function fetchPage(key: string): Promise<Page> {
  // Parse params back from the key
  const url = new URL(key, 'http://localhost');
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });

  const result = await api.getThreads({
    account_id: params.account_id,
    search: params.search,
    mailbox: params.mailbox ?? 'inbox',
    cursor: params.cursor,
    limit: params.limit ? Number(params.limit) : 25,
  });

  return {
    threads: result.threads ?? [],
    nextCursor: result.nextCursor ?? null,
    hasMore: result.hasMore ?? false,
    totalCount: result.totalCount ?? result.total ?? 0,
    accountCounts: result.accountCounts,
  };
}

export function useInfiniteThreads(params: ThreadsParams) {
  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<Page>(
    getKey(params),
    fetchPage,
    {
      revalidateFirstPage: true,
      persistSize: false,
    }
  );

  const threads = data ? data.flatMap((p) => p.threads) : [];
  const totalCount = data?.[0]?.totalCount ?? 0;
  const accountCounts = data?.[0]?.accountCounts;
  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false;
  const isLoadingMore = isValidating && size > 1;

  // IntersectionObserver: load next page when near bottom
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setSize((s) => s + 1);
    }
  }, [hasMore, isLoadingMore, setSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return {
    threads,
    totalCount,
    accountCounts,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    sentinelRef,
    mutate,
    size,
    setSize,
  };
}
