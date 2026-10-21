import { PrismaClient } from "@/generated/prisma-consensus/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

/**
 * Dedicated Prisma client for the VIP consensus pipeline (ScrapedTip,
 * GroupTicket, ChatFixtureContext, ConsensusAlert). This lives on Turso
 * (serverless SQLite over libSQL) instead of the main Neon Postgres, so
 * the alert pipeline stays alive when Neon's free-tier compute quota runs
 * out — historically it did on 2026-09-10 (Supabase egress) and again on
 * 2026-09-21 (Neon CU-hours), each time silently dropping every VIP alert
 * for the whole month. Turso's free tier bills by row-reads/writes
 * (500M/10M per month) not compute-time, and this schema is small (4
 * tables, ~200-300 tips/day), so we're structurally an order of magnitude
 * below its limits.
 *
 * Consumed env vars:
 *   CONSENSUS_DATABASE_URL   e.g. libsql://oddshunter-consensus-…turso.io
 *   CONSENSUS_DATABASE_AUTH_TOKEN   Turso DB access token
 */
function buildConsensusClient(): PrismaClient {
  const url = process.env.CONSENSUS_DATABASE_URL;
  const authToken = process.env.CONSENSUS_DATABASE_AUTH_TOKEN;
  if (!url) {
    throw new Error("CONSENSUS_DATABASE_URL is not set — see .env.example.");
  }
  if (!authToken) {
    throw new Error("CONSENSUS_DATABASE_AUTH_TOKEN is not set — see .env.example.");
  }
  // PrismaLibSql accepts the same libsql/client Config shape directly
  // (url + authToken). Passing a pre-built client here would trigger a
  // type mismatch — the adapter wants the config to build its own.
  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

const globalForConsensus = globalThis as unknown as { consensusDb?: PrismaClient };

export const consensusDb: PrismaClient = globalForConsensus.consensusDb ?? buildConsensusClient();

if (process.env.NODE_ENV !== "production") {
  globalForConsensus.consensusDb = consensusDb;
}
