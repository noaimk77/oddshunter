import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { getPlanDisplays } from "@/lib/plans";
import { createCryptoInvoice, isCryptoConfigured } from "@/lib/crypto-payments";

export async function POST(request: Request) {
  if (!isCryptoConfigured()) {
    return NextResponse.json({ error: "Le paiement crypto n'est pas encore disponible." }, { status: 503 });
  }

  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const type = body?.type;
  if (type !== "VIP" && type !== "BOT") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  // Same price as the Stripe plan, never an amount from the client.
  const plan = (await getPlanDisplays()).find((p) => p.type === type);
  if (!plan) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });

  const entitlement = await db.entitlement.findUnique({ where: { userId_type: { userId: user.id, type } } });
  if (entitlement?.provider === "STRIPE" && entitlement.status === "ACTIVE") {
    return NextResponse.json({ error: "Tu as déjà un abonnement actif par carte." }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const url = await createCryptoInvoice({
      userId: user.id,
      type,
      amount: plan.amount,
      currency: plan.currency,
      appUrl,
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[crypto-checkout] failed to create an invoice", err);
    return NextResponse.json({ error: "Impossible de créer la facture crypto. Réessaie dans un instant." }, { status: 502 });
  }
}
