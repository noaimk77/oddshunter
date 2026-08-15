import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

const updateAlertRuleSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  threshold: z.coerce.number().positive().optional(),
});

async function loadOwnedRule(userId: string, id: string) {
  const rule = await db.alertRule.findUnique({ where: { id } });
  if (!rule || rule.userId !== userId) return null;
  return rule;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const owned = await loadOwnedRule(user.id, id);
  if (!owned) return NextResponse.json({ error: "Alert rule not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = updateAlertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  const rule = await db.alertRule.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ rule });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const owned = await loadOwnedRule(user.id, id);
  if (!owned) return NextResponse.json({ error: "Alert rule not found." }, { status: 404 });

  await db.alertRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
