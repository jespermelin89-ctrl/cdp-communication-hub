/**
 * Brain Core local cache — IndexedDB via idb-keyval.
 * Stores a snapshot of writing modes, voice attributes, classification rules, and contacts.
 * Data is served from cache instantly; freshness is advisory (stale-while-revalidate pattern).
 */

import { get, set, del } from 'idb-keyval';

export interface BrainSnapshot {
  writingModes: any[];
  voiceAttributes: any[];
  classificationRules: any[];
  contacts: any[];
  cachedAt: number;
}

const CACHE_KEY = 'brain-core-snapshot';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export const brainCache = {
  async save(data: Omit<BrainSnapshot, 'cachedAt'>): Promise<void> {
    await set(CACHE_KEY, { ...data, cachedAt: Date.now() } satisfies BrainSnapshot);
  },

  /** Load cached snapshot. Returns null if nothing cached. Always returns even if stale. */
  async load(): Promise<BrainSnapshot | null> {
    try {
      const cached = await get<BrainSnapshot>(CACHE_KEY);
      return cached ?? null;
    } catch {
      return null;
    }
  },

  /** True only if a snapshot exists AND was saved within MAX_AGE_MS. */
  async isFresh(): Promise<boolean> {
    try {
      const cached = await get<BrainSnapshot>(CACHE_KEY);
      if (!cached) return false;
      return Date.now() - cached.cachedAt < MAX_AGE_MS;
    } catch {
      return false;
    }
  },

  async clear(): Promise<void> {
    try {
      await del(CACHE_KEY);
    } catch {}
  },
};
