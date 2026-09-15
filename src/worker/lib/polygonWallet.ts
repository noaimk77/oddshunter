import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, getAddress, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

/**
 * Native USDC on Polygon (Circle-issued, NOT the older bridged USDC.e).
 * Verified against polygonscan.com/token/0x3c499c542cef5e3811e1192ce70d8cc03d5c3359 —
 * sending to the wrong USDC contract silently loses funds, so this is not
 * configurable via env.
 */
const USDC_POLYGON_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

function getRpcUrl(): string {
  return process.env.AUTOBET_POLYGON_RPC_URL || "https://polygon-rpc.com";
}

function getPublicClient() {
  return createPublicClient({ chain: polygon, transport: http(getRpcUrl()) });
}

function getWalletAddress(): `0x${string}` {
  const raw = process.env.AUTOBET_WALLET_ADDRESS;
  if (!raw || !isAddress(raw)) {
    throw new Error("AUTOBET_WALLET_ADDRESS manquant ou invalide (adresse Polygon 0x...).");
  }
  return getAddress(raw);
}

function getWithdrawAddress(): `0x${string}` {
  const raw = process.env.AUTOBET_WITHDRAW_ADDRESS;
  if (!raw || !isAddress(raw)) {
    throw new Error("AUTOBET_WITHDRAW_ADDRESS manquant ou invalide — adresse de dépôt Kraken (réseau Polygon).");
  }
  return getAddress(raw);
}

function getAccount() {
  const key = process.env.AUTOBET_WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error("AUTOBET_WALLET_PRIVATE_KEY manquant.");
  }
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  return privateKeyToAccount(normalized as `0x${string}`);
}

export interface WalletBalances {
  address: `0x${string}`;
  usdc: number;
  /** Native POL (ex-MATIC) balance, needed to pay gas — not spendable as funds. */
  pol: number;
}

export async function fetchWalletBalances(): Promise<WalletBalances> {
  const address = getWalletAddress();
  const client = getPublicClient();

  const [usdcRaw, polRaw] = await Promise.all([
    client.readContract({
      address: USDC_POLYGON_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    client.getBalance({ address }),
  ]);

  return {
    address,
    usdc: Number(formatUnits(usdcRaw, USDC_DECIMALS)),
    pol: Number(formatUnits(polRaw, 18)),
  };
}

/** Minimum native POL kept as a rough "enough for one transfer" sanity check (Polygon gas is a fraction of a cent, this is generous). */
const MIN_POL_FOR_GAS = 0.01;

export interface WithdrawResult {
  txHash: `0x${string}`;
  amount: number;
  to: `0x${string}`;
}

/**
 * Sends USDC from the bot's wallet to the FIXED, pre-configured withdrawal
 * address (AUTOBET_WITHDRAW_ADDRESS) — never a caller-supplied destination.
 * That's a deliberate safety property: even if the Telegram bot token or
 * chat is ever compromised, funds can only leave to this one address.
 */
export async function withdrawUsdc(amount: number): Promise<WithdrawResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant invalide.");
  }

  const account = getAccount();
  const to = getWithdrawAddress();
  const publicClient = getPublicClient();
  const walletClient = createWalletClient({ account, chain: polygon, transport: http(getRpcUrl()) });

  const balances = await fetchWalletBalances();
  if (account.address.toLowerCase() !== balances.address.toLowerCase()) {
    throw new Error("AUTOBET_WALLET_PRIVATE_KEY ne correspond pas à AUTOBET_WALLET_ADDRESS.");
  }
  if (amount > balances.usdc) {
    throw new Error(`Solde insuffisant : ${balances.usdc.toFixed(2)} USDC disponibles.`);
  }
  if (balances.pol < MIN_POL_FOR_GAS) {
    throw new Error(
      `Pas assez de POL pour payer le gas (${balances.pol.toFixed(4)} POL) — envoie ~1 POL sur ${balances.address} avant de retirer.`,
    );
  }

  const amountRaw = parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const txHash = await walletClient.writeContract({
    address: USDC_POLYGON_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to, amountRaw],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash, amount, to };
}
