"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={item.question}
            className={cn(
              "rounded-xl border transition-all duration-300",
              open
                ? "border-gold/20 bg-gold/[0.03] shadow-[0_4px_16px_-8px_rgba(245,184,0,0.1)]"
                : "border-border/60 bg-card/30 hover:border-border/80"
            )}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className={cn(
                "text-sm font-medium transition-colors",
                open ? "text-foreground" : "text-foreground/80"
              )}>
                {item.question}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-all duration-300",
                  open ? "rotate-180 text-gold" : "text-muted-foreground"
                )}
              />
            </button>
            <div
              className={cn(
                "grid overflow-hidden px-5 text-sm leading-relaxed text-muted-foreground transition-all duration-300 ease-out",
                open ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
