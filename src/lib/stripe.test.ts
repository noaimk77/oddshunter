import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_PRICE_VIP", "STRIPE_PRICE_BOT"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("isStripeConfigured", () => {
  it("is false when STRIPE_SECRET_KEY is unset", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(false);
  });

  it("is true once STRIPE_SECRET_KEY is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
    const { isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(true);
  });
});

describe("stripe (lazy client)", () => {
  it("does not throw at import time even with no key configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(import("./stripe")).resolves.toBeDefined();
  });

  it("throws only when actually used, not on import, when unconfigured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { stripe } = await import("./stripe");
    expect(() => stripe.customers).toThrow(/STRIPE_SECRET_KEY is not set/);
  });

  it("works once a key is configured", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_tests";
    const { stripe } = await import("./stripe");
    expect(() => stripe.customers).not.toThrow();
  });
});

describe("PRICE_TO_ENTITLEMENT", () => {
  it("only maps price IDs that are actually configured via env vars", async () => {
    process.env.STRIPE_PRICE_VIP = "price_vip_123";
    delete process.env.STRIPE_PRICE_BOT;
    const { PRICE_TO_ENTITLEMENT } = await import("./stripe");
    expect(PRICE_TO_ENTITLEMENT).toEqual({ price_vip_123: "VIP" });
  });

  it("maps both products when both env vars are set", async () => {
    process.env.STRIPE_PRICE_VIP = "price_vip_123";
    process.env.STRIPE_PRICE_BOT = "price_bot_456";
    const { PRICE_TO_ENTITLEMENT } = await import("./stripe");
    expect(PRICE_TO_ENTITLEMENT).toEqual({ price_vip_123: "VIP", price_bot_456: "BOT" });
  });

  it("never accepts a client-supplied price ID that isn't in this map", async () => {
    process.env.STRIPE_PRICE_VIP = "price_vip_123";
    delete process.env.STRIPE_PRICE_BOT;
    const { PRICE_TO_ENTITLEMENT } = await import("./stripe");
    expect(PRICE_TO_ENTITLEMENT["price_attacker_supplied"]).toBeUndefined();
  });
});
