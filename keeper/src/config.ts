import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
  type Account,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainsById, deployments } from "@cook/shared";

export type Deployment = {
  chainId: number;
  startBlock: number;
  poolManager: Address;
  hook: Address;
  launchpad: Address;
  feeRouter: Address;
  otcReserve: Address;
  protectionFund: Address;
  holderAirdrop: Address;
  router: Address;
  keeper: Address;
  mainToken: Address;
  [quote: string]: Address | number;
};

export type Ctx = {
  chain: Chain;
  d: Deployment;
  pub: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
  indexerUrl: string;
  dataDir: string;
  log: (...args: unknown[]) => void;
};

/** Anvil's well-known second account; only used when no KEEPER_PRIVATE_KEY is set on the local chain. */
const ANVIL_KEEPER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

export function createCtx(): Ctx {
  const chainId = Number(process.env.CHAIN_ID ?? 31337);
  const chain = (chainsById as Record<number, Chain>)[chainId];
  if (!chain) throw new Error(`Unknown chain ${chainId}`);
  const d = (deployments as unknown as Record<number, Deployment>)[chainId];
  if (!d) throw new Error(`No deployment for chain ${chainId}; deploy and run \`pnpm gen\``);
  const rpc = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];

  const key = process.env.KEEPER_PRIVATE_KEY ?? (chainId === 31337 ? ANVIL_KEEPER_KEY : undefined);
  if (!key) throw new Error("KEEPER_PRIVATE_KEY is required");
  const account = privateKeyToAccount(key as `0x${string}`);

  const dataDir =
    process.env.KEEPER_DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  mkdirSync(dataDir, { recursive: true });

  return {
    chain,
    d,
    pub: createPublicClient({ chain, transport: http(rpc), pollingInterval: chainId === 31337 ? 50 : 1_000 }) as PublicClient,
    wallet: createWalletClient({ chain, transport: http(rpc), account }),
    indexerUrl: process.env.INDEXER_URL ?? "http://localhost:42069",
    dataDir,
    log: (...args) => console.log(new Date().toISOString().slice(11, 19), ...args),
  };
}

/** Wait until the indexer has processed the chain's latest block. */
export async function waitForIndexer(ctx: Ctx, timeoutMs = 180_000) {
  const target = await ctx.pub.getBlockNumber();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${ctx.indexerUrl}/status`);
      const status = (await res.json()) as Record<string, { block?: { number: number } }>;
      const block = Object.values(status)[0]?.block?.number ?? 0;
      if (BigInt(block) >= target) return;
    } catch {
      // indexer not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("indexer did not catch up in time");
}
