import { ArrowRight, Clock, ExternalLink, Landmark } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Bookmakers" };

export default async function BookmakersPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[600px]" />
        <div
          aria-hidden="true"
          className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-gold/12 blur-[120px]"
        />

        <section className="mx-auto max-w-2xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              Les <span className="gradient-text">bookmakers</span> que j&apos;utilise
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              Mes codes et liens de parrainage, mis à jour au fur et à mesure.
            </p>
          </Reveal>
        </section>

        {/* 1xBet — featured */}
        <section className="mx-auto max-w-2xl px-4 pb-8 sm:px-6">
          <Reveal delay={0.1}>
            <Link
              href="/1xbet"
              className="glow-border group relative block overflow-hidden rounded-2xl border border-gold/25 bg-card/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_-16px_rgba(245,184,0,0.3)] sm:p-10"
            >
              <span className="shimmer inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/8 px-3 py-1 text-xs font-medium text-gold">
                Partenaire principal
              </span>
              <h2 className="mt-5 text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl">
                1<span className="text-gold">x</span>Bet
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Code promo personnel <span className="font-mono font-semibold text-gold">Oddshunter</span> — bonus de bienvenue à
                l&apos;inscription.
              </p>
              <Button
                size="lg"
                className="mt-6 gap-2 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)]"
              >
                Voir l&apos;offre 1xBet <ArrowRight className="h-4 w-4" />
              </Button>
              <ExternalLink className="absolute top-8 right-8 h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:top-10 sm:right-10" />
            </Link>
          </Reveal>
        </section>

        {/* Others — coming soon */}
        <section className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.14}>
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/50 bg-card/20 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground">
                <Landmark className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">D&apos;autres bookmakers arrivent</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Bientôt disponible.
              </p>
            </div>
          </Reveal>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
