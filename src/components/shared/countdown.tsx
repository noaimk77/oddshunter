"use client";

import { useTicker } from "@/hooks/use-ticker";
import { formatCountdown } from "@/lib/format";
import { MOCK_NOW } from "@/data/mock-generator";

export function Countdown({ targetIso, className }: { targetIso: string; className?: string }) {
  const elapsed = useTicker(1000);
  const remaining = new Date(targetIso).getTime() - (MOCK_NOW + elapsed);
  return (
    <span className={className}>
      {remaining <= 0 ? "In progress" : formatCountdown(remaining)}
    </span>
  );
}
