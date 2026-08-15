import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";

export function Wordmark({ className, markSize = 20 }: { className?: string; markSize?: number }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold/10 ring-1 ring-gold/25">
        <BrandMark size={markSize} />
      </span>
      <span className="font-mono text-[15px] font-semibold tracking-[0.1em]">
        <span className="text-foreground">ODDS</span> <span className="text-gold">HUNTER</span>
      </span>
    </span>
  );
}
