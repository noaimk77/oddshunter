"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "oddscope:watchlist";

function readStoredIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** localStorage-backed watchlist of market ids. Client-only by design. */
export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reading localStorage must happen post-mount to keep server/client
    // markup identical, so this one-time hydration setState is unavoidable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readStoredIds());
    setHydrated(true);
  }, []);

  // Persisting here (rather than inside the setIds updaters below) keeps
  // those updaters pure — a setState call belongs in an effect, not nested
  // inside another setState's updater callback.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, [ids, hydrated]);

  const add = useCallback((marketId: string) => {
    setIds((prev) => (prev.includes(marketId) ? prev : [...prev, marketId]));
  }, []);

  const remove = useCallback((marketId: string) => {
    setIds((prev) => prev.filter((id) => id !== marketId));
  }, []);

  const toggle = useCallback((marketId: string) => {
    setIds((prev) => (prev.includes(marketId) ? prev.filter((id) => id !== marketId) : [...prev, marketId]));
  }, []);

  const isWatched = useCallback((marketId: string) => ids.includes(marketId), [ids]);

  return { ids, hydrated, add, remove, toggle, isWatched };
}
