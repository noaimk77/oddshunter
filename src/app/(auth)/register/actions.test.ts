import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// next-auth transitively imports next/server, which plain Vitest (outside
// Next's own bundler/export-map resolution) can't load — irrelevant here
// anyway, since neither test below reaches the signIn() call.
vi.mock("@/lib/auth", () => ({ signIn: vi.fn() }));

const { registerAction } = await import("./actions");

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const TEST_EMAIL = "register-race-test@oddshunter.dev";

describe("registerAction", () => {
  beforeEach(async () => {
    await db.user.deleteMany({ where: { email: TEST_EMAIL } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { email: TEST_EMAIL } });
    vi.restoreAllMocks();
  });

  it("rejects invalid input before touching the database", async () => {
    const result = await registerAction(
      {},
      formData({ email: "not-an-email", password: "Passw0rd", confirmPassword: "Passw0rd" })
    );
    expect(result.fieldErrors?.email).toBeDefined();
  });

  it("turns a concurrent duplicate-email race into the same friendly error, not a crash", async () => {
    // Simulate the race window: another request's create() already landed
    // between our findUnique check and our own create() call. We force
    // that exact scenario by making findUnique report "no existing user"
    // while a real row with that email already exists in the database —
    // so our own create() hits the real unique constraint, for real.
    await db.user.create({ data: { email: TEST_EMAIL, passwordHash: "irrelevant" } });
    vi.spyOn(db.user, "findUnique").mockResolvedValueOnce(null);

    const result = await registerAction(
      {},
      formData({ email: TEST_EMAIL, password: "Passw0rd", confirmPassword: "Passw0rd" })
    );

    expect(result.fieldErrors?.email).toBe("An account with this email already exists.");
  });
});
