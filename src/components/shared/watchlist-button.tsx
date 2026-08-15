"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { useWatchlist } from "@/hooks/use-watchlist";
import { cn } from "@/lib/utils";

export function WatchlistButton({
  marketId,
  className,
  size = "default",
}: {
  marketId: string;
  className?: string;
  size?: "default" | "sm";
}) {
  const { isWatched, toggle, error } = useWatchlist();
  const watched = isWatched(marketId);

  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
      title={error ?? undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(marketId);
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:text-amber-400",
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
        watched && "text-amber-400",
        error && "text-signal-extreme hover:text-signal-extreme",
        className
      )}
    >
      <motion.span
        key={String(watched)}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className="inline-flex"
      >
        <Star className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", watched && "fill-amber-400")} />
      </motion.span>
      <span role="alert" className="sr-only">
        {error}
      </span>
    </button>
  );
}
