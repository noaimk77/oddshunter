import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { FaqAccordion } from "@/features/landing/faq-accordion";

export const metadata = { title: "FAQ" };

export default async function FaqPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} locale={locale} t={dict.nav} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[500px]" />

        <section className="mx-auto max-w-3xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              {dict.faq.title1} <span className="gradient-text">{dict.faq.title2}</span>
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              {dict.faq.subtitle}
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.1}>
            <FaqAccordion items={[...dict.faq.items]} />
          </Reveal>
        </section>
      </main>

      <LandingFooter t={dict.footer} />
    </div>
  );
}
