import { Activity, ArrowRight, BellRing, CreditCard, HelpCircle, Landmark, Share2, Sparkles, TimerReset } from "lucide-react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPlanDisplays, type PlanDisplay } from "@/lib/plans";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { ScrollToTop } from "@/features/landing/scroll-to-top";
import { Button } from "@/components/ui/button";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";

export const metadata = { title: "Oddshunter" };

function frPrice(plan: PlanDisplay): string {
  return (plan.amount / 100).toFixed(0);
}

const EXPLORE_CARDS = [
  {
    href: "/abonnement",
    icon: CreditCard,
    title: "Abonnement",
    description: "Canal VIP ou bot automatisé, 75€/mois chacun.",
  },
  {
    href: "/bookmakers",
    icon: Landmark,
    title: "Bookmakers",
    description: "Mes codes et liens de parrainage — 1xBet en ce moment.",
  },
  {
    href: "/reseaux",
    icon: Share2,
    title: "Réseaux",
    description: "Telegram, Instagram, TikTok, X, YouTube.",
  },
  {
    href: "/faq",
    icon: HelpCircle,
    title: "FAQ",
    description: "Ce qu'il faut savoir avant de rejoindre.",
  },
];

export default async function LandingPage() {
  const [session, plans] = await Promise.all([auth(), getPlanDisplays()]);
  const isAuthenticated = Boolean(session?.user);

  const vip = plans.find((p) => p.type === "VIP");
  const bot = plans.find((p) => p.type === "BOT");

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={isAuthenticated} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[800px]" />

        {/* Hero */}
        <section className="relative mx-auto max-w-6xl overflow-hidden px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-24">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gold/15 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="ambient-glow-slow pointer-events-none absolute top-24 left-1/4 -z-10 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-gold/8 blur-[100px]"
          />
          <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6">
            <div className="text-center lg:text-left">
              <Reveal>
                <span className="shimmer inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/8 px-3.5 py-1.5 text-xs font-medium text-gold">
                  <span className="signal-pulse relative flex h-1.5 w-1.5 rounded-full bg-gold" />
                  Signaux partagés en direct
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <h1 className="mt-7 text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[3.6rem] lg:leading-[1.05]">
                  Les mouvements de cotes,{" "}
                  <span className="gradient-text block">avant qu&apos;ils ne passent.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.14}>
                <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:mx-0 lg:text-lg">
                  Suis mes signaux via un groupe VIP animé au quotidien, ou laisse le bot automatisé surveiller les mouvements pour toi.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                  <Button
                    size="lg"
                    render={<Link href="/abonnement#vip" />}
                    nativeButton={false}
                    className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)]"
                  >
                    Rejoindre le VIP – {vip ? frPrice(vip) : "75"} €/mois
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    render={<Link href="/abonnement#bot" />}
                    nativeButton={false}
                    className="transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Accéder au bot – {bot ? frPrice(bot) : "75"} €/mois
                  </Button>
                </div>
              </Reveal>
              <Reveal delay={0.26}>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground lg:justify-start">
                  <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-gold" /> Analyses en direct</span>
                  <span className="inline-flex items-center gap-1.5"><BellRing className="h-3.5 w-3.5 text-gold" /> Alertes automatiques</span>
                  <span className="inline-flex items-center gap-1.5"><TimerReset className="h-3.5 w-3.5 text-gold" /> Résiliable à tout moment</span>
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.16} className="relative hidden min-h-[430px] lg:block">
              <div className="absolute inset-x-10 top-14 h-72 rounded-full bg-gold/10 blur-[80px]" aria-hidden="true" />
              <div className="absolute inset-x-4 bottom-3 h-px bg-gradient-to-r from-transparent via-gold/35 to-transparent" aria-hidden="true" />
              <OddsHunterMascot className="absolute bottom-0 left-1/2 !h-[430px] !w-[390px] -translate-x-1/2" />
              <div className="absolute right-3 bottom-16 rounded-xl border border-gold/20 bg-background/80 px-3 py-2 backdrop-blur-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Oddshunter</p>
                <p className="mt-0.5 text-xs font-medium text-gold">Veille active</p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.3} className="text-center lg:text-left">
            <Link href="/reseaux" className="mt-10 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold">
              <Sparkles className="h-3 w-3" /> Suivre Odds Hunter ailleurs
            </Link>
          </Reveal>
        </section>

        {/* Explore — links out to the dedicated pages */}
        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EXPLORE_CARDS.map(({ href, icon: Icon, title, description }, i) => (
              <Reveal key={href} delay={i * 0.05}>
                <Link
                  href={href}
                  className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-[0_12px_32px_-16px_rgba(245,184,0,0.25)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/8 text-gold">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{title}</h3>
                  <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    Voir <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <LandingFooter />
      <ScrollToTop />
    </div>
  );
}
