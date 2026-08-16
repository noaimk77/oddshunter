import Link from "next/link";
import { LandingHeader } from "@/features/landing/landing-header";
import { LandingFooter } from "@/features/landing/landing-footer";
import { auth } from "@/lib/auth";

export const metadata = { title: "Mentions légales" };

export default async function MentionsLegalesPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={Boolean(session?.user)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">Mentions légales</h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-sm font-semibold text-foreground">Éditeur du site</h2>
            <p className="mt-2 rounded-md border border-dashed border-border/70 bg-secondary/20 p-4 text-xs">
              Cette section doit contenir l&apos;identité légale de l&apos;éditeur (nom ou raison sociale, statut — auto-entrepreneur,
              société —, numéro SIRET, adresse, email de contact) avant toute mise en ligne publique. Non renseignée pour l&apos;instant —
              à compléter par Noaim.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground">Hébergement</h2>
            <p className="mt-2 rounded-md border border-dashed border-border/70 bg-secondary/20 p-4 text-xs">
              Coordonnées de l&apos;hébergeur du site à renseigner (nom, adresse, contact).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground">Nature du contenu</h2>
            <p className="mt-2">
              Odds Hunter propose des outils de suivi de cotes sportives et des analyses statistiques à titre indicatif. Aucun contenu du
              site — abonnement VIP, bot, ou autre — ne constitue un conseil en investissement, un conseil financier ou une promesse de
              gain. Les décisions de pari relèvent de la seule responsabilité de l&apos;utilisateur.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground">Jeu responsable — 18+</h2>
            <p className="mt-2">
              Les paris sportifs sont interdits aux mineurs et comportent des risques d&apos;addiction. Ne pariez que ce que vous pouvez
              vous permettre de perdre. Assistance et information :{" "}
              <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                joueurs-info-service.fr
              </a>{" "}
              — 09 74 75 13 13 (appel non surtaxé, 7j/7, 9h–2h).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground">Liens d&apos;affiliation</h2>
            <p className="mt-2">
              Ce site peut contenir des liens d&apos;affiliation ou de parrainage vers des opérateurs tiers (bookmakers notamment). Odds
              Hunter peut percevoir une commission sur ces liens, sans coût supplémentaire pour l&apos;utilisateur. Cela n&apos;influence
              pas le contenu ou les analyses présentées.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground">Abonnements</h2>
            <p className="mt-2">
              Les abonnements VIP et Bot sont facturés mensuellement via Stripe et résiliables à tout moment depuis l&apos;espace
              &quot;Mon compte&quot;. La résiliation prend effet à la fin de la période déjà payée.
            </p>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
