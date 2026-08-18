import { auth } from "@/lib/auth";
import { getPlanDisplays } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { LandingHeader } from "@/features/landing/landing-header";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { SubscriptionSection } from "@/features/landing/subscription-section";

export const metadata = { title: "Abonnement" };

export default async function AbonnementPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const [session, plans] = await Promise.all([auth(), getPlanDisplays()]);
  const isAuthenticated = Boolean(session?.user);
  const billingConfigured = isStripeConfigured();

  const vip = plans.find((p) => p.type === "VIP");
  const bot = plans.find((p) => p.type === "BOT");

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={isAuthenticated} locale={locale} t={dict.nav} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[600px]" />
        <div
          aria-hidden="true"
          className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-gold/12 blur-[120px]"
        />

        <section className="mx-auto max-w-2xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              {dict.abonnement.title1} <span className="gradient-text">{dict.abonnement.title2}</span>
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              {dict.abonnement.subtitle}
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.1}>
            <SubscriptionSection
              vip={vip}
              bot={bot}
              isAuthenticated={isAuthenticated}
              billingConfigured={billingConfigured}
              t={dict.subscription}
            />
          </Reveal>
        </section>
      </main>

      <LandingFooter t={dict.footer} />
    </div>
  );
}
