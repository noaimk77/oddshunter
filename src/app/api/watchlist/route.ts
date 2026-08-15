import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

export async function GET() {
  const user = await requireAuth();
  const items = await db.watchlistItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ marketIds: items.map((i) => i.marketId) });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  const body = await request.json().catch(() => null);
  const marketId = typeof body?.marketId === "string" ? body.marketId : undefined;
  if (!marketId) return NextResponse.json({ error: "marketId is required." }, { status: 400 });

  await db.watchlistItem.upsert({
    where: { userId_marketId: { userId: user.id, marketId } },
    create: { userId: user.id, marketId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireAuth();
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("marketId");
  if (!marketId) return NextResponse.json({ error: "marketId is required." }, { status: 400 });

  await db.watchlistItem.deleteMany({ where: { userId: user.id, marketId } });
  return NextResponse.json({ ok: true });
}
