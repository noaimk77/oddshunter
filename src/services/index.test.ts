import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProvider } from "./index";
import { BetfairProvider } from "./betfair-provider";
import { MockMarketDataProvider } from "./mock-market-data-provider";
import { UnavailableMarketDataProvider } from "./unavailable-market-data-provider";

const BETFAIR_KEYS = ["BETFAIR_APP_KEY", "BETFAIR_USERNAME", "BETFAIR_PASSWORD"] as const;

beforeEach(() => {
  for (const key of BETFAIR_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildProvider", () => {
  it("picks BetfairProvider when full real credentials are present, regardless of NODE_ENV", () => {
    process.env.BETFAIR_APP_KEY = "app-key";
    process.env.BETFAIR_USERNAME = "user";
    process.env.BETFAIR_PASSWORD = "pass";
    vi.stubEnv("NODE_ENV", "production");
    expect(buildProvider()).toBeInstanceOf(BetfairProvider);
  });

  it("never falls back to mock data in production, even without Betfair credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(buildProvider()).toBeInstanceOf(UnavailableMarketDataProvider);
  });

  it("uses mock data only in local development, and only absent real credentials", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildProvider()).toBeInstanceOf(MockMarketDataProvider);
  });

  it("requires all three Betfair credentials, not just some of them", () => {
    process.env.BETFAIR_APP_KEY = "app-key";
    // username/password intentionally left unset
    vi.stubEnv("NODE_ENV", "production");
    expect(buildProvider()).toBeInstanceOf(UnavailableMarketDataProvider);
  });

  it("prefers a real Betfair connection over mock data even in development", () => {
    process.env.BETFAIR_APP_KEY = "app-key";
    process.env.BETFAIR_USERNAME = "user";
    process.env.BETFAIR_PASSWORD = "pass";
    vi.stubEnv("NODE_ENV", "development");
    expect(buildProvider()).toBeInstanceOf(BetfairProvider);
  });
});
