import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma 7 requires an explicit driver adapter — there's no more implicit
 * "read DATABASE_URL and pick an engine" at the client level. SQLite today;
 * swapping to Postgres in production means swapping this adapter (and the
 * `datasource` provider in schema.prisma) — nothing else in the app touches
 * Prisma's connection setup.
 */
function buildClient() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set — see .env.example.");
  }
  // better-sqlite3 wants a plain file path, not Prisma's `file:` URI form.
  const url = rawUrl.startsWith("file:") ? rawUrl.slice("file:".length) : rawUrl;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
