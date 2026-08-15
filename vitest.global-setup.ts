import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Applies any pending Prisma migrations to the real (Neon Postgres)
 * DATABASE_URL before integration tests run, so route-handler tests
 * exercise the actual schema — real unique constraints, real column types —
 * instead of a hand-rolled mock of Prisma. A no-op if the schema is already
 * in sync, which is the common case.
 */
export default async function setup() {
  execSync("npx prisma migrate deploy", {
    cwd: import.meta.dirname,
    env: process.env,
    stdio: "pipe",
  });
}
