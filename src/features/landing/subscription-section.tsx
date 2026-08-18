import { Check, Crown, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanDisplay } from "@/lib/plans";
import type { Dictionary } from "@/i18n/dictionaries/fr";
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
  perMonth,
  isAuthenticated,
  footnote,
  notConfiguredLabel,
  accent = false,
}: {
  id: string;
  icon: typeof Crown;
  eyebrow: string;
  title: string;
  status: { label: string; tone: "live" | "soon" };
  description: string;
  features: readonly string[];
  ctaLabel: string;
  priceId?: string;
  price: string;
  perMonth: string;
  isAuthenticated: boolean;
  footnote: string;
  notConfiguredLabel: string;
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
        <span className="text-sm text-muted-foreground">{perMonth}</span>
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
            {notConfiguredLabel}
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
  t,
}: {
  vip?: PlanDisplay;
  bot?: PlanDisplay;
  isAuthenticated: boolean;
  billingConfigured: boolean;
  t: Dictionary["subscription"];
}) {
  return (
    <div id="abonnement" className="glow-border scroll-mt-20 overflow-hidden rounded-2xl border border-border/70 bg-card/40">
      <div className="border-b border-border/70 p-6 text-center sm:p-8">
        <h2 className="text-2xl font-bold text-foreground">{t.heading}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Column
          id="vip"
          icon={Crown}
          eyebrow={t.vip.eyebrow}
          title={t.vip.title}
          status={{ label: t.vip.statusLabel, tone: "live" }}
          price={frPrice(vip)}
          perMonth={t.perMonth}
          description={t.vip.description}
          features={t.vip.features}
          ctaLabel={`${t.vip.cta} – ${frPrice(vip)} €${t.perMonth}`}
          priceId={vip?.priceId}
          isAuthenticated={isAuthenticated}
          footnote={billingConfigured ? t.vip.footnoteConfigured : t.vip.footnoteNotConfigured}
          notConfiguredLabel={t.notConfigured}
          accent
        />
        <Column
          id="bot"
          icon={Cpu}
          eyebrow={t.bot.eyebrow}
          title={t.bot.title}
          status={{ label: t.bot.statusLabel, tone: "soon" }}
          price={frPrice(bot)}
          perMonth={t.perMonth}
          description={t.bot.description}
          features={t.bot.features}
          ctaLabel={`${t.bot.cta} – ${frPrice(bot)} €${t.perMonth}`}
          priceId={bot?.priceId}
          isAuthenticated={isAuthenticated}
          footnote={t.bot.footnote}
          notConfiguredLabel={t.notConfigured}
        />
      </div>
    </div>
  );
}
