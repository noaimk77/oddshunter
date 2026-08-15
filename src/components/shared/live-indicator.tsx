import { cn } from "@/lib/utils";

/** A small pulsing dot for anything genuinely live right now (a live fixture, a fresh feed item). */
export function LiveIndicator({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
      </span>
      {label && <span className="text-[11px] font-semibold tracking-wide text-positive uppercase">{label}</span>}
    </span>
  );
}
