import { cn } from "@/lib/utils";

/**
 * The Odds Hunter mark: a radar ring, a crosshair, and a single breakout
 * line standing for market movement. Deliberately minimal — this is the
 * asset meant to scale down to a favicon or a Telegram avatar later.
 */
export function BrandMark({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("text-gold", className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <path
        d="M12 12 17.3 6.7M17.3 6.7h-3.1M17.3 6.7v3.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
