import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/guards";
import { syncApiFootball } from "@/services/api-football-sync";

/**
 * Manually-triggered sync from the real API-Football API into Postgres.
 * There's no deployed scheduler in this project yet (no cron, no paid
 * infrastructure) — this route exists so the sync can be run on demand
 * during development. Gated behind requireAuth() only; there's no admin
 * role model yet, so any signed-in user can trigger it today. Before
 * production this needs either a real scheduled job or a proper
 * admin-only check — noted here rather than silently left open-ended.
 */
export async function POST() {
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const result = await syncApiFootball();
    return NextResponse.json(result, { status: result.ok ? 200 : 429 });
  } catch (err) {
    console.error("[sync-football] failed", err);
    const message = err instanceof Error ? err.message : "Sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
