import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { getPlanDisplays, type PlanDisplay } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { FaqAccordion } from "@/features/landing/faq-accordion";
import { SocialSection } from "@/features/landing/social-section";
import { BookmakersSection } from "@/features/landing/bookmakers-section";
import { SubscriptionSection } from "@/features/landing/subscription-section";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Oddshunter" };

/** Just the number, e.g. "75" — callers append "€" or "€/mois" themselves so it's never doubled up. */
function frPrice(plan: PlanDisplay): string {
  return (plan.amount / 100).toFixed(0);
}

export default async function LandingPage() {
  const [session, plans] = await Promise.all([auth(), getPlanDisplays()]);
  const isAuthenticated = Boolean(session?.user);
  const billingConfigured = isStripeConfigured();

  const vip = plans.find((p) => p.type === "VIP");
  const bot = plans.find((p) => p.type === "BOT");

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={isAuthenticated} />

      <main className="flex-1">
        {/* 1. Hero */}
        <section className="relative mx-auto max-w-6xl overflow-hidden px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gold/20 blur-[110px]"
          />
          <div
            aria-hidden="true"
            className="ambient-glow-slow pointer-events-none absolute top-20 left-1/4 -z-10 h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-gold/10 blur-[100px]"
          />
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              <span className="signal-pulse relative flex h-1.5 w-1.5 rounded-full bg-gold" />
              Signaux partagés en direct
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Deux façons de suivre mes signaux
            </h1>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
              Un groupe VIP animé au quotidien, ou un bot automatisé pour ne rien manquer. Deux offres indépendantes, même
              prix.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                render={<a href="#vip" />}
                nativeButton={false}
                className="transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(212,175,55,0.4)]"
              >
                Rejoindre le VIP – {vip ? frPrice(vip) : "75"} €/mois
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href="#bot" />}
                nativeButton={false}
                className="transition-transform hover:-translate-y-0.5"
              >
                Accéder au bot – {bot ? frPrice(bot) : "75"} €/mois
              </Button>
            </div>
          </Reveal>
          <Reveal delay={0.26}>
            <a
              href="#reseaux"
              className="mt-10 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-gold"
            >
              <Sparkles className="h-3 w-3" />
              Suivre Odds Hunter ailleurs
            </a>
          </Reveal>
        </section>

        {/* 2. Social + affiliates — up top, two distinct boxes */}
        <section id="reseaux" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-10 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <SocialSection />
            </Reveal>
            <Reveal delay={0.08}>
              <BookmakersSection />
            </Reveal>
          </div>
        </section>

        {/* 3. Subscription — VIP + Bot, one section */}
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <Reveal>
            <SubscriptionSection vip={vip} bot={bot} isAuthenticated={isAuthenticated} billingConfigured={billingConfigured} />
          </Reveal>
        </section>

        {/* 4. FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14 sm:px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-foreground">Questions fréquentes</h2>
          </Reveal>
          <Reveal delay={0.06} className="mt-8">
            <FaqAccordion
              items={[
                {
                  question: "Le VIP et le Bot donnent-ils accès au même contenu ?",
                  answer:
                    "Non. Ce sont deux offres distinctes et indépendantes. S'abonner au VIP ne donne pas accès au bot, et inversement — chacune doit être souscrite séparément.",
                },
                {
                  question: "Le bot est-il déjà actif ?",
                  answer:
                    "Pas encore. Il est en cours de configuration. L'abonnement est ouvert dès maintenant pour réserver ton accès, qui démarrera au lancement.",
                },
                {
                  question: "Puis-je annuler à tout moment ?",
                  answer:
                    "Oui. La résiliation se fait en un clic depuis la page \"Mon compte\", via le portail de facturation Stripe. Elle prend effet à la fin de la période déjà payée.",
                },
                {
                  question: "Les signaux garantissent-ils des gains ?",
                  answer:
                    "Non, aucune garantie. Ce sont des analyses statistiques basées sur des mouvements de cotes réels, pas un conseil financier ni une promesse de résultat.",
                },
                {
                  question: "Comment j'accède au canal après mon abonnement ?",
                  answer: "Une fois l'abonnement VIP actif, l'accès au canal Telegram privé te sera communiqué directement.",
                },
              ]}
            />
          </Reveal>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
