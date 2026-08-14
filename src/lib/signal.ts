import type { SignalLevel } from "@/types";

interface SignalMeta {
  label: string;
  /** Text color utility class */
  text: string;
  /** Background + border wash for badges/pills */
  soft: string;
  /** Solid dot / bar color utility class */
  dot: string;
  /** Raw hex, for chart fills where Tailwind classes don't apply */
  hex: string;
}

export const SIGNAL_META: Record<SignalLevel, SignalMeta> = {
  normal: {
    label: "Normal",
    text: "text-zinc-400",
    soft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    dot: "bg-zinc-500",
    hex: "#71717a",
  },
  watch: {
    label: "Watch",
    text: "text-cyan-400",
    soft: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    dot: "bg-cyan-400",
    hex: "#22d3ee",
  },
  elevated: {
    label: "Elevated",
    text: "text-violet-400",
    soft: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    dot: "bg-violet-400",
    hex: "#a78bfa",
  },
  high: {
    label: "High",
    text: "text-orange-400",
    soft: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    dot: "bg-orange-400",
    hex: "#fb923c",
  },
  extreme: {
    label: "Extreme",
    text: "text-red-400",
    soft: "bg-red-500/10 text-red-400 border-red-500/20",
    dot: "bg-red-400",
    hex: "#f87171",
  },
};

export function signalFromScore(score: number): SignalLevel {
  if (score >= 93) return "extreme";
  if (score >= 75) return "high";
  if (score >= 50) return "elevated";
  if (score >= 25) return "watch";
  return "normal";
}
