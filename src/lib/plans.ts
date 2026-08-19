import { unstable_cache } from "next/cache";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export interface PlanDisplay {
  type: "VIP" | "BOT";
  priceId: string;
  name: string;
  description: string;
  amount: number; // in the currency's smallest unit, e.g. cents
  currency: string;
  interval: string | null; // Stripe's recurring.interval (day/week/month/year), or null for one-time
}

/**
 * Static fallback mirrors exactly what the Stripe MCP connector read from
 * the live "Odds.Hunter98" account during setup (see the mission report) —
 * not fabricated. When STRIPE_SECRET_KEY is present this is bypassed in
 * favor of a live read, so a price change in Stripe is reflected without a
 * code change.
 */
const STATIC_FALLBACK: Omit<PlanDisplay, "priceId">[] = [
  {
    type: "VIP",
    name: "Odds Hunter - Telegram VIP",
    description: "Accès au canal Telegram VIP pour les signaux de matches suspects",
    amount: 7500,
    currency: "eur",
    interval: "month",
  },
  {
    type: "BOT",
    name: "Odds Hunter - Bots Access",
    description: "Accès aux bots automatisés pour le suivi des matches suspects",
    amount: 7500,
    currency: "eur",
    interval: "month",
  },
];

async function fetchOnePlan(type: "VIP" | "BOT", priceId: string): Promise<PlanDisplay> {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = price.product;
    const name = typeof product === "object" && "name" in product ? product.name : STATIC_FALLBACK.find((f) => f.type === type)!.name;
    const description =
      typeof product === "object" && "description" in product && product.description
        ? product.description
        : STATIC_FALLBACK.find((f) => f.type === type)!.description;
    return {
      type,
      priceId,
      name,
      description,
      amount: price.unit_amount ?? 0,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
    };
  } catch (err) {
    console.error(`[plans] failed to fetch live price for ${type}`, err);
    return { ...STATIC_FALLBACK.find((f) => f.type === type)!, priceId };
  }
}

/**
 * Live Stripe reads are a real network round-trip (two of them, previously
 * sequential — one of the causes behind the site feeling slow on every
 * navigation to "/" or "/abonnement"). Cached for 15 minutes: plenty fresh
 * for a price that changes rarely, and it turns nearly every page load
 * after the first into a cache hit instead of a Stripe API call.
 */
const getCachedLivePlans = unstable_cache(
  async (vipPriceId: string | undefined, botPriceId: string | undefined): Promise<PlanDisplay[]> => {
    const ids: { type: "VIP" | "BOT"; priceId?: string }[] = [
      { type: "VIP", priceId: vipPriceId },
      { type: "BOT", priceId: botPriceId },
    ];
    const results = await Promise.all(
      ids.filter((i) => i.priceId).map((i) => fetchOnePlan(i.type, i.priceId!))
    );
    return results;
  },
  ["plan-displays"],
  { revalidate: 900 }
);

export async function getPlanDisplays(): Promise<PlanDisplay[]> {
  const vipPriceId = process.env.STRIPE_PRICE_VIP;
  const botPriceId = process.env.STRIPE_PRICE_BOT;

  if (!isStripeConfigured()) {
    const ids: { type: "VIP" | "BOT"; priceId?: string }[] = [
      { type: "VIP", priceId: vipPriceId },
      { type: "BOT", priceId: botPriceId },
    ];
    return ids
      .filter((i) => i.priceId)
      .map((i) => ({ ...STATIC_FALLBACK.find((f) => f.type === i.type)!, priceId: i.priceId! }));
  }

  return getCachedLivePlans(vipPriceId, botPriceId);
}

const INTERVAL_LABEL_FR: Record<string, string> = { day: "jour", week: "semaine", month: "mois", year: "an" };

export function formatPlanPrice(plan: PlanDisplay): string {
  const amount = (plan.amount / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
  });
  return plan.interval ? `${amount}/${INTERVAL_LABEL_FR[plan.interval] ?? plan.interval}` : `${amount} (paiement unique)`;
}
