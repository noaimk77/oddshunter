import { createPublicClient, http, getAddress, formatUnits, isAddress } from "viem";
import { polygon } from "viem/chains";

/**
 * Polymarket settles in USDC.e (bridged USDC on Polygon), condition
 * verified on-chain 2026-09-27 by reading the CTF Exchange's
 * getCollateral() -> 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 ("USD Coin
 * (PoS)"). This is NOT the native USDC (0x3c499…) that polygonWallet.ts
 * tracks for the /solde command — so the Polymarket bankroll must read THIS
 * token's balance specifically. 6 decimals, ~1:1 with USD.
 */
const USDCE_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;

const ERC20_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function rpcUrl(): string {
  return process.env.AUTOBET_POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
}

/**
 * The bot wallet's spendable Polymarket bankroll = its USDC.e balance.
 * Returns null (not 0) when the address is missing or the RPC call fails,
 * so the caller can tell "genuinely empty" from "couldn't read" and fall
 * back to the assumed-bankroll only for simulation display.
 */
export async function fetchPolymarketBankrollUsd(): Promise<number | null> {
  const addr = process.env.AUTOBET_WALLET_ADDRESS;
  if (!addr || !isAddress(addr)) return null;
  try {
    const client = createPublicClient({ chain: polygon, transport: http(rpcUrl()) });
    const bal = await client.readContract({
      address: USDCE_POLYGON,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [getAddress(addr)],
    });
    return Number(formatUnits(bal, 6));
  } catch {
    return null;
  }
}
