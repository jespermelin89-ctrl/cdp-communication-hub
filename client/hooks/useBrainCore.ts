'use client';

/**
 * useBrainCore — Multi-path Brain Core data hook.
 *
 * Load order (stale-while-revalidate):
 *   1. IndexedDB cache   → instant, shown immediately even if stale
 *   2. Path A: direct API endpoints (/brain-core/*) with JWT
 *   3. Path B: /agent/execute brain-status (fallback if individual endpoints fail)
 *   4. Offline/error     → keep whatever cache was loaded in step 1
 */

import { useState, useEffect, useCallback } from 'react';
import { brainCache, type BrainSnapshot } from '@/lib/brain-cache';
import { api } from '@/lib/api';

export type DataSource = 'cache' | 'api' | 'agent' | 'offline';

export interface BrainCoreState {
  data: BrainSnapshot | null;
  source: DataSource;
  loading: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

export function useBrainCore() {
  const [state, setState] = useState<BrainCoreState>({
    data: null,
    source: 'offline',
    loading: true,
    lastUpdated: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    // ── Step 1: Serve cache immediately (instant UX) ──────────────────────
    try {
      const cached = await brainCache.load();
      if (cached) {
        setState({
          data: cached,
          source: 'cache',
          loading: true, // still loading — will upgrade to fresh data below
          lastUpdated: new Date(cached.cachedAt),
          error: null,
        });
      }
    } catch {
      // IndexedDB unavailable (private browsing) — carry on
    }

    // ── Step 2: Path A — direct brain-core API endpoints ─────────────────
    try {
      const [profileRes, rulesRes, contactsRes] = await Promise.all([
        api.getWritingProfile(),
        api.getClassificationRules(),
        api.getContacts(),
      ]);

      const fresh: Omit<BrainSnapshot, 'cachedAt'> = {
        writingModes: profileRes.profile?.modes ?? [],
        voiceAttributes: profileRes.profile?.attributes ?? [],
        classificationRules: rulesRes.rules ?? [],
        contacts: contactsRes.contacts ?? [],
      };

      await brainCache.save(fresh);

      setState({
        data: { ...fresh, cachedAt: Date.now() },
        source: 'api',
        loading: false,
        lastUpdated: new Date(),
        error: null,
      });
      return;
    } catch {
      if (process.env.NODE_ENV === 'development') console.warn('[useBrainCore] Path A (API) failed, trying agent fallback…');
    }

    // ── Step 3: Path B — agent brain-status (JWT auth) ────────────────────
    try {
      const token = api.getToken();
      const res = await fetch('/api/v1/agent/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'brain-status', params: {} }),
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setState((prev) => ({
            ...prev,
            data: prev.data ?? json.data,
            source: 'agent',
            loading: false,
            lastUpdated: new Date(),
            error: null,
          }));
          return;
        }
      }
    } catch {
      if (process.env.NODE_ENV === 'development') console.warn('[useBrainCore] Path B (Agent) failed, keeping cache');
    }

    // ── Step 4: Offline — keep whatever step 1 loaded ────────────────────
    setState((prev) => ({
      ...prev,
      source: prev.data ? 'cache' : 'offline',
      loading: false,
      error: prev.data ? null : 'Ingen data tillgänglig — kontrollera anslutningen',
    }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
