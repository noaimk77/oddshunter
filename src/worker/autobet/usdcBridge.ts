import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getAddress, isAddress, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { getContractConfig } from "@polymarket/clob-client-v2";

/**
 * Bridges the gap between what Noaim funds the bot with (native USDC,
 * 0x3c499…, same token polygonWallet.ts / Kraken withdrawals use) and what
 * Polymarket actually settles in (USDC.e / bridged USDC, 0x2791…, confirmed
 * on-chain 2026-09-27 by reading the CTF Exchange's getCollateral()). The
 * two are both "USDC" but are different ERC20 contracts — sending native
 * USDC straight to Polymarket does nothing until it's swapped.
 *
 * Route: Uniswap V3, fee tier 100 (0.01%) — verified on-chain 2026-09-27
 * to be the deepest USDC/USDC.e pool by a wide margin (liquidity() ~1.5e15
 * vs ~5.6e13 on the 500 tier and negligible on 3000/10000). SwapRouter02,
 * bytecode-verified present on Polygon at the address below.
 */
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
const SWAP_ROUTER02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" as const;
const POOL_FEE = 100;
const DECIMALS = 6;

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const ERC1155_ABI = [
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "op", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ name: "op", type: "address" }, { name: "a", type: "bool" }], outputs: [] },
] as const;

const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

function rpcUrl(): string {
  return process.env.AUTOBET_POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
}

function getAccount() {
  const key = process.env.AUTOBET_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("AUTOBET_WALLET_PRIVATE_KEY manquant.");
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  return privateKeyToAccount(normalized as `0x${string}`);
}

function clients() {
  const account = getAccount();
  const transport = http(rpcUrl());
  return {
    account,
    publicClient: createPublicClient({ chain: polygon, transport }),
    walletClient: createWalletClient({ account, chain: polygon, transport }),
  };
}

export interface SwapResult {
  swapped: boolean;
  txHash?: string;
  amountInUsdc: number;
  amountOutUsdce?: number;
  reason?: string;
}

/**
 * Swaps up to `amountUsdc` of native USDC into USDC.e via the Uniswap V3
 * pool, leaving `keepNativeForGas` worth untouched isn't relevant here
 * (gas is paid in POL, not USDC) — the whole requested amount is swapped.
 * 0.5% slippage tolerance: generous for a near-1:1 stable pair with deep
 * liquidity, tight enough to catch a genuinely broken quote/pool.
 */
export async function swapNativeUsdcToUsdce(amountUsdc: number): Promise<SwapResult> {
  if (amountUsdc <= 0) return { swapped: false, amountInUsdc: amountUsdc, reason: "amount must be > 0" };
  const { account, publicClient, walletClient } = clients();

  const balance = await publicClient.readContract({ address: USDC_NATIVE, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  const amountIn = parseUnits(amountUsdc.toString(), DECIMALS);
  if (balance < amountIn) {
    return { swapped: false, amountInUsdc: amountUsdc, reason: `solde USDC natif insuffisant (${formatUnits(balance, DECIMALS)} disponible)` };
  }

  // Approve the router for this amount if the current allowance is short —
  // never approve unlimited, each swap only unlocks what it needs.
  const allowance = await publicClient.readContract({ address: USDC_NATIVE, abi: ERC20_ABI, functionName: "allowance", args: [account.address, SWAP_ROUTER02] });
  if (allowance < amountIn) {
    const approveHash = await walletClient.writeContract({ address: USDC_NATIVE, abi: ERC20_ABI, functionName: "approve", args: [SWAP_ROUTER02, amountIn] });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const amountOutMinimum = (amountIn * BigInt(995)) / BigInt(1000); // 0.5% slippage floor
  const hash = await walletClient.writeContract({
    address: SWAP_ROUTER02,
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{ tokenIn: USDC_NATIVE, tokenOut: USDCE, fee: POOL_FEE, recipient: account.address, amountIn, amountOutMinimum, sqrtPriceLimitX96: BigInt(0) }],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    return { swapped: false, amountInUsdc: amountUsdc, txHash: hash, reason: "transaction reverted on-chain" };
  }

  const newUsdceBalance = await publicClient.readContract({ address: USDCE, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  return { swapped: true, txHash: hash, amountInUsdc: amountUsdc, amountOutUsdce: Number(formatUnits(newUsdceBalance, DECIMALS)) };
}

export interface PrepareResult {
  ok: boolean;
  steps: string[];
  error?: string;
}

/**
 * One-time on-chain setup so the wallet can actually trade on Polymarket:
 * approve the CTF Exchange (and its neg-risk counterpart, used by a good
 * share of esports markets) to spend USDC.e, and approve both to move the
 * wallet's ERC1155 outcome-token positions (needed to SELL/cash-out later,
 * not just buy). Idempotent — checks each allowance/approval first and
 * only sends a transaction where one is actually missing, safe to call on
 * every funding event.
 */
export async function prepareWalletForPolymarket(): Promise<PrepareResult> {
  const { account, publicClient, walletClient } = clients();
  const contracts = getContractConfig(137); // 137 = Polygon mainnet
  const steps: string[] = [];

  try {
    for (const [label, spender] of [
      ["Exchange", contracts.exchange],
      ["NegRiskExchange", contracts.negRiskExchange],
    ] as const) {
      const allowance = await publicClient.readContract({ address: USDCE, abi: ERC20_ABI, functionName: "allowance", args: [account.address, getAddress(spender)] });
      if (allowance < maxUint256 / BigInt(2)) {
        const hash = await walletClient.writeContract({ address: USDCE, abi: ERC20_ABI, functionName: "approve", args: [getAddress(spender), maxUint256] });
        await publicClient.waitForTransactionReceipt({ hash });
        steps.push(`USDC.e approved for ${label} (tx ${hash})`);
      } else {
        steps.push(`USDC.e already approved for ${label}`);
      }

      const approvedForAll = await publicClient.readContract({ address: getAddress(contracts.conditionalTokens), abi: ERC1155_ABI, functionName: "isApprovedForAll", args: [account.address, getAddress(spender)] });
      if (!approvedForAll) {
        const hash = await walletClient.writeContract({ address: getAddress(contracts.conditionalTokens), abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [getAddress(spender), true] });
        await publicClient.waitForTransactionReceipt({ hash });
        steps.push(`positions approved for ${label} (tx ${hash})`);
      } else {
        steps.push(`positions already approved for ${label}`);
      }
    }
    return { ok: true, steps };
  } catch (err) {
    return { ok: false, steps, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Full onboarding: swap whatever native USDC just landed in the wallet
 *  into USDC.e, then make sure the on-chain approvals are in place. Called
 *  by the autobet bot after a deposit is detected (see autobetBot.ts). */
export async function onboardDeposit(amountUsdc: number): Promise<{ swap: SwapResult; prepare: PrepareResult | null }> {
  const swap = await swapNativeUsdcToUsdce(amountUsdc);
  if (!swap.swapped) return { swap, prepare: null };
  const prepare = await prepareWalletForPolymarket();
  return { swap, prepare };
}
