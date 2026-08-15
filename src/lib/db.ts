import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 requires an explicit driver adapter — there's no more implicit
 * "read DATABASE_URL and pick an engine" at the client level. Postgres
 * (Neon, provisioned via Stripe Projects) in every environment now; swap
 * this adapter (and the `datasource` provider in schema.prisma) if that
 * ever changes — nothing else in the app touches Prisma's connection setup.
 */
function buildClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.example.");
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
