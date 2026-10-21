/**
 * One-off standalone purge — run this once to dump the accumulated backlog.
 *
 *   flyctl ssh console --app oddshunter-worker -C 'cd /app && npx tsx scripts/purge-old-data.ts'
 *
 * Uses `pg` DIRECTLY (not Prisma) with its own dedicated connection so it
 * doesn't fight the live worker for the Prisma pool (10 connections,
 * saturated during ingest). Sets a long statement_timeout on THIS
 * connection only so a slow DELETE can finish without hitting Prisma's
 * 15s cap. Adds a temp index on OddsSnapshot(timestamp) if missing so the
 * WHERE clause doesn't sequential-scan tens of millions of rows.
 *
 * Safe to run alongside the live worker: batches of 5000, small pause
 * between them, one connection only.
 *
 * After this ships and the initial backlog is cleared, the nightly cron
 * inside the worker (see src/worker/lib/purge.ts + startPurgeLoop in
 * index.ts) keeps things trim on its own; this script becomes a rescue
 * tool, not a routine one.
 */

import { Client } from "pg";

const BATCH_SIZE = 5_000;
const MAX_ROWS_PER_TABLE = 5_000_000;
const SLEEP_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Target {
  table: string;
  column: string;
  daysToKeep: number;
}

const TARGETS: Target[] = [
  { table: "OddsSnapshot", column: "timestamp", daysToKeep: 7 },
  { table: "ScrapedTip", column: "detectedAt", daysToKeep: 60 },
  { table: "GroupTicket", column: "detectedAt", daysToKeep: 60 },
  { table: "Signal", column: "firstDetectedAt", daysToKeep: 90 },
];

async function ensureTimestampIndex(client: Client, table: string, column: string) {
  const indexName = `${table.toLowerCase()}_${column.toLowerCase()}_purge_idx`;
  console.log(`[purge] ensuring index ${indexName} on ${table}(${column}) — may take a while first time...`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}"("${column}")`,
  );
  console.log(`[purge] index ${indexName} ready`);
}

async function purgeTable(client: Client, target: Target): Promise<number> {
  const { table, column, daysToKeep } = target;
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 3600 * 1000);
  console.log(`[purge] ${table}: deleting rows older than ${cutoff.toISOString()} (${daysToKeep} days)...`);

  await ensureTimestampIndex(client, table, column);

  let total = 0;
  const startedAt = Date.now();

  for (;;) {
    if (total >= MAX_ROWS_PER_TABLE) {
      console.log(`[purge] ${table}: hit MAX_ROWS_PER_TABLE=${MAX_ROWS_PER_TABLE.toLocaleString()}, stopping`);
      break;
    }
    let res;
    try {
      const t0 = Date.now();
      res = await client.query(
        `DELETE FROM "${table}" WHERE id IN (
           SELECT id FROM "${table}" WHERE "${column}" < $1 LIMIT $2
         )`,
        [cutoff, BATCH_SIZE],
      );
      const took = Date.now() - t0;
      if (took > 5000) console.log(`[purge] ${table}: batch of ${res.rowCount} took ${took}ms`);
    } catch (err) {
      console.error(`[purge] ${table}: DELETE failed after ${total.toLocaleString()} rows —`, err instanceof Error ? err.message : err);
      return total;
    }
    const deleted = res.rowCount ?? 0;
    if (deleted === 0) break;
    total += deleted;
    if (total % 50_000 === 0 || deleted < BATCH_SIZE) {
      console.log(`[purge] ${table}: ${total.toLocaleString()} rows removed so far`);
    }
    if (deleted < BATCH_SIZE) break;
    await sleep(SLEEP_MS);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[purge] ${table}: DONE — ${total.toLocaleString()} rows in ${seconds}s (keep ${daysToKeep}d)`);
  return total;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Own dedicated connection — no pool. This is the whole point: we bypass
  // Prisma's saturated pool so we can hold one long-running connection
  // without starving the live worker.
  const client = new Client({ connectionString: url });
  await client.connect();

  // Long timeout on THIS session only — Supabase's default statement_timeout
  // (usually 60s or so) is fine for the individual batched DELETEs, but the
  // initial CREATE INDEX on a huge table can take much longer than that.
  await client.query("SET statement_timeout = '30min'");

  const results: Record<string, number> = {};
  for (const target of TARGETS) {
    try {
      results[target.table] = await purgeTable(client, target);
    } catch (err) {
      console.error(`[purge] ${target.table}: uncaught error, moving on:`, err);
      results[target.table] = 0;
    }
  }

  console.log("Final result:", results);
  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
