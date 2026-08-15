import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("Passw0rd!");
    expect(hash).not.toBe("Passw0rd!");
    expect(hash).not.toContain("Passw0rd");
  });

  it("verifies the correct password against its own hash", async () => {
    const hash = await hashPassword("Passw0rd!");
    await expect(verifyPassword("Passw0rd!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Passw0rd!");
    await expect(verifyPassword("WrongPassword1", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("Passw0rd!"), hashPassword("Passw0rd!")]);
    expect(a).not.toBe(b);
  });
});
