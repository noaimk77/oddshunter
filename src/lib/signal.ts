import type { SignalLevel } from "@/types";

interface SignalMeta {
  label: string;
  /** Text color utility class, sourced from the Odds Hunter design tokens */
  text: string;
  /** Background + border wash for badges/pills */
  soft: string;
  /** Solid dot / bar color utility class */
  dot: string;
  /** Raw hex — kept in sync with globals.css, for chart fills (SVG attrs can't read CSS vars) */
  hex: string;
}

/**
 * normal(gray) / watch(cyan, occasional secondary) / elevated(gold, the
 * brand's "important signal" color) / high(orange, elevated activity) /
 * extreme(red, reserved for critical anomalies only) — matches the
 * functional color rules in the Odds Hunter design system. This is a
 * statistical anomaly scale, never a claim that a match is fixed.
 */
export const SIGNAL_META: Record<SignalLevel, SignalMeta> = {
  normal: {
    label: "Normal",
    text: "text-signal-normal",
    soft: "bg-signal-normal/10 text-signal-normal border-signal-normal/20",
    dot: "bg-signal-normal",
    hex: "#6b6b66",
  },
  watch: {
    label: "Watch",
    text: "text-signal-watch",
    soft: "bg-signal-watch/10 text-signal-watch border-signal-watch/20",
    dot: "bg-signal-watch",
    hex: "#38bdf8",
  },
  elevated: {
    label: "Elevated",
    text: "text-signal-elevated",
    soft: "bg-signal-elevated/10 text-signal-elevated border-signal-elevated/20",
    dot: "bg-signal-elevated",
    hex: "#f5b800",
  },
  high: {
    label: "High",
    text: "text-signal-high",
    soft: "bg-signal-high/10 text-signal-high border-signal-high/20",
    dot: "bg-signal-high",
    hex: "#ff8a00",
  },
  extreme: {
    label: "Extreme",
    text: "text-signal-extreme",
    soft: "bg-signal-extreme/10 text-signal-extreme border-signal-extreme/20",
    dot: "bg-signal-extreme",
    hex: "#e5484d",
  },
};

export function signalFromScore(score: number): SignalLevel {
  if (score >= 93) return "extreme";
  if (score >= 75) return "high";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  return "normal";
}
