"use client";

import { useEffect, useState } from "react";

/**
 * Returns milliseconds elapsed since mount, updated every `intervalMs`.
 * Always starts at 0 so server and client render identically on first
 * paint — the countdown only starts moving after hydration.
 */
export function useTicker(intervalMs = 1000): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Date.now() - start);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return elapsed;
}
