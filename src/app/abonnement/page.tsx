import { auth } from "@/lib/auth";
import { getPlanDisplays } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { SubscriptionSection } from "@/features/landing/subscription-section";

export const metadata = { title: "Abonnement" };

export default async function AbonnementPage() {
  const [session, plans] = await Promise.all([auth(), getPlanDisplays()]);
  const isAuthenticated = Boolean(session?.user);
  const billingConfigured = isStripeConfigured();

  const vip = plans.find((p) => p.type === "VIP");
  const bot = plans.find((p) => p.type === "BOT");

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={isAuthenticated} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[600px]" />
        <div
          aria-hidden="true"
          className="ambient-glow pointer-events-none absolute top-0 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-gold/12 blur-[120px]"
        />

        <section className="mx-auto max-w-2xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              Rejoins l&apos;<span className="gradient-text">abonnement</span>
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              Deux façons indépendantes de suivre les signaux — choisis celle qui te convient.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.1}>
            <SubscriptionSection vip={vip} bot={bot} isAuthenticated={isAuthenticated} billingConfigured={billingConfigured} />
          </Reveal>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
