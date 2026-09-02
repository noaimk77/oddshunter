import { db } from "@/lib/db";

/**
 * A Postgres advisory lock, not a new table — the worker is meant to run as
 * one long-lived process (spec section 11: not Netlify functions), but
 * Railway can restart or momentarily double-run a deploy, and two
 * detection passes writing Signal rows concurrently would race on the
 * dedup logic. `pg_try_advisory_lock` is non-blocking and auto-releases if
 * the connection drops, so a crashed run can't leave the lock stuck.
 */
const LOCK_KEY = 918_273_645; // arbitrary constant, unique to this worker's lock purpose

export async function withWorkerLock<T>(fn: () => Promise<T>): Promise<T | { skipped: true }> {
  const [{ acquired }] = await db.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) as acquired`;
  if (!acquired) return { skipped: true };

  try {
    return await fn();
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
}
