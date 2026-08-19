/**
 * MARKET_LOCK detector — spec point J: open → suspended/closed transitions.
 * Pure function: no schema change needed to track "previous status", because
 * the transition is inferred from whether an unresolved MARKET_LOCK signal
 * already exists for this market (the Signal lifecycle itself IS the state
 * machine — see Signal.status in schema.prisma). The caller (worker) is
 * responsible for querying that existing-signal flag from the database.
 */

export type MarketStatus = "open" | "suspended" | "closed";

export interface MarketLockAction {
  action: "open_signal" | "resolve_signal" | "none";
}

export function detectMarketLock(currentStatus: MarketStatus, hasOpenLockSignal: boolean): MarketLockAction {
  const isLocked = currentStatus === "suspended" || currentStatus === "closed";

  if (isLocked && !hasOpenLockSignal) return { action: "open_signal" };
  if (!isLocked && hasOpenLockSignal) return { action: "resolve_signal" };
  return { action: "none" };
}
