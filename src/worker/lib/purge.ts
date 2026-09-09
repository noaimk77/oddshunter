import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * Data-lifecycle purge — the worker writes an OddsSnapshot every time a
 * bookmaker's price changes, so the table grows a few thousand rows every
 * ingest cycle. After a few weeks the total is in the tens of millions,
 * and `runDetectionPass()` (which reads every recent snapshot per
 * selection to detect drops/rises/multi-book confirmations) starts
 * timing out at Prisma's 15s pool timeout — confirmed live 2026-09-06:
 * "ECHECKOUTTIMEOUT unable to check out connection from the pool" spam
 * on every detection cycle, no signals firing.
 *
 * Kept intentionally simple:
 *   - deletes rows older than the retention window, in FIXED-SIZE batches
 *     (so a single DELETE never holds the connection long enough to
 *     starve the rest of the worker),
 *   - stops at a hard cap so a runaway job can't spin forever,
 *   - uses `$executeRawUnsafe` (interpolating a validated integer) — no
 *     Prisma model round-trip through the query engine, so we skip the
 *     Prisma-side 15s timeout that made the previous attempt fail.
 *
 * Retention windows (rationale in comments): 7 days for OddsSnapshot is
 * enough for every detector (ODDS_DROP looks at hours, MULTI_BOOK at a
 * day at most). Signal / ScrapedTip live longer since they're referenced
 * by the perf-tracking work that comes next.
 */

/** Rows removed per DELETE round-trip. Small enough that any single
 *  DELETE finishes well under the pool timeout even on a saturated pool. */
const BATCH_SIZE = 5_000;

/** Hard ceiling on total rows removed in one invocation — prevents a
 *  runaway from hogging DB throughput. A month of backlog on OddsSnapshot
 *  fits easily under 5M; if a real backlog needs more, we call this again
 *  the next day. */
const MAX_ROWS_PER_INVOCATION = 5_000_000;

/** A short pause between batches so an ingest / detection query that's
 *  waiting on a connection gets a chance to run. Purely cooperative — the
 *  DB doesn't need us to sleep. */
const SLEEP_MS_BETWEEN_BATCHES = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delete every row of `table` whose `column` is older than `daysToKeep`
 * days. Batches of BATCH_SIZE. Returns the total rows removed. Never
 * throws — logs and returns the partial count on error so a nightly cron
 * doesn't crash the worker.
 */
async function purgeOlderThan(table: string, column: string, daysToKeep: number): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 3600 * 1000);
  let total = 0;
  const startedAt = Date.now();

  for (;;) {
    if (total >= MAX_ROWS_PER_INVOCATION) {
      console.log(`[purge] ${table}: hit MAX_ROWS_PER_INVOCATION=${MAX_ROWS_PER_INVOCATION.toLocaleString()}, stopping until next run`);
      break;
    }
    let deleted: number;
    try {
      // Postgres DELETE ... USING (SELECT id ... LIMIT n) — the LIMIT
      // subquery keeps each DELETE bounded and fast, even without an
      // index on the timestamp column (a small partial-scan is cheap
      // once you cap the row count).
      const sql = `
        DELETE FROM "${table}"
        WHERE id IN (
          SELECT id FROM "${table}"
          WHERE "${column}" < $1
          LIMIT $2
        )
      `;
      deleted = await db.$executeRawUnsafe(sql, cutoff, BATCH_SIZE);
    } catch (err) {
      console.error(`[purge] ${table}: DELETE batch failed after ${total.toLocaleString()} rows —`, err instanceof Error ? err.message : err);
      return total;
    }
    if (deleted === 0) break;
    total += deleted;
    if (total % 50_000 === 0 || deleted < BATCH_SIZE) {
      console.log(`[purge] ${table}: ${total.toLocaleString()} rows removed so far`);
    }
    if (deleted < BATCH_SIZE) break; // last batch, nothing left older than cutoff
    await sleep(SLEEP_MS_BETWEEN_BATCHES);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[purge] ${table}: DONE — ${total.toLocaleString()} rows in ${seconds}s (keep ${daysToKeep}d)`);
  return total;
}

export interface PurgeResult {
  oddsSnapshot: number;
  scrapedTip: number;
  groupTicket: number;
  signal: number;
}

/**
 * Run one full retention pass. Called by the worker's nightly scheduler
 * and by the standalone `scripts/purge-old-data.ts` for the initial
 * one-off dump.
 *
 * Windows (7 September 2026):
 *   - OddsSnapshot: 7 days   — detectors look at hours, not days
 *   - ScrapedTip:   60 days  — feeds consensus + perf backtesting
 *   - GroupTicket:  60 days  — per-source hit-rate stats
 *   - Signal:       90 days  — track record for the /perfs command
 *
 * Signal is kept the longest because it's what we surface to subscribers
 * as proof. Bump the numbers when the /perfs command needs a longer view.
 */
export async function purgeOldData(): Promise<PurgeResult> {
  console.log("[purge] starting retention pass...");
  const result: PurgeResult = {
    oddsSnapshot: await purgeOlderThan("OddsSnapshot", "timestamp", 7),
    scrapedTip: await purgeOlderThan("ScrapedTip", "detectedAt", 60),
    groupTicket: await purgeOlderThan("GroupTicket", "detectedAt", 60),
    signal: await purgeOlderThan("Signal", "firstDetectedAt", 90),
  };
  console.log("[purge] retention pass complete:", result);
  return result;
}

// The `Prisma` import is kept for the type-only re-export a caller might
// want when reading a purge result off a schema field; also silences the
// unused-import lint if a future refactor of purgeOlderThan needs it.
export type { Prisma };
