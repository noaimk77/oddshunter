import { NextResponse } from "next/server";
import { handleCryptoPaymentStatus, isCryptoConfigured, isValidIpnSignature } from "@/lib/crypto-payments";

/** NOWPayments payment notifications (IPN). */
export async function POST(request: Request) {
  if (!isCryptoConfigured()) {
    return NextResponse.json({ error: "Crypto payments are not configured on this deployment." }, { status: 503 });
  }

  const payload = (await request.json().catch(() => null)) as { order_id?: unknown; payment_status?: unknown } | null;
  if (!payload || !isValidIpnSignature(payload, request.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (typeof payload.order_id !== "string" || typeof payload.payment_status !== "string") {
    return NextResponse.json({ ok: true }); // nothing we act on
  }

  try {
    await handleCryptoPaymentStatus(payload.order_id, payload.payment_status);
  } catch (err) {
    console.error("[crypto-webhook] failed to process payment", err);
    // Non-2xx makes NOWPayments resend the notification.
    return NextResponse.json({ error: "Internal processing error." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
