"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ToolCardProps {
  badge: string;
  title: string;
  tagline: string;
  description: string;
  howItWorksTitle: string;
  steps: readonly string[];
  statusLabel: string;
  statusValue: string;
  cta: string;
  ctaHref: string;
  tutoLabel: string;
  defaultOpen?: boolean;
}

export function ToolCard({
  badge,
  title,
  tagline,
  description,
  howItWorksTitle,
  steps,
  statusLabel,
  statusValue,
  cta,
  ctaHref,
  tutoLabel,
  defaultOpen = false,
}: ToolCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const isExternal = /^https?:\/\//.test(ctaHref);

  return (
    <div
      className={cn(
        "glow-border relative overflow-hidden rounded-2xl border transition-all duration-500",
        open
          ? "border-gold/25 bg-gradient-to-br from-gold/[0.04] via-card/60 to-card/30 shadow-[0_20px_60px_-20px_rgba(245,184,0,0.25)]"
          : "border-border/60 bg-card/40 hover:border-gold/20"
      )}
    >
      <div className="relative flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="min-w-0 flex-1 space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/8 px-3 py-1 text-xs font-medium text-gold">
              {badge}
            </span>
            <h3 className="text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
              {title}
            </h3>
            <p className="text-base leading-relaxed text-muted-foreground sm:max-w-xl">
              {tagline}
            </p>
          </div>
          <div className="flex shrink-0 items-start sm:pt-2">
            <Button
              size="lg"
              render={isExternal ? <a href={ctaHref} target="_blank" rel="noopener noreferrer" /> : <Link href={ctaHref} />}
              nativeButton={false}
              className="w-full sm:w-auto transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)]"
            >
              {cta}
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "group flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
            open
              ? "border-gold/30 bg-gold/10 text-gold"
              : "border-border/60 bg-transparent text-muted-foreground hover:border-gold/25 hover:bg-gold/5 hover:text-gold"
          )}
        >
          <span>{tutoLabel}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform duration-300",
              open ? "rotate-180" : "rotate-0"
            )}
          />
        </button>

        <div
          className={cn(
            "grid overflow-hidden transition-all duration-500 ease-out",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-6 border-t border-border/60 pt-6">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gold/90">
                  {howItWorksTitle}
                </p>
                <ol className="mt-4 space-y-3">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/8 text-[11px] font-semibold text-gold">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-xl border border-border/50 bg-surface-2 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {statusLabel}
                </p>
                <p className="mt-1 text-sm text-foreground/90">{statusValue}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
