"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Briefly flashes green/red when `watchValue` changes — used for live scanner ticks. */
export function FlashCell({
  watchValue,
  direction = "up",
  className,
  children,
}: {
  watchValue: string | number;
  direction?: "up" | "down";
  className?: string;
  children: ReactNode;
}) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(watchValue);

  useEffect(() => {
    if (prev.current !== watchValue) {
      setFlash(direction);
      prev.current = watchValue;
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [watchValue, direction]);

  return (
    <span
      className={cn(
        "-mx-1 inline-block rounded px-1 transition-colors duration-300",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down",
        className
      )}
    >
      {children}
    </span>
  );
}
