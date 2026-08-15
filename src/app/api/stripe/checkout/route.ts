import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { stripe, PRICE_TO_ENTITLEMENT, isStripeConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this deployment." }, { status: 503 });
  }

  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const priceId = typeof body?.priceId === "string" ? body.priceId : undefined;

  // The client can only ever request one of the two real Odds Hunter
  // prices — never trust an arbitrary priceId from the request body.
  if (!priceId || !(priceId in PRICE_TO_ENTITLEMENT)) {
    return NextResponse.json({ error: "Unknown price." }, { status: 400 });
  }

  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });

  let customerId = dbUser.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: dbUser.email,
      metadata: { userId: dbUser.id },
    });
    customerId = customer.id;
    await db.user.update({ where: { id: dbUser.id }, data: { stripeCustomerId: customerId } });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: dbUser.id,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId: dbUser.id } },
    success_url: `${appUrl}/account?checkout=success`,
    cancel_url: `${appUrl}/account?checkout=cancel`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a Checkout URL." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
