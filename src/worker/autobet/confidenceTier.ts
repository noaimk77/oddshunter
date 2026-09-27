/**
 * The trusted esports channel ("Vip ESPORTS") tags each pick with a
 * confidence level in the message caption, which drives the stake size.
 * Observed real formats (pulled from the channel 2026-09-27):
 *   "1/3", "2/3", "3/3"  — 1 = lowest confidence, 3 = highest
 *   "Max bet"            — its highest-conviction / cash-out-and-flip calls
 * The actual pick lives in the attached bet-slip photo; only the tier is
 * in the caption text, so this reads the caption, not the pick.
 */
export type ConfidenceTier = "1/3" | "2/3" | "3/3" | "max";

export function parseConfidenceTier(rawText: string | null | undefined): ConfidenceTier | null {
  if (!rawText) return null;
  const t = rawText.toLowerCase();
  // "max"/"max bet" checked first — a "Max bet" caption never also carries
  // an N/3, and it's the strongest signal.
  if (/\bmax\b/.test(t)) return "max";
  if (/\b3\s*\/\s*3\b/.test(t)) return "3/3";
  if (/\b2\s*\/\s*3\b/.test(t)) return "2/3";
  if (/\b1\s*\/\s*3\b/.test(t)) return "1/3";
  return null;
}
