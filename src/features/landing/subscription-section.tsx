import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanDisplay } from "@/lib/plans";
import { CheckoutCta } from "./checkout-cta";

function frPrice(plan?: PlanDisplay): string {
  return plan ? (plan.amount / 100).toFixed(0) : "75";
}

function Column({
  id,
  eyebrow,
  title,
  status,
  description,
  features,
  ctaLabel,
  priceId,
  price,
  isAuthenticated,
  footnote,
  accent = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  status: { label: string; tone: "live" | "soon" };
  description: string;
  features: string[];
  ctaLabel: string;
  priceId?: string;
  price: string;
  isAuthenticated: boolean;
  footnote: string;
  accent?: boolean;
}) {
  return (
    <div id={id} className="scroll-mt-20 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-xs font-semibold tracking-wider uppercase", accent ? "text-gold" : "text-muted-foreground")}>
          {eyebrow}
        </p>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 border",
            status.tone === "live" ? "border-positive/25 text-positive" : "border-signal-watch/30 text-signal-watch"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", status.tone === "live" ? "signal-pulse bg-positive" : "bg-signal-watch")} />
          {status.label}
        </Badge>
      </div>

      <h3 className="mt-2 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <p className="mt-4 font-mono text-3xl font-semibold text-foreground">
        {price} €<span className="text-sm font-normal text-muted-foreground">/mois</span>
      </p>

      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {priceId ? (
          <CheckoutCta priceId={priceId} isAuthenticated={isAuthenticated} label={ctaLabel} variant={accent ? "default" : "outline"} />
        ) : (
          <p className="rounded-md border border-dashed border-border/70 px-4 py-3 text-center text-xs text-muted-foreground">
            Cette offre n&apos;est pas encore configurée dans Stripe.
          </p>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">{footnote}</p>
      </div>
    </div>
  );
}

export function SubscriptionSection({
  vip,
  bot,
  isAuthenticated,
  billingConfigured,
}: {
  vip?: PlanDisplay;
  bot?: PlanDisplay;
  isAuthenticated: boolean;
  billingConfigured: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40">
      <div className="border-b border-border/70 p-6 text-center sm:p-8">
        <h2 className="text-2xl font-semibold text-foreground">Abonnement</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Même prix, deux façons indépendantes d&apos;en profiter — le VIP pour le contexte et les explications, le bot pour
          l&apos;alerte instantanée sans lecture. S&apos;abonner à l&apos;un ne donne pas accès à l&apos;autre.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Column
          id="vip"
          eyebrow="Groupe VIP"
          title="Canal Telegram VIP"
          status={{ label: "Actif", tone: "live" }}
          price={frPrice(vip)}
          description="Un canal Telegram privé où les mouvements de cotes suspects et les analyses sont partagés directement, au fil de la journée."
          features={[
            "Signaux dès qu'un mouvement de cote significatif est repéré",
            "Contexte et explication derrière chaque signal",
            "Résiliable à tout moment depuis ton compte",
          ]}
          ctaLabel={`Rejoindre le VIP – ${frPrice(vip)} €/mois`}
          priceId={vip?.priceId}
          isAuthenticated={isAuthenticated}
          footnote={billingConfigured ? "Paiement sécurisé via Stripe." : "La facturation n'est pas encore configurée sur cet environnement."}
          accent
        />
        <Column
          id="bot"
          eyebrow="Bot automatisé"
          title="Bot Odds Hunter"
          status={{ label: "Bientôt disponible", tone: "soon" }}
          price={frPrice(bot)}
          description="Un bot qui surveille les cotes et t'alerte automatiquement, sans avoir à suivre le canal en continu. En cours de configuration."
          features={[
            "Alertes automatiques dès qu'un mouvement dépasse un seuil",
            "Aucune analyse manuelle à lire — juste le signal",
            "Résiliable à tout moment depuis ton compte",
          ]}
          ctaLabel={`Accéder au bot – ${frPrice(bot)} €/mois`}
          priceId={bot?.priceId}
          isAuthenticated={isAuthenticated}
          footnote="Abonnement ouvert dès maintenant, l'accès démarrera au lancement."
        />
      </div>
    </div>
  );
}
