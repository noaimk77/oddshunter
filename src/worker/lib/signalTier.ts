/**
 * Signal tier classification — Standard vs Premium.
 *
 * Every signal gets classified at delivery time. Standard = a real detected
 * move (an ODDS_DROP that passed the base threshold). Premium = a move
 * corroborated by INDEPENDENT signals: multiple bookmakers, cross-market
 * confirmation, late-window timing, or sharp velocity. A Premium tag on
 * the message is what carries the pitch — "when you see ⭐ PREMIUM, three
 * indicators lined up, not just one" — and is what a subscriber tier gate
 * eventually keys off once the tiered pricing ships.
 *
 * Two design constraints matter here:
 *  - The rules stay in ONE place (this file). The message renderer, the
 *    /perf split, and the future subscriber gate all import
 *    `classifySignalTier` — no rule ever lives in two places, so a threshold
 *    tweak can't drift out of sync.
 *  - "Premium" is a conjunction of at least TWO independent indicators, not
 *    a single lucky threshold. A single indicator can misfire (an OCR-noisy
 *    late-move flag, a stale velocity reading); two orthogonal ones almost
 *    never fire together on noise.
 */

/** Every field the tier classifier actually reads — kept explicit so the
 *  caller can pass a compact shape without wiring the full SignalWithContext. */
export interface TierInputs {
  score: number;
  isLateMove?: boolean;
  crossMarketCount?: number;
  velocity?: { pctPerMin: number } | null;
  /** Confirmation set size — the number of independent bookmakers that
   *  agree on the direction. Read from the MULTI_BOOK_CONFIRMATION
   *  metadata; other signal types just pass 0. */
  confirmingBookmakers?: number;
}

/** Public: a plain string enum so a database column or a JSON payload can
 *  round-trip it without ambiguity. */
export type SignalTier = "standard" | "premium";

/** Score floor below which we never call a signal Premium — no matter
 *  how many indicators line up, a weak base score means the underlying
 *  move isn't strong enough for the marketing tag. Aligned with the
 *  existing `getMinScoreToAlert` default of 40; a Premium signal must
 *  clear a comfortable margin above the delivery floor. */
const PREMIUM_MIN_SCORE = 55;

/** How many of the four Premium indicators must fire together. Two, not
 *  one — see the header rationale. */
const PREMIUM_MIN_INDICATORS = 2;

/**
 * Returns `"premium"` when the signal passes the base score floor AND
 * shows ≥ 2 independent confirming indicators; `"standard"` otherwise.
 * Pure function, no I/O — tested exhaustively in signalTier.test.ts.
 */
export function classifySignalTier(inputs: TierInputs): SignalTier {
  if (inputs.score < PREMIUM_MIN_SCORE) return "standard";

  let indicators = 0;
  // 1. Multi-book confirmation: three or more distinct bookmakers moving
  //    together is what tips a "one book adjusting" into an "everybody
  //    knows something we don't".
  if ((inputs.confirmingBookmakers ?? 0) >= 3) indicators++;
  // 2. Cross-market: two or more different market types (1X2 + Over/Under,
  //    say) on the same event bouncing at the same time. Very hard to fake.
  if ((inputs.crossMarketCount ?? 0) >= 2) indicators++;
  // 3. Late-move: happening in the last hour before kickoff — the window
  //    where syndicate money historically shows.
  if (inputs.isLateMove === true) indicators++;
  // 4. Velocity: half-a-percent per minute or more — a genuinely fast
  //    move, not routine liquidity re-balancing.
  if (inputs.velocity && inputs.velocity.pctPerMin >= 0.5) indicators++;

  return indicators >= PREMIUM_MIN_INDICATORS ? "premium" : "standard";
}

/** Compact human-readable badge for the message header. Empty string for
 *  standard so the caller can concat unconditionally without producing a
 *  stray space. */
export function tierBadge(tier: SignalTier): string {
  return tier === "premium" ? "⭐ PREMIUM" : "";
}
