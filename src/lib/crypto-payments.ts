import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { enforceVipChannelAccess } from "@/lib/telegram";
import { revokeTelegramLink } from "@/worker/telegram/linking";

/**
 * Crypto payments through NOWPayments — Bitcoin and USDC only.
 *
 * A blockchain payment is always pushed by the payer — nobody can debit a
 * wallet — so a crypto "subscription" is prepaid month by month: each paid
 * invoice adds one month to the entitlement, a reminder email goes out a few
 * days before the end, and the daily cron (/api/cron/subscriptions) expires
 * the entitlement once currentPeriodEnd passes, which removes the member
 * from the VIP channel exactly like a canceled Stripe subscription.
 */

export type CryptoPlanType = "VIP" | "BOT";

/** The only coins offered, keyed by what the client sends → NOWPayments ticker. */
export const CRYPTO_COINS = { btc: "btc", usdc: "usdc" } as const;
export type CryptoCoin = keyof typeof CRYPTO_COINS;

export function isCryptoCoin(value: unknown): value is CryptoCoin {
  return typeof value === "string" && Object.hasOwn(CRYPTO_COINS, value);
}

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
const REMINDER_DAYS_BEFORE_END = 3;

export function isCryptoConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
}

export function addOneMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Creates a hosted NOWPayments invoice for one month and returns its URL. */
export async function createCryptoInvoice(params: {
  userId: string;
  type: CryptoPlanType;
  coin: CryptoCoin;
  amount: number; // in the currency's smallest unit, like Stripe prices
  currency: string;
  appUrl: string;
}): Promise<string> {
  const payment = await db.cryptoPayment.create({ data: { userId: params.userId, type: params.type } });

  const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
    method: "POST",
    headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: params.amount / 100,
      price_currency: params.currency.toLowerCase(),
      pay_currency: CRYPTO_COINS[params.coin],
      order_id: payment.id,
      order_description: `Odds Hunter ${params.type} — 1 mois`,
      ipn_callback_url: `${params.appUrl}/api/crypto/webhook`,
      success_url: `${params.appUrl}/account?checkout=success`,
      cancel_url: `${params.appUrl}/account?checkout=cancel`,
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: number | string; invoice_url?: string; message?: string } | null;
  if (!res.ok || !body?.invoice_url) {
    throw new Error(`NOWPayments invoice failed: ${res.status} ${body?.message ?? "no response body"}`);
  }

  await db.cryptoPayment.update({ where: { id: payment.id }, data: { invoiceId: String(body.id) } });
  return body.invoice_url;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeysDeep((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/**
 * NOWPayments signs each payment notification with HMAC-SHA512 (IPN secret)
 * over the JSON body with keys sorted recursively, sent in x-nowpayments-sig.
 */
export function signIpnPayload(payload: unknown, secret: string): string {
  return createHmac("sha512", secret).update(JSON.stringify(sortKeysDeep(payload))).digest("hex");
}

export function isValidIpnSignature(payload: unknown, signature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const a = Buffer.from(signIpnPayload(payload, secret));
  const b = Buffer.from(signature.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Records a payment status from NOWPayments; on "finished" (fully paid and
 * confirmed) adds one month to the user's entitlement, once per invoice.
 */
export async function handleCryptoPaymentStatus(orderId: string, paymentStatus: string, now = new Date()): Promise<void> {
  const payment = await db.cryptoPayment.findUnique({ where: { id: orderId } });
  if (!payment) return; // not an invoice we issued

  if (paymentStatus !== "finished") {
    if (!payment.creditedAt) await db.cryptoPayment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
    return;
  }

  await db.$transaction(async (tx) => {
    // Claim the credit atomically — a redelivered notification finds it taken.
    const claimed = await tx.cryptoPayment.updateMany({
      where: { id: payment.id, creditedAt: null },
      data: { status: paymentStatus, creditedAt: now },
    });
    if (claimed.count === 0) return;

    const where = { userId_type: { userId: payment.userId, type: payment.type } };
    const existing = await tx.entitlement.findUnique({ where });

    // Already covered by a live Stripe subscription: keep Stripe in charge.
    if (existing?.provider === "STRIPE" && existing.status === "ACTIVE") return;

    // Paying early extends the current month instead of overlapping it.
    const stillRunning =
      existing?.provider === "CRYPTO" && existing.status === "ACTIVE" && existing.currentPeriodEnd && existing.currentPeriodEnd > now;
    const currentPeriodEnd = addOneMonth(stillRunning ? existing.currentPeriodEnd! : now);

    const data = {
      status: "ACTIVE",
      provider: "CRYPTO",
      currentPeriodEnd,
      renewalReminderSentAt: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
    };
    await tx.entitlement.upsert({
      where,
      create: { userId: payment.userId, type: payment.type, ...data },
      update: data,
    });
  });
}

/** Crypto entitlements whose prepaid month has ended become CANCELED. */
export async function expireCryptoEntitlements(now = new Date()): Promise<number> {
  const expired = await db.entitlement.findMany({
    where: { provider: "CRYPTO", status: "ACTIVE", currentPeriodEnd: { lte: now } },
  });
  let count = 0;
  for (const entitlement of expired) {
    try {
      // Remove from the channel first: if Telegram fails, the row stays
      // ACTIVE and tomorrow's run tries again.
      if (entitlement.type === "VIP") await enforceVipChannelAccess(entitlement.userId, "CANCELED");
      if (entitlement.type === "BOT") await revokeTelegramLink(db, entitlement.userId);
      await db.entitlement.update({ where: { id: entitlement.id }, data: { status: "CANCELED" } });
      count++;
    } catch (err) {
      console.error("[crypto] could not expire entitlement", { entitlementId: entitlement.id, err });
    }
  }
  return count;
}

/** Crypto entitlements ending within a few days that haven't been reminded yet. */
export async function findCryptoEntitlementsToRemind(now = new Date()) {
  const horizon = new Date(now.getTime() + REMINDER_DAYS_BEFORE_END * 24 * 60 * 60 * 1000);
  return db.entitlement.findMany({
    where: {
      provider: "CRYPTO",
      status: "ACTIVE",
      renewalReminderSentAt: null,
      currentPeriodEnd: { gt: now, lte: horizon },
    },
    include: { user: true },
  });
}
