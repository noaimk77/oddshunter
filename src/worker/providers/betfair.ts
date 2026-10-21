import type { ExchangeDataProvider, NormalizedBetfairSnapshot } from "./types";
import { ProviderNotConfiguredError } from "./types";

/**
 * Betfair Exchange adapter — back/lay prices, spread, matched volume,
 * liquidity, market status. `BETFAIR_APP_KEY` / `BETFAIR_USERNAME` /
 * `BETFAIR_PASSWORD` are placeholders as of 2026-08-18 (developer access not
 * granted yet), so `isConfigured()` returns false and every fetch call
 * throws instead of returning fabricated snapshots. Wire the real
 * certificate/session login (Betfair's non-interactive auth) here once
 * access is active — do not fake data to unblock testing; use fixtures in
 * `*.test.ts` files instead.
 */
export function createBetfairProvider(): ExchangeDataProvider {
  const isConfigured = () =>
    Boolean(process.env.BETFAIR_APP_KEY && process.env.BETFAIR_USERNAME && process.env.BETFAIR_PASSWORD);

  return {
    name: "betfair",
    isConfigured,
    async fetchExchangeSnapshots(_externalMarketId: string): Promise<NormalizedBetfairSnapshot[]> {
      if (!isConfigured()) throw new ProviderNotConfiguredError("Betfair");
      throw new Error("Betfair adapter not implemented yet — isConfigured() passed, wire the real API call here.");
    },
  };
}
