import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { syncEntitlementFromSubscription } from "@/lib/entitlements";

/**
 * Stripe signs the raw request body — reading it as text (not `.json()`)
 * before verification is what makes constructEvent trustworthy at all.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook is not configured on this deployment." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency: a redelivered event id is a no-op. Stripe retries on any
  // non-2xx response, so duplicates are expected, not exceptional.
  const alreadyProcessed = await db.stripeEvent.findUnique({ where: { id: event.id } });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncEntitlementFromSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncEntitlementFromSubscription(subscription);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.parent?.subscription_details?.subscription;
        if (typeof subscriptionId === "string") {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncEntitlementFromSubscription(subscription);
        }
        break;
      }
      default:
        break; // ignore event types we don't act on
    }

    await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    console.error(`[stripe-webhook] failed to process ${event.type}`, err);
    // Do not record as processed — let Stripe retry.
    return NextResponse.json({ error: "Internal processing error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
