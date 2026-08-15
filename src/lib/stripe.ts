import Stripe from "stripe";

/**
 * No apiVersion override — the SDK's bundled default already matches its
 * own generated types (2026-07-29.dahlia as of stripe@22.5.0). Pinning it
 * to a different string would silently desync request/response shapes from
 * what the TypeScript types promise.
 *
 * Constructed lazily: `new Stripe("")` throws immediately at module-evaluation
 * time (not on first request), which would crash every page that imports
 * this file — including ones that correctly check `isStripeConfigured()`
 * before touching `stripe` — whenever STRIPE_SECRET_KEY is unset.
 */
let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set — check isStripeConfigured() before using `stripe`.");
  }
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver);
  },
});

/**
 * The only two products this app is allowed to sell — both confirmed via
 * the Stripe MCP connector against the real "Odds.Hunter98" live account.
 * Never accept an arbitrary priceId from the client; always check against
 * this map server-side (see requireAuth + the checkout route).
 */
export const PRICE_TO_ENTITLEMENT: Record<string, "VIP" | "BOT"> = Object.fromEntries(
  [
    [process.env.STRIPE_PRICE_VIP, "VIP"],
    [process.env.STRIPE_PRICE_BOT, "BOT"],
  ].filter(([priceId]) => Boolean(priceId)) as [string, "VIP" | "BOT"][]
);

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
