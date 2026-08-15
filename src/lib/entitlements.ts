import type Stripe from "stripe";
import { db } from "@/lib/db";
import { PRICE_TO_ENTITLEMENT } from "@/lib/stripe";

/** Maps Stripe's subscription lifecycle onto our simpler internal states. */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    case "incomplete":
    case "paused":
    default:
      return "INCOMPLETE";
  }
}

/**
 * Upserts an Entitlement row from a Stripe Subscription object. Called from
 * the webhook handler — idempotent by design (an upsert keyed on
 * userId+type), so a redelivered event just overwrites with the same data.
 */
export async function syncEntitlementFromSubscription(subscription: Stripe.Subscription): Promise<void> {
  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const type = priceId ? PRICE_TO_ENTITLEMENT[priceId] : undefined;
  if (!type) return; // not one of the two Odds Hunter products — ignore

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const user = await db.user.findFirst({ where: { stripeCustomerId: customerId } });
  if (!user) return; // unknown customer — nothing in our DB to update

  const status = mapStripeStatus(subscription.status);
  const currentPeriodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await db.entitlement.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: {
      userId: user.id,
      type,
      status,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd,
    },
    update: {
      status,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodEnd,
    },
  });
}
