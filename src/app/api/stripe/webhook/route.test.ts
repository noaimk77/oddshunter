import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { POST } from "./route";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function signedRequest(payload: unknown, secretOverride?: string): Request {
  const body = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: secretOverride ?? WEBHOOK_SECRET,
  });
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body,
  });
}

function subscriptionEvent(
  id: string,
  overrides: { status?: Stripe.Subscription.Status; customer?: string | null; priceId?: string } = {}
) {
  const priceId = overrides.priceId ?? "price_test_vip";
  return {
    id,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_${id}`,
        status: overrides.status ?? "active",
        customer: overrides.customer ?? "cus_unknown",
        items: {
          data: [{ price: { id: priceId }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
        },
      },
    },
  };
}

describe("POST /api/stripe/webhook", () => {
  let user: Awaited<ReturnType<typeof db.user.create>>;

  beforeEach(async () => {
    await db.entitlement.deleteMany({});
    await db.stripeEvent.deleteMany({});
    await db.user.deleteMany({ where: { email: "webhook-test@oddshunter.dev" } });
    user = await db.user.create({
      data: { email: "webhook-test@oddshunter.dev", stripeCustomerId: `cus_${crypto.randomUUID()}` },
    });
  });

  afterAll(async () => {
    await db.entitlement.deleteMany({});
    await db.stripeEvent.deleteMany({});
    await db.user.deleteMany({ where: { email: "webhook-test@oddshunter.dev" } });
  });

  it("rejects a request with no stripe-signature header", async () => {
    const res = await POST(
      new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", body: "{}" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a request with an invalid signature instead of trusting the payload", async () => {
    const res = await POST(signedRequest(subscriptionEvent("evt_bad_sig"), "whsec_wrong_secret_entirely"));
    expect(res.status).toBe(400);
    const stored = await db.stripeEvent.findUnique({ where: { id: "evt_bad_sig" } });
    expect(stored).toBeNull();
  });

  it("accepts a validly-signed event and does nothing for an unknown Stripe customer", async () => {
    const res = await POST(signedRequest(subscriptionEvent("evt_unknown_customer", { customer: "cus_ghost" })));
    expect(res.status).toBe(200);
    const entitlements = await db.entitlement.findMany({ where: { userId: user.id } });
    expect(entitlements).toHaveLength(0);
  });

  it("upserts an ACTIVE VIP entitlement for a known customer on an active subscription", async () => {
    const res = await POST(
      signedRequest(subscriptionEvent("evt_active_vip", { customer: user.stripeCustomerId, status: "active" }))
    );
    expect(res.status).toBe(200);
    const entitlement = await db.entitlement.findUnique({
      where: { userId_type: { userId: user.id, type: "VIP" } },
    });
    expect(entitlement?.status).toBe("ACTIVE");
  });

  it("maps past_due to PAST_DUE, not a silent ACTIVE", async () => {
    await POST(signedRequest(subscriptionEvent("evt_pd_1", { customer: user.stripeCustomerId, status: "active" })));
    const res = await POST(
      signedRequest(subscriptionEvent("evt_pd_2", { customer: user.stripeCustomerId, status: "past_due" }))
    );
    expect(res.status).toBe(200);
    const entitlement = await db.entitlement.findUnique({
      where: { userId_type: { userId: user.id, type: "VIP" } },
    });
    expect(entitlement?.status).toBe("PAST_DUE");
  });

  it("never processes the same event twice, even if Stripe redelivers it", async () => {
    const evt = subscriptionEvent("evt_duplicate", { customer: user.stripeCustomerId });
    const first = await POST(signedRequest(evt));
    expect(first.status).toBe(200);
    expect(await first.json()).not.toHaveProperty("duplicate", true);

    const second = await POST(signedRequest(evt));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ received: true, duplicate: true });

    const rows = await db.stripeEvent.findMany({ where: { id: "evt_duplicate" } });
    expect(rows).toHaveLength(1);
  });

  it("ignores an entitlement type that isn't one of the two real Odds Hunter products", async () => {
    const res = await POST(
      signedRequest(
        subscriptionEvent("evt_unrelated_product", {
          customer: user.stripeCustomerId,
          priceId: "price_totally_unrelated",
        })
      )
    );
    expect(res.status).toBe(200);
    const entitlements = await db.entitlement.findMany({ where: { userId: user.id } });
    expect(entitlements).toHaveLength(0);
  });

  it("resolves invoice.payment_failed to the subscription's real status via a Stripe lookup", async () => {
    const subscription = {
      id: "sub_invoice_test",
      status: "past_due" as const,
      customer: user.stripeCustomerId,
      items: {
        data: [{ price: { id: "price_test_bot" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }],
      },
    };
    vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValueOnce(
      subscription as unknown as Stripe.Response<Stripe.Subscription>
    );

    const res = await POST(
      signedRequest({
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: { object: { parent: { subscription_details: { subscription: "sub_invoice_test" } } } },
      })
    );
    expect(res.status).toBe(200);
    const entitlement = await db.entitlement.findUnique({
      where: { userId_type: { userId: user.id, type: "BOT" } },
    });
    expect(entitlement?.status).toBe("PAST_DUE");
    vi.restoreAllMocks();
  });
});
