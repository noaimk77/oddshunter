import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { FaqAccordion } from "@/features/landing/faq-accordion";

export const metadata = { title: "FAQ" };

export default async function FaqPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[500px]" />

        <section className="mx-auto max-w-3xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              Questions <span className="gradient-text">fréquentes</span>
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Tout ce qu&apos;il faut savoir avant de rejoindre.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.1}>
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
