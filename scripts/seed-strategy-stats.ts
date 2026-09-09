import "dotenv/config";
import { db } from "@/lib/db";
import { collectHistoricalFixtures, ensureCompetition, backfillGoalMinutes } from "@/worker/lib/historicalCollector";
import { computeStrategyStats, STRATEGY_DEFS, type StrategyName } from "@/worker/lib/strategyStats";
import { TARGET_LEAGUES } from "@/worker/lib/targetLeagues";

/**
 * One-shot seed: for every TARGET_LEAGUE, pull the last N seasons of finished
 * fixtures with halftime scores, then recompute the per-league hit-rate for
 * every strategy. Idempotent — safe to re-run any time (fixture upserts,
 * stats recompute in place).
 *
 * Ordinary usage:
 *   npx tsx scripts/seed-strategy-stats.ts
 *
 * Expects API_FOOTBALL_KEY in the environment (already set on Railway; for
 * local runs, `.env` is loaded by `dotenv/config` above).
 */

async function main() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error("API_FOOTBALL_KEY is not set — cannot seed. Set it via `stripe projects env --pull` locally, or read it from Railway.");
    process.exit(1);
  }

  const providerName = "api-football";
  const strategyNames = Object.keys(STRATEGY_DEFS) as StrategyName[];

  for (const league of TARGET_LEAGUES) {
    const competitionId = await ensureCompetition(db, providerName, league.leagueId, league.country, league.name);
    console.log(`\n=== ${league.country} — ${league.name} (competition ${competitionId}) ===`);

    let totalFetched = 0;
    let totalUpserted = 0;
    for (const season of league.seasons) {
      const result = await collectHistoricalFixtures(db, apiKey, competitionId, league.leagueId, season);
      totalFetched += result.fetched;
      totalUpserted += result.upserted;
      const errs = result.errors.length > 0 ? ` errors=${result.errors.length}` : "";
      console.log(`  season ${season}: fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}${errs}`);
      if (result.errors.length > 0) result.errors.slice(0, 3).forEach((e) => console.log(`    ! ${e}`));
    }
    console.log(`  → total: ${totalFetched} fetched, ${totalUpserted} upserted`);

    console.log(`  backfilling first-half goal minutes (rate-limited, ~150ms/fixture)...`);
    const backfill = await backfillGoalMinutes(db, apiKey, competitionId);
    console.log(`  backfill: ${backfill.backfilled}/${backfill.candidates} fixtures${backfill.errors.length > 0 ? ` (${backfill.errors.length} errors)` : ""}`);
    if (backfill.errors.length > 0) backfill.errors.slice(0, 3).forEach((e) => console.log(`    ! ${e}`));

    for (const strategy of strategyNames) {
      const stats = await computeStrategyStats(db, strategy, competitionId, league.seasons.map(String));
      const rate = stats.occurrences > 0 ? stats.hitRatePct.toFixed(2) : "—";
      console.log(`  [${strategy}] hits=${stats.hits}/${stats.occurrences} (${rate}%)`);
    }
  }

  console.log("\nDone.");
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
