import { CheckCircle2, Clock, ExternalLink, PlayCircle, ShieldAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { Reveal } from "@/features/landing/reveal";
import { Button } from "@/components/ui/button";
import { CopyCodeButton } from "@/features/affiliates/copy-code-button";

export const metadata = { title: "1xBet — code promo Oddshunter" };

const PROMO_CODE = "Oddshunter";
const SIGNUP_URL = "https://1xbet.com/";

const STEPS = [
  "Clique sur \"S'inscrire sur 1xBet\" ci-dessous pour ouvrir la page d'inscription.",
  "Crée ton compte, puis colle le code Oddshunter dans le champ \"code promo\" à l'inscription.",
  "Profite de ton bonus de bienvenue — les conditions exactes sont affichées par 1xBet au moment de l'inscription.",
];

export default async function OneXBetPage() {
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

        <section className="mx-auto max-w-3xl px-4 pt-16 pb-8 text-center sm:px-6 sm:pt-24">
          <Reveal>
            <span className="shimmer inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/8 px-3.5 py-1.5 text-xs font-medium text-gold">
              Partenaire
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
              Inscris-toi sur <span className="gradient-text">1xBet</span> avec mon code
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              Utilise le code promo ci-dessous à l&apos;inscription pour profiter de l&apos;offre de bienvenue 1xBet.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto max-w-xl px-4 pb-12 sm:px-6">
          <Reveal delay={0.16}>
            <div className="glow-border rounded-2xl border border-gold/20 bg-card/40 p-6 text-center sm:p-8">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Code promo</p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="rounded-lg border border-gold/25 bg-gold/8 px-5 py-2.5 font-mono text-2xl font-bold tracking-wide text-gold sm:text-3xl">
                  {PROMO_CODE}
                </span>
                <CopyCodeButton code={PROMO_CODE} />
              </div>

              <Button
                size="lg"
                render={<a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer nofollow sponsored" />}
                nativeButton={false}
                className="mt-6 w-full gap-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_-8px_rgba(245,184,0,0.35)] sm:w-auto"
              >
                S&apos;inscrire sur 1xBet <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
          <Reveal delay={0.06}>
            <h2 className="text-center text-lg font-bold text-foreground">Comment ça marche</h2>
          </Reveal>
          <div className="mt-6 space-y-3">
            {STEPS.map((step, i) => (
              <Reveal key={step} delay={0.1 + i * 0.05}>
                <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/10 font-mono text-xs font-bold text-gold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground/90">{step}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Video tutorial — placeholder until the YouTube link is added */}
        <section className="mx-auto max-w-2xl px-4 pb-12 sm:px-6">
          <Reveal delay={0.1}>
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/50 bg-card/20 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/8 text-gold">
                <PlayCircle className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">Tuto vidéo — bientôt disponible</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Le lien YouTube sera ajouté ici prochainement.
              </p>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
          <Reveal delay={0.06}>
            <div className="rounded-xl border border-border/70 bg-secondary/20 p-5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Lien d&apos;affiliation.</span> Odds Hunter perçoit une
                    commission sur les inscriptions via ce code, sans coût supplémentaire pour toi. Cela n&apos;influence pas
                    le contenu du site.
                  </p>
                  <p>
                    <span className="font-medium text-foreground">18+.</span> Les paris sportifs sont interdits aux mineurs et
                    comportent des risques d&apos;addiction. Ne parie que ce que tu peux te permettre de perdre. Assistance :{" "}
                    <a
                      href="https://www.joueurs-info-service.fr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      joueurs-info-service.fr
                    </a>{" "}
                    — 09 74 75 13 13.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-gold" /> Code personnel Oddshunter — valable sans lien direct.
            </p>
          </Reveal>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
