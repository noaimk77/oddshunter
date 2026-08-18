import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { getLocale } from "@/i18n/get-locale";
import { getDictionary } from "@/i18n/get-dictionary";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { SocialSection } from "@/features/landing/social-section";

export const metadata = { title: "Réseaux" };

export default async function ReseauxPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} locale={locale} t={dict.nav} />

      <main className="relative flex-1">
        <div aria-hidden="true" className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 -z-10 h-[500px]" />

        <section className="mx-auto max-w-2xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              {dict.social.pageTitle1} <span className="gradient-text">{dict.social.pageTitle2}</span>
            </h1>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              {dict.social.pageSubtitle}
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.1}>
            <SocialSection t={dict.social} />
          </Reveal>
        </section>
      </main>

      <LandingFooter t={dict.footer} />
    </div>
  );
}
