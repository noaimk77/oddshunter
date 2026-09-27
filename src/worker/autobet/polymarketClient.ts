import { createWalletClient, http, isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { ClobClient, Chain, Side, OrderType } from "@polymarket/clob-client-v2";

/**
 * Live since 2026-09-27 — Noaim confirmed Monaco residency (no ANJ
 * jurisdiction there; the earlier "ANJ-blocked" finding was specific to a
 * different network path, not this box). AUTOBET_LIVE_ENABLED=true.
 */

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";
const DATA_API_BASE = "https://data-api.polymarket.com";

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
  /** The parent event's own title — e.g. "Valorant: Team Vitality vs LOUD".
   *  Sub-markets like totals ("Games Total: O/U 2.5") often don't restate
   *  either team's name in their OWN question, only the event does; fixture
   *  matching needs both, see polymarketMatcher.questionMatchesFixture. */
  eventTitle: string;
}

/** Gamma API — public, unauthenticated. `/markets?search=` is NOT a real
 *  keyword search (verified 2026-09-27: it silently ignores the param and
 *  returns whatever's most popular/recent) — the actual full-text search
 *  lives at `/public-search`, which returns EVENTS (each wrapping one or
 *  more markets), not markets directly. Flattened here so callers keep
 *  working with a flat market list, carrying the parent event's title along
 *  (see PolymarketMarket.eventTitle). */
export async function searchEsportsMarkets(query: string): Promise<PolymarketMarket[]> {
  const url = new URL(`${GAMMA_BASE}/public-search`);
  url.searchParams.set("q", query);
  url.searchParams.set("events_status", "active");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polymarket Gamma search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { events?: any[] };
  return (body.events ?? []).flatMap((ev) =>
    (ev.markets ?? []).map((r: any) => ({
      conditionId: r.conditionId,
      question: r.question,
      slug: r.slug,
      eventTitle: ev.title ?? "",
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
    })),
  );
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

/** SELL market order for `sizeShares` of one outcome token — used to cash
 *  out (or as the first leg of a flip) an existing position. FAK, not FOK:
 *  a cash-out that fills 90% is still a real cash-out, better than an
 *  all-or-nothing order failing outright on thin end-of-match liquidity. */
export async function sellPolymarketPosition(tokenId: string, sizeShares: number): Promise<PlacePolymarketOrderResult> {
  try {
    const client = await getClobClient();
    const response = await client.createAndPostMarketOrder(
      { tokenID: tokenId, amount: sizeShares, side: Side.SELL },
      { tickSize: "0.01" as any },
      OrderType.FAK,
    );
    return { ok: true, orderId: (response as any).orderID ?? (response as any).orderId, status: (response as any).status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface PolymarketPosition {
  asset: string; // tokenId
  conditionId: string;
  size: number;
  outcome: string;
}

/** Data API, public/unauthenticated — the wallet's current on-chain-settled
 *  positions. Used right after a BUY (to record the real filled share
 *  count on the ticket — more reliable than parsing the order response's
 *  own maker/taker amounts) and again at cash-out time (to know exactly
 *  how many shares are left to sell, in case of a prior partial sell). */
export async function fetchPolymarketPositions(): Promise<PolymarketPosition[]> {
  const account = getAccount();
  const res = await fetch(`${DATA_API_BASE}/positions?user=${account.address}`);
  if (!res.ok) throw new Error(`Polymarket Data API positions failed: HTTP ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({ asset: r.asset, conditionId: r.conditionId, size: Number(r.size), outcome: r.outcome }));
}

/** Polls fetchPolymarketPositions for `tokenId` until it shows a non-zero
 *  size or `timeoutMs` elapses — settlement after a market order isn't
 *  always instant. Returns 0 (not an error) on timeout; the caller decides
 *  whether that's acceptable. */
export async function waitForPolymarketFill(tokenId: string, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const positions = await fetchPolymarketPositions().catch(() => []);
    const match = positions.find((p) => p.asset === tokenId);
    if (match && match.size > 0) return match.size;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return 0;
}
