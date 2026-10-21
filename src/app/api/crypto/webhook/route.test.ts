import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addOneMonth, expireCryptoEntitlements, signIpnPayload } from "@/lib/crypto-payments";
import { syncEntitlementFromSubscription } from "@/lib/entitlements";
import type Stripe from "stripe";
import { POST } from "./route";

const EMAIL = "crypto-webhook-test@oddshunter.dev";
const IPN_SECRET = "ipn-test-secret";
const DAY = 24 * 60 * 60 * 1000;

function ipnRequest(payload: Record<string, unknown>, secret = IPN_SECRET): Request {
  return new Request("http://localhost:3000/api/crypto/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nowpayments-sig": signIpnPayload(payload, secret) },
    body: JSON.stringify(payload),
  });
}

function ipn(orderId: string, status: string) {
  return {
    payment_id: 5077125051,
    payment_status: status,
    order_id: orderId,
    price_amount: 75,
    price_currency: "eur",
    pay_currency: "btc",
    actually_paid: 0.0012,
    fee: { currency: "btc", depositFee: 0, withdrawalFee: 0, serviceFee: 0 },
  };
}

describe("POST /api/crypto/webhook", () => {
  let user: Awaited<ReturnType<typeof db.user.create>>;

  async function newPayment(type = "VIP") {
    return db.cryptoPayment.create({ data: { userId: user.id, type } });
  }
  async function vip() {
    return db.entitlement.findUnique({ where: { userId_type: { userId: user.id, type: "VIP" } } });
  }

  beforeEach(async () => {
    vi.stubEnv("NOWPAYMENTS_API_KEY", "np-test-key");
    vi.stubEnv("NOWPAYMENTS_IPN_SECRET", IPN_SECRET);
    await db.user.deleteMany({ where: { email: EMAIL } });
    user = await db.user.create({ data: { email: EMAIL, stripeCustomerId: `cus_${crypto.randomUUID()}` } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: EMAIL } });
  });

  it("rejects a notification signed with the wrong secret", async () => {
    const payment = await newPayment();
    const res = await POST(ipnRequest(ipn(payment.id, "finished"), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(await vip()).toBeNull();
  });

  it("verifies the signature over recursively sorted keys, whatever the body's key order", async () => {
    const payment = await newPayment();
    const payload = ipn(payment.id, "finished");
    const shuffled = Object.fromEntries(Object.entries(payload).reverse());
    const res = await POST(
      new Request("http://localhost:3000/api/crypto/webhook", {
        method: "POST",
        headers: { "x-nowpayments-sig": signIpnPayload(payload, IPN_SECRET) },
        body: JSON.stringify(shuffled),
      })
    );
    expect(res.status).toBe(200);
    expect((await vip())?.status).toBe("ACTIVE");
  });

  it("grants one month of VIP when the payment is finished", async () => {
    const payment = await newPayment();
    const before = Date.now();
    const res = await POST(ipnRequest(ipn(payment.id, "finished")));
    expect(res.status).toBe(200);

    const entitlement = await vip();
    expect(entitlement).toMatchObject({ status: "ACTIVE", provider: "CRYPTO" });
    const days = (entitlement!.currentPeriodEnd!.getTime() - before) / DAY;
    expect(days).toBeGreaterThanOrEqual(27.9);
    expect(days).toBeLessThanOrEqual(31.1);
  });

  it.each(["waiting", "confirming", "partially_paid", "expired", "failed"])(
    "grants nothing while the payment is %s",
    async (status) => {
      const payment = await newPayment();
      await POST(ipnRequest(ipn(payment.id, status)));
      expect(await vip()).toBeNull();
      expect((await db.cryptoPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(status);
    }
  );

  it("credits a redelivered notification only once", async () => {
    const payment = await newPayment();
    await POST(ipnRequest(ipn(payment.id, "finished")));
    const first = (await vip())!.currentPeriodEnd!;
    await POST(ipnRequest(ipn(payment.id, "finished")));
    expect((await vip())!.currentPeriodEnd).toEqual(first);
  });

  it("adds the month after the current one when renewing early", async () => {
    await POST(ipnRequest(ipn((await newPayment()).id, "finished")));
    const firstEnd = (await vip())!.currentPeriodEnd!;
    await POST(ipnRequest(ipn((await newPayment()).id, "finished")));
    expect((await vip())!.currentPeriodEnd).toEqual(addOneMonth(firstEnd));
  });

  it("ignores an order id we never issued", async () => {
    const res = await POST(ipnRequest(ipn("not-ours", "finished")));
    expect(res.status).toBe(200);
    expect(await vip()).toBeNull();
  });

  it("doesn't let a Stripe subscription ending cut a running crypto month short", async () => {
    await POST(ipnRequest(ipn((await newPayment()).id, "finished")));
    await syncEntitlementFromSubscription({
      id: "sub_old",
      status: "canceled",
      customer: user.stripeCustomerId,
      items: { data: [{ price: { id: "price_test_vip" }, current_period_end: Math.floor(Date.now() / 1000) }] },
    } as unknown as Stripe.Subscription);
    expect(await vip()).toMatchObject({ status: "ACTIVE", provider: "CRYPTO" });
  });

  describe("expiry", () => {
    function mockTelegramApi(ok = true) {
      const calls: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        calls.push(String(input).split("/").pop()!);
        return new Response(JSON.stringify(ok ? { ok: true, result: true } : { ok: false, error_code: 502, description: "down" }), {
          status: ok ? 200 : 502,
        });
      });
      return calls;
    }

    beforeEach(async () => {
      vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:test-token");
      vi.stubEnv("TELEGRAM_VIP_CHAT_ID", "-1001234567890");
      await db.user.update({ where: { id: user.id }, data: { telegramUserId: "5353" } });
      await POST(ipnRequest(ipn((await newPayment()).id, "finished")));
    });

    it("keeps the month running until its end", async () => {
      const calls = mockTelegramApi();
      await expireCryptoEntitlements(new Date(Date.now() + 27 * DAY));
      expect((await vip())?.status).toBe("ACTIVE");
      expect(calls).toHaveLength(0);
    });

    it("cancels an unpaid month and removes the member from the VIP channel", async () => {
      const calls = mockTelegramApi();
      const end = (await vip())!.currentPeriodEnd!;
      await expireCryptoEntitlements(new Date(end.getTime() + 1000));
      expect((await vip())?.status).toBe("CANCELED");
      expect(calls).toEqual(["unbanChatMember"]);
    });

    it("stays ACTIVE for a retry tomorrow when Telegram is down", async () => {
      mockTelegramApi(false);
      const end = (await vip())!.currentPeriodEnd!;
      await expireCryptoEntitlements(new Date(end.getTime() + 1000));
      expect((await vip())?.status).toBe("ACTIVE");
    });
  });
});
