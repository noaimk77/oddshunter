import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// Every Stripe event id this suite ever constructs — used to scope StripeEvent
// cleanup to rows this suite itself created. StripeEvent has no userId (it's a
// global idempotency ledger keyed by Stripe's own event id, not per-account),
// so an unscoped deleteMany({}) here would wipe every real webhook's
// idempotency record — and an unscoped Entitlement wipe would strip every
// real subscriber's access. Both happened in this file before this fix.
const TEST_EVENT_IDS = [
  "evt_bad_sig",
  "evt_unknown_customer",
  "evt_active_vip",
  "evt_pd_1",
  "evt_pd_2",
  "evt_duplicate",
  "evt_unrelated_product",
  "evt_invoice_failed",
  "evt_vip_start",
  "evt_vip_canceled",
  "evt_vip_past_due",
  "evt_vip_unpaid",
  "evt_vip_renewed",
  "evt_bot_canceled",
  "evt_vip_tg_down",
  "evt_vip_owner",
];

describe("POST /api/stripe/webhook", () => {
  let user: Awaited<ReturnType<typeof db.user.create>>;

  beforeEach(async () => {
    // Entitlement cascade-deletes when its user is deleted (schema:
    // onDelete: Cascade) — deleting by email below already cleans up this
    // test's own entitlements without touching any other account's.
    await db.stripeEvent.deleteMany({ where: { id: { in: TEST_EVENT_IDS } } });
    await db.user.deleteMany({ where: { email: "webhook-test@oddshunter.dev" } });
    user = await db.user.create({
      data: { email: "webhook-test@oddshunter.dev", stripeCustomerId: `cus_${crypto.randomUUID()}` },
    });
  });

  afterAll(async () => {
    await db.stripeEvent.deleteMany({ where: { id: { in: TEST_EVENT_IDS } } });
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

  describe("VIP channel removal", () => {
    const telegramCalls: { method: string; params: Record<string, unknown> }[] = [];

    function mockTelegramApi(status = 200, body: unknown = { ok: true, result: true }) {
      telegramCalls.length = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        telegramCalls.push({ method: String(input).split("/").pop()!, params: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify(body), { status });
      });
    }

    beforeEach(async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test-token");
      vi.stubEnv("TELEGRAM_VIP_CHAT_ID", "-1001234567890");
      await db.user.update({ where: { id: user.id }, data: { telegramUserId: "4242" } });
      await POST(signedRequest(subscriptionEvent("evt_vip_start", { customer: user.stripeCustomerId })));
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it.each(["canceled", "past_due", "unpaid"] as const)(
      "removes the bound Telegram account when the VIP subscription becomes %s",
      async (status) => {
        mockTelegramApi();
        const res = await POST(
          signedRequest(subscriptionEvent(`evt_vip_${status}`, { customer: user.stripeCustomerId, status }))
        );
        expect(res.status).toBe(200);
        expect(telegramCalls).toEqual([
          { method: "unbanChatMember", params: { chat_id: "-1001234567890", user_id: 4242 } },
        ]);
      }
    );

    it("leaves the member in place while the VIP subscription stays active", async () => {
      mockTelegramApi();
      await POST(signedRequest(subscriptionEvent("evt_vip_renewed", { customer: user.stripeCustomerId })));
      expect(telegramCalls).toHaveLength(0);
    });

    it("doesn't touch the VIP channel when only the Bot subscription ends", async () => {
      mockTelegramApi();
      await POST(
        signedRequest(
          subscriptionEvent("evt_bot_canceled", {
            customer: user.stripeCustomerId,
            status: "canceled",
            priceId: "price_test_bot",
          })
        )
      );
      expect(telegramCalls).toHaveLength(0);
    });

    it("answers 500 and leaves the event unrecorded when Telegram is down, so Stripe retries", async () => {
      mockTelegramApi(502, { ok: false, error_code: 502, description: "Bad Gateway" });
      const res = await POST(
        signedRequest(subscriptionEvent("evt_vip_tg_down", { customer: user.stripeCustomerId, status: "canceled" }))
      );
      expect(res.status).toBe(500);
      expect(await db.stripeEvent.findUnique({ where: { id: "evt_vip_tg_down" } })).toBeNull();
    });

    it("acknowledges a deterministic Telegram 400 instead of retrying for days", async () => {
      mockTelegramApi(400, { ok: false, error_code: 400, description: "Bad Request: can't remove chat owner" });
      const res = await POST(
        signedRequest(subscriptionEvent("evt_vip_owner", { customer: user.stripeCustomerId, status: "canceled" }))
      );
      expect(res.status).toBe(200);
    });
  });
});
