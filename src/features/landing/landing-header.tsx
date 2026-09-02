"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import type { Locale } from "@/i18n/locales";
import type { Dictionary } from "@/i18n/dictionaries/fr";

export function LandingHeader({
  isAuthenticated,
  locale,
  t,
}: {
  isAuthenticated: boolean;
  locale: Locale;
  t: Dictionary["nav"];
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV_LINKS = [
    { label: t.subscription, href: "/abonnement" },
    { label: t.bookmakers, href: "/bookmakers" },
    { label: t.social, href: "/reseaux" },
    { label: t.faq, href: "/faq" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl transition-all duration-500",
          scrolled ? "border-border/80 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.7)]" : "border-transparent"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex" aria-label={t.homeAria}>
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map(({ label, href }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative rounded-md px-3 py-1.5 text-sm transition-all duration-300",
                    isActive
                      ? "bg-gold/10 text-gold shadow-[0_0_20px_-4px_rgba(245,184,0,0.55)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-2 -bottom-[13px] h-px bg-gradient-to-r from-transparent via-gold to-transparent"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} label={t.languageLabel} />

            {isAuthenticated ? (
              <Button size="sm" variant="outline" render={<Link href="/account" />} nativeButton={false}>
                {t.account}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  render={<Link href="/login" />}
                  nativeButton={false}
                  className="hidden min-[390px]:flex"
                >
                  {t.login}
                </Button>
                <Button size="sm" render={<Link href="/register" />} nativeButton={false}>
                  {t.register}
                </Button>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:hidden"
              aria-label={mobileOpen ? t.closeMenu : t.openMenu}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[57px] z-30 border-b border-border/70 bg-background backdrop-blur-xl sm:hidden"
          >
            <nav className="flex flex-col px-4 py-3">
              {NAV_LINKS.map(({ label, href }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-gold/10 text-gold shadow-[0_0_20px_-6px_rgba(245,184,0,0.5)]"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
