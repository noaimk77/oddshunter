import { createWalletClient, http, isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { ClobClient, Chain, Side, OrderType } from "@polymarket/clob-client-v2";

/**
 * NOT wired into the autobet router (see router.ts) — polymarket.com,
 * gamma-api.polymarket.com and clob.polymarket.com are all DNS-redirected
 * to the French gambling regulator's (ANJ) block page from Fly's `cdg`
 * (Paris) region, same as stake.com; ANJ-licensed books (bet365, betfair)
 * resolve fine. Polymarket is not authorized to operate in France. This
 * file exists so the integration is ready the moment that's resolved
 * (different Fly region outside France, or Noaim's own call on access) —
 * it is not meant to be deployed live as-is. See the 2026-09-27
 * conversation and router.ts's POLYMARKET_BLOCKED_REASON.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

export interface PolymarketOutcome {
  name: string;
  tokenId: string;
  price: number; // implied probability, 0-1
}

export interface PolymarketMarket {
  conditionId: string;
  question: string;
  slug: string;
  outcomes: PolymarketOutcome[];
}

/** Gamma API — public, unauthenticated market metadata. Esports events are
 *  tagged and searchable by team name in the question text; there is no
 *  "search by two team names" endpoint, so this pulls active markets for
 *  a keyword and lets the caller pick the best question match. */
export async function searchEsportsMarkets(query: string): Promise<PolymarketMarket[]> {
  const url = new URL(`${GAMMA_BASE}/markets`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", "50");
  url.searchParams.set("search", query);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polymarket Gamma search failed: HTTP ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({
    conditionId: r.conditionId,
    question: r.question,
    slug: r.slug,
    outcomes: (() => {
      try {
        const names: string[] = JSON.parse(r.outcomes ?? "[]");
        const tokenIds: string[] = JSON.parse(r.clobTokenIds ?? "[]");
        const prices: string[] = JSON.parse(r.outcomePrices ?? "[]");
        return names.map((name, i) => ({ name, tokenId: tokenIds[i], price: Number.parseFloat(prices[i] ?? "0") }));
      } catch {
        return [];
      }
    })(),
  }));
}

function getAccount() {
  const key = process.env.AUTOBET_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("AUTOBET_WALLET_PRIVATE_KEY manquant.");
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  return privateKeyToAccount(normalized as `0x${string}`);
}

let cachedClient: ClobClient | null = null;

/** Builds (and caches) an authenticated CLOB client from the same wallet
 *  already used for the USDC bankroll (polygonWallet.ts) — no separate
 *  Polymarket signup needed, funds trade directly out of that wallet.
 *  API creds are derived deterministically from the wallet signature
 *  (createOrDeriveApiKey), not stored anywhere. */
async function getClobClient(): Promise<ClobClient> {
  if (cachedClient) return cachedClient;
  const account = getAccount();
  const walletClient = createWalletClient({ account, chain: polygon, transport: http() });
  const client = new ClobClient({ host: CLOB_BASE, chain: Chain.POLYGON, signer: walletClient });
  const creds = await client.createOrDeriveApiKey();
  cachedClient = new ClobClient({ host: CLOB_BASE, chain: Chain.POLYGON, signer: walletClient, creds });
  return cachedClient;
}

export interface PlacePolymarketOrderResult {
  ok: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

/** BUY market order on one outcome token — `stakeEur` is spent 1:1 as USDC
 *  (Polymarket prices shares in USDC; no FX conversion attempted here). */
export async function placePolymarketOrder(tokenId: string, stakeEur: number): Promise<PlacePolymarketOrderResult> {
  try {
    const client = await getClobClient();
    const account = getAccount();
    if (!isAddress(account.address)) throw new Error("wallet address invalide");
    const response = await client.createAndPostMarketOrder(
      { tokenID: tokenId, amount: stakeEur, side: Side.BUY },
      { tickSize: "0.01" as any },
      OrderType.FOK,
    );
    return { ok: true, orderId: (response as any).orderID ?? (response as any).orderId, status: (response as any).status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
