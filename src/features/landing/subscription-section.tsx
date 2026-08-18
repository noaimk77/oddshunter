import { Check, Crown, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanDisplay } from "@/lib/plans";
import { CheckoutCta } from "./checkout-cta";

function frPrice(plan?: PlanDisplay): string {
  return plan ? (plan.amount / 100).toFixed(0) : "75";
}

function Column({
  id,
  icon: Icon,
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
  icon: typeof Crown;
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
    <div
      id={id}
      className={cn(
        "relative scroll-mt-20 p-6 sm:p-8",
        accent && "bg-gradient-to-b from-gold/[0.03] to-transparent"
      )}
    >
      {accent && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            accent ? "bg-gold/15 text-gold" : "bg-secondary/60 text-muted-foreground"
          )}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className={cn("text-xs font-semibold tracking-wider uppercase", accent ? "text-gold" : "text-muted-foreground")}>
            {eyebrow}
          </p>
        </div>
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

      <h3 className="mt-3 text-xl font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

      <div className="mt-5 flex items-baseline gap-1">
        <span className="font-mono text-4xl font-bold text-foreground">{price}</span>
        <span className="text-lg text-muted-foreground">€</span>
        <span className="text-sm text-muted-foreground">/mois</span>
      </div>

      <ul className="mt-5 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-positive/15">
              <Check className="h-2.5 w-2.5 text-positive" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
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
    <div id="abonnement" className="glow-border scroll-mt-20 overflow-hidden rounded-2xl border border-border/70 bg-card/40">
      <div className="border-b border-border/70 p-6 text-center sm:p-8">
        <h2 className="text-2xl font-bold text-foreground">Abonnement</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Même prix, deux façons indépendantes d&apos;en profiter — le VIP pour le contexte et les explications, le bot pour
          l&apos;alerte instantanée sans lecture. S&apos;abonner à l&apos;un ne donne pas accès à l&apos;autre.
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Column
          id="vip"
          icon={Crown}
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
          icon={Cpu}
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
