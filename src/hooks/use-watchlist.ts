"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * DB-backed watchlist (per signed-in user) via /api/watchlist — replaces
 * the earlier localStorage version so a favorite survives logout/login and
 * a different browser. Same external shape as before, so call sites
 * (WatchlistButton, WatchlistView) didn't need to change.
 */
export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist")
      .then((res) => (res.ok ? res.json() : { marketIds: [] }))
      .then((data) => {
        if (!cancelled) setIds(Array.isArray(data.marketIds) ? data.marketIds : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = useCallback((marketId: string) => {
    setIds((prev) => (prev.includes(marketId) ? prev : [...prev, marketId]));
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketId }),
    }).catch(() => {});
  }, []);

  const remove = useCallback((marketId: string) => {
    setIds((prev) => prev.filter((id) => id !== marketId));
    fetch(`/api/watchlist?marketId=${encodeURIComponent(marketId)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const toggle = useCallback(
    (marketId: string) => {
      setIds((prev) => {
        const isWatched = prev.includes(marketId);
        if (isWatched) {
          fetch(`/api/watchlist?marketId=${encodeURIComponent(marketId)}`, { method: "DELETE" }).catch(() => {});
          return prev.filter((id) => id !== marketId);
        }
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marketId }),
        }).catch(() => {});
        return [...prev, marketId];
      });
    },
    []
  );

  const isWatched = useCallback((marketId: string) => ids.includes(marketId), [ids]);

  return { ids, hydrated, add, remove, toggle, isWatched };
}
