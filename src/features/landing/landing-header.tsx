"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md transition-shadow duration-300",
        scrolled ? "border-border shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)]" : "border-border/70"
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#reseaux" className="transition-colors hover:text-foreground">Réseaux</a>
          <a href="#vip" className="transition-colors hover:text-foreground">VIP</a>
          <a href="#bot" className="transition-colors hover:text-foreground">Bot</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button size="sm" variant="outline" render={<Link href="/account" />} nativeButton={false}>
              Mon compte
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" render={<Link href="/login" />} nativeButton={false}>
                Connexion
              </Button>
              <Button size="sm" render={<Link href="/register" />} nativeButton={false}>
                Créer un compte
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
