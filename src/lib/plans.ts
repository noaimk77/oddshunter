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

export async function getPlanDisplays(): Promise<PlanDisplay[]> {
  const vipPriceId = process.env.STRIPE_PRICE_VIP;
  const botPriceId = process.env.STRIPE_PRICE_BOT;
  const ids: { type: "VIP" | "BOT"; priceId?: string }[] = [
    { type: "VIP", priceId: vipPriceId },
    { type: "BOT", priceId: botPriceId },
  ];

  if (!isStripeConfigured()) {
    return ids
      .filter((i) => i.priceId)
      .map((i) => ({ ...STATIC_FALLBACK.find((f) => f.type === i.type)!, priceId: i.priceId! }));
  }

  const results: PlanDisplay[] = [];
  for (const { type, priceId } of ids) {
    if (!priceId) continue;
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      const product = price.product;
      const name = typeof product === "object" && "name" in product ? product.name : STATIC_FALLBACK.find((f) => f.type === type)!.name;
      const description =
        typeof product === "object" && "description" in product && product.description
          ? product.description
          : STATIC_FALLBACK.find((f) => f.type === type)!.description;
      results.push({
        type,
        priceId,
        name,
        description,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        interval: price.recurring?.interval ?? null,
      });
    } catch (err) {
      console.error(`[plans] failed to fetch live price for ${type}`, err);
      results.push({ ...STATIC_FALLBACK.find((f) => f.type === type)!, priceId });
    }
  }
  return results;
}

export function formatPlanPrice(plan: PlanDisplay): string {
  const amount = (plan.amount / 100).toLocaleString("en-US", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.amount % 100 === 0 ? 0 : 2,
  });
  return plan.interval ? `${amount}/${plan.interval}` : `${amount} one-time`;
}
