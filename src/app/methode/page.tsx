import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Target } from "lucide-react";
import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { Button } from "@/components/ui/button";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";

export const metadata = { title: "Méthode — Oddshunter" };

const PILLAR_ICONS = [Target, ShieldCheck, Sparkles];

export default async function MethodePage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const session = await auth();

  const { methode: t } = dict;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} locale={locale} t={dict.nav} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[800px]" />

        {/* Hero */}
        <section className="relative mx-auto max-w-5xl overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gold/12 blur-[120px]"
          />
          <div className="text-center">
            <Reveal>
              <span className="shimmer inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/8 px-3.5 py-1.5 text-xs font-medium text-gold">
                <span className="signal-pulse relative flex h-1.5 w-1.5 rounded-full bg-gold" />
                {t.eyebrow}
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="mt-6 text-4xl font-bold tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
                {t.title1}{" "}
                <span className="gradient-text">{t.title2}</span>
              </h1>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t.subtitle}
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  render={<Link href="/abonnement#vip" />}
                  nativeButton={false}
                  className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)]"
                >
                  {t.ctaVip}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/abonnement#bot" />}
                  nativeButton={false}
                >
                  {t.ctaBot}
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Steps */}
        <section className="relative mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal>
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
                {t.stepsHeading}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
                {t.stepsIntro}
              </p>
            </div>
          </Reveal>

          <ol className="relative mt-14 space-y-6 sm:space-y-8">
            {/* vertical rail */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-4 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b from-gold/40 via-gold/10 to-transparent sm:block"
            />
            {t.steps.map((step, i) => (
              <li key={step.tag} className="relative">
                <Reveal delay={i * 0.05}>
                  <div className="glow-border relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm">
                    <div className="flex flex-col gap-3 p-6 sm:flex-row sm:gap-8 sm:p-8">
                      <div className="flex shrink-0 items-start gap-3 sm:w-56">
                        <span className="mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-gold/40 bg-gold/10 px-2 text-xs font-semibold text-gold">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wider text-gold/90">
                          {step.tag.split("·").slice(1).join("·").trim() || step.tag}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
                          {step.title}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                          {step.body}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Pillars */}
        <section className="relative mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal>
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
                {t.pillarsHeading}
              </h2>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {t.pillars.map((pillar, i) => {
              const Icon = PILLAR_ICONS[i] ?? Target;
              return (
                <Reveal key={pillar.title} delay={i * 0.08}>
                  <div className="group relative h-full rounded-2xl border border-border/60 bg-card/40 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/25 hover:bg-card/60 hover:shadow-[0_16px_40px_-16px_rgba(245,184,0,0.2)]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/25 bg-gold/8 text-gold">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-foreground">
                      {pillar.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {pillar.body}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative mx-auto max-w-4xl px-4 pb-24 sm:px-6 sm:pb-32">
          <Reveal>
            <div className="glow-border relative overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/[0.04] via-card/60 to-card/30 p-8 text-center sm:p-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--gold)_18%,transparent),transparent_70%)] opacity-40"
              />
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
                {t.ctaHeading}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t.ctaSubtitle}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  render={<Link href="/abonnement#vip" />}
                  nativeButton={false}
                  className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)]"
                >
                  {t.ctaVip}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/outils" />}
                  nativeButton={false}
                >
                  {dict.nav.outils}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <LandingFooter t={dict.footer} />
    </div>
  );
}
