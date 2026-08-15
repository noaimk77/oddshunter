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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist")
      .then((res) => (res.ok ? res.json() : { marketIds: [] }))
      .then((data) => {
        if (!cancelled) setIds(Array.isArray(data.marketIds) ? data.marketIds : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your watchlist.");
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Optimistic by design (the star should react instantly), but a failed
   * request must roll the local state back — otherwise the UI would show a
   * market as watchlisted when the database never actually recorded it.
   */
  const add = useCallback((marketId: string) => {
    setError(null);
    setIds((prev) => (prev.includes(marketId) ? prev : [...prev, marketId]));
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketId }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setIds((prev) => prev.filter((id) => id !== marketId));
        setError("Couldn't add that to your watchlist. Try again.");
      });
  }, []);

  const remove = useCallback((marketId: string) => {
    setError(null);
    setIds((prev) => prev.filter((id) => id !== marketId));
    fetch(`/api/watchlist?marketId=${encodeURIComponent(marketId)}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setIds((prev) => (prev.includes(marketId) ? prev : [...prev, marketId]));
        setError("Couldn't remove that from your watchlist. Try again.");
      });
  }, []);

  const toggle = useCallback(
    (marketId: string) => {
      setError(null);
      let wasWatched = false;
      setIds((prev) => {
        wasWatched = prev.includes(marketId);
        return wasWatched ? prev.filter((id) => id !== marketId) : [...prev, marketId];
      });

      const request = wasWatched
        ? fetch(`/api/watchlist?marketId=${encodeURIComponent(marketId)}`, { method: "DELETE" })
        : fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marketId }),
          });

      request
        .then((res) => {
          if (!res.ok) throw new Error();
        })
        .catch(() => {
          // Revert to the pre-toggle state — never leave the star showing
          // something the database doesn't actually have.
          setIds((prev) =>
            wasWatched ? (prev.includes(marketId) ? prev : [...prev, marketId]) : prev.filter((id) => id !== marketId)
          );
          setError("Couldn't update your watchlist. Try again.");
        });
    },
    []
  );

  const isWatched = useCallback((marketId: string) => ids.includes(marketId), [ids]);

  return { ids, hydrated, error, add, remove, toggle, isWatched };
}
