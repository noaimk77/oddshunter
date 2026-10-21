"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPlanPrice, type PlanDisplay } from "@/lib/plans";

const PLAN_LABEL: Record<PlanDisplay["type"], string> = { VIP: "Groupe VIP", BOT: "Bot" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Actif", PAST_DUE: "Paiement en retard", CANCELED: "Résilié", INCOMPLETE: "Incomplet" };

function PlanCard({
  plan,
  status,
  billingConfigured,
  cryptoConfigured,
  cryptoEndsAt,
}: {
  plan: PlanDisplay;
  status?: string;
  billingConfigured: boolean;
  cryptoConfigured: boolean;
  /** End of the prepaid crypto month, when the plan is active through crypto. */
  cryptoEndsAt?: string;
}) {
  const [loading, setLoading] = useState<"card" | "btc" | "usdc" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isActive = status === "ACTIVE";

  const startCheckout = async (method: "card" | "btc" | "usdc") => {
    setLoading(method);
    setError(null);
    try {
      const res = await fetch(method === "card" ? "/api/stripe/checkout" : "/api/crypto/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "card" ? { priceId: plan.priceId } : { type: plan.type, coin: method }),
      });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data?.error ?? "Une erreur est survenue au démarrage du paiement.");
    } catch {
      setError("Impossible de contacter le serveur. Vérifie ta connexion.");
    } finally {
      setLoading(null);
    }
  };

  const cryptoButtons = cryptoConfigured && (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {(["btc", "usdc"] as const).map((coin) => (
        <Button key={coin} variant="outline" disabled={loading !== null} onClick={() => startCheckout(coin)}>
          {loading === coin ? "Redirection…" : coin === "btc" ? "Payer en Bitcoin" : "Payer en USDC"}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{PLAN_LABEL[plan.type]}</h3>
        {status && (
          <Badge
            className={cn(
              "border",
              isActive
                ? "border-positive/20 bg-positive/10 text-positive"
                : "border-signal-high/20 bg-signal-high/10 text-signal-high"
            )}
          >
            {STATUS_LABEL[status] ?? status}
          </Badge>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{formatPlanPrice(plan)}</p>
      <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

      {isActive && cryptoEndsAt ? (
        <>
          <p className="mt-4 text-xs text-positive">
            Payé en crypto jusqu&apos;au{" "}
            {new Date(cryptoEndsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}.
            Un rappel t&apos;est envoyé par e-mail avant la fin{cryptoConfigured ? " — tu peux aussi prolonger d'un mois dès maintenant :" : "."}
          </p>
          {cryptoButtons}
        </>
      ) : isActive ? (
        <p className="mt-4 text-xs text-positive">Actif — gère-le avec « Gérer la facturation » ci-dessous.</p>
      ) : (
        <>
          <Button className="mt-4 w-full" disabled={!billingConfigured || loading !== null} onClick={() => startCheckout("card")}>
            {!billingConfigured ? "Facturation non configurée" : loading === "card" ? "Redirection…" : `Rejoindre — ${PLAN_LABEL[plan.type]}`}
          </Button>
          {cryptoButtons}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-signal-extreme">
          {error}
        </p>
      )}
    </div>
  );
}

export function PlansAccess({
  plans,
  entitlements,
  billingConfigured,
  cryptoConfigured,
  cryptoEndsAt,
  hasCustomer,
}: {
  plans: PlanDisplay[];
  entitlements: Record<string, string>;
  billingConfigured: boolean;
  cryptoConfigured: boolean;
  cryptoEndsAt: Record<string, string>;
  hasCustomer: boolean;
}) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const handlePortal = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setPortalError(data?.error ?? "Une erreur est survenue à l'ouverture du portail de facturation.");
    } catch {
      setPortalError("Impossible de contacter le serveur. Vérifie ta connexion.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun abonnement n&apos;est configuré pour l&apos;instant.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.type}
            plan={plan}
            status={entitlements[plan.type]}
            billingConfigured={billingConfigured}
            cryptoConfigured={cryptoConfigured}
            cryptoEndsAt={cryptoEndsAt[plan.type]}
          />
        ))}
      </div>
      {hasCustomer && (
        <div className="mt-4">
          <Button variant="outline" disabled={portalLoading} onClick={handlePortal}>
            {portalLoading ? "Ouverture…" : "Gérer la facturation"}
          </Button>
          {portalError && (
            <p role="alert" className="mt-2 text-xs text-signal-extreme">
              {portalError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
