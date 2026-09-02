"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { locales, localeNames, localeFlags, LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

function setLocaleCookie(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSetting({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function selectLocale(next: Locale) {
    if (next === locale) return;
    setLocaleCookie(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap gap-2", isPending && "opacity-60")}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => selectLocale(l)}
          disabled={isPending}
          aria-pressed={l === locale}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
            l === locale
              ? "border-gold/30 bg-gold/10 text-gold"
              : "border-border/70 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          )}
        >
          <span>{localeFlags[l]}</span>
          <span>{localeNames[l]}</span>
        </button>
      ))}
    </div>
  );
}
