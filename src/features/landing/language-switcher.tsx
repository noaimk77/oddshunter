"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { locales, localeNames, localeFlags, LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

function setLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function selectLocale(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    setLocaleCookie(next);
    setOpen(false);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        disabled={isPending}
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-60"
      >
        <Globe className="h-4 w-4" />
        <span className="hidden min-[460px]:inline">{localeFlags[locale]}</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-lg border border-border/70 bg-background/95 py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => selectLocale(l)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  l === locale ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <span>{localeFlags[l]}</span>
                <span>{localeNames[l]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
