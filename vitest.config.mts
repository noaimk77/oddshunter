import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import "dotenv/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(rootDir, "src") },
  },
  test: {
    environment: "node",
    globalSetup: "./vitest.global-setup.ts",
    // Neon's compute suspends when idle ("scale to zero") — the first
    // query after a gap pays a real cold-start penalty on top of normal
    // network latency, which the 5s default comfortably blew past.
    testTimeout: 20_000,
    // DATABASE_URL is read from process.env (loaded from .env by the
    // `dotenv/config` import above) rather than hardcoded here — this file
    // is committed, and the real value is a Neon Postgres connection
    // string. Integration tests (e.g. the webhook route test) run real
    // queries against that same database; they use disposable, prefixed
    // test data with before/after cleanup, since there's no second free
    // Postgres branch dedicated to tests yet.
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_SECRET: "test-secret-not-for-production-use-0000000000",
      // Dummy values, not a real Stripe account — the webhook integration
      // test only needs a shared secret it also controls (for
      // generateTestHeaderString/constructEvent, both pure local HMAC, no
      // network call) and stable price IDs to map to VIP/BOT.
      STRIPE_SECRET_KEY: "sk_test_dummy_for_local_unit_tests_only",
      STRIPE_WEBHOOK_SECRET: "whsec_dummy_for_local_unit_tests_only",
      STRIPE_PRICE_VIP: "price_test_vip",
      STRIPE_PRICE_BOT: "price_test_bot",
    },
  },
});
