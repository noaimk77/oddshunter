import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

const createAlertRuleSchema = z.object({
  name: z.string().min(1).max(80),
  sport: z.string().optional(),
  competition: z.string().optional(),
  marketType: z.string().optional(),
  selection: z.string().optional(),
  condition: z.enum(["ODDS_DROP_PERCENT", "ODDS_RISE_PERCENT", "MATCHED_VOLUME_ABOVE", "MONEYWAY_PERCENT_ABOVE"]),
  threshold: z.coerce.number().positive(),
  timeWindowMin: z.coerce.number().int().positive().optional(),
  preMatchOnly: z.coerce.boolean().optional(),
  liveOnly: z.coerce.boolean().optional(),
});

export async function GET() {
  const user = await requireAuth();
  const rules = await db.alertRule.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { triggers: true } } },
  });
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const user = await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = createAlertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid alert rule." }, { status: 400 });
  }

  const rule = await db.alertRule.create({
    data: { ...parsed.data, userId: user.id },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
