import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { ToolCard } from "@/features/landing/tool-card";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";

export const metadata = { title: "Outils — Oddshunter" };

export default async function OutilsPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const session = await auth();

  const { outils: t } = dict;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} locale={locale} t={dict.nav} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[700px]" />

        {/* Hero */}
        <section className="relative mx-auto max-w-5xl overflow-hidden px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24 sm:pb-14">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gold/12 blur-[120px]"
          />
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
        </section>

        {/* Tools list */}
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 sm:pb-32">
          <div className="space-y-6 sm:space-y-8">
            {t.tools.map((tool, i) => (
              <Reveal key={tool.title} delay={i * 0.06}>
                <ToolCard
                  badge={tool.badge}
                  title={tool.title}
                  tagline={tool.tagline}
                  description={tool.description}
                  howItWorksTitle={tool.howItWorksTitle}
                  steps={tool.steps}
                  statusLabel={tool.statusLabel}
                  statusValue={tool.statusValue}
                  cta={tool.cta}
                  ctaHref={tool.ctaHref}
                  tutoLabel={t.tutoLabel}
                  defaultOpen={i === 0}
                />
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <LandingFooter t={dict.footer} />
    </div>
  );
}
