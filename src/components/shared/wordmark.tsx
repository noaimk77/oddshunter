import Image from "next/image";
import { cn } from "@/lib/utils";

export function Wordmark({ className, markSize = 20 }: { className?: string; markSize?: number }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black ring-1 ring-gold/35 shadow-[0_0_18px_rgba(245,184,0,0.12)]">
        <Image src="/icon.png" alt="" width={markSize + 8} height={markSize + 8} className="h-full w-full object-cover" />
      </span>
      <span className="font-mono text-[15px] font-semibold tracking-[0.1em]">
        <span className="text-foreground">ODDS</span> <span className="text-gold">HUNTER</span>
      </span>
    </span>
  );
}
