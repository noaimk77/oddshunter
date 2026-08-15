import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(rootDir, "src") },
  },
  test: {
    environment: "node",
    // Pure-logic tests only touch modules that eagerly construct a Prisma
    // client at import time (src/lib/db.ts) — these values just need to be
    // present and well-formed so that construction doesn't throw; no test
    // in this suite performs a real query, so no real database is needed.
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-not-for-production-use-0000000000",
    },
  },
});
