"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

export function Countdown({ targetIso, className }: { targetIso: string; className?: string }) {
  // `Date.now()` is impure and can't be called during render (React's
  // purity rules) — it's only ever read inside this effect, and the result
  // lands in state. `null` on the very first render keeps server and
  // client markup identical before hydration.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setRemaining(new Date(targetIso).getTime() - Date.now());
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [targetIso]);

  return (
    <span className={className}>
      {remaining === null ? "—" : remaining <= 0 ? "In progress" : formatCountdown(remaining)}
    </span>
  );
}
