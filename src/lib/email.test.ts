import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["AGENTMAIL_AGENTMAIL_API_KEY", "AGENTMAIL_INBOX_ID"] as const;
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

describe("isEmailConfigured", () => {
  it("is false when neither env var is set", async () => {
    delete process.env.AGENTMAIL_AGENTMAIL_API_KEY;
    delete process.env.AGENTMAIL_INBOX_ID;
    const { isEmailConfigured } = await import("./email");
    expect(isEmailConfigured()).toBe(false);
  });

  it("is false when only the API key is set, missing the sender inbox", async () => {
    process.env.AGENTMAIL_AGENTMAIL_API_KEY = "am_fake_for_tests";
    delete process.env.AGENTMAIL_INBOX_ID;
    const { isEmailConfigured } = await import("./email");
    expect(isEmailConfigured()).toBe(false);
  });

  it("is true once both the API key and sender inbox are set", async () => {
    process.env.AGENTMAIL_AGENTMAIL_API_KEY = "am_fake_for_tests";
    process.env.AGENTMAIL_INBOX_ID = "noreply@agentmail.to";
    const { isEmailConfigured } = await import("./email");
    expect(isEmailConfigured()).toBe(true);
  });
});
