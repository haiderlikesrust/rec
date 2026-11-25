import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { brand, clusters, isSolanaAddress, type Cluster, type TreasuryWallet } from "@gantry/shared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demo = process.env.DEMO === "1";
// the demo simulates mainnet, with mainnet's quote pairs
const cluster = (process.env.CLUSTER ?? (demo ? "mainnet-beta" : "devnet")) as Cluster;
if (!clusters[cluster]) throw new Error(`Unknown CLUSTER ${cluster}`);
const port = Number(process.env.PORT ?? 42069);

export const config = {
  /** Demo mode: no chain. Coins, trades and wallets are simulated in the database. */
  demo,
  cluster,
  rpc: process.env.RPC_URL ?? clusters[cluster].rpc,
  port,
  dataDir: process.env.DATA_DIR ?? path.join(root, "data"),
  /** Public base URL of this backend; token metadata URIs point here unless Pinata is configured. */
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
  pinataJwt: process.env.PINATA_JWT,
  jupiterApi: (process.env.JUPITER_API ?? "https://lite-api.jup.ag").replace(/\/$/, ""),
  jupiterKey: process.env.JUPITER_API_KEY,
  /** The platform token's mint, shown on the home page. Nothing buys it back; it trades like any coin. */
  mainToken: isSolanaAddress(process.env.MAIN_TOKEN_MINT ?? "") ? process.env.MAIN_TOKEN_MINT! : null,
  // The fee router loops every few seconds and splits a coin's fees as soon as they are worth more than the network
  // fees it costs to move them.
  /** Split a coin's fees (convert to SOL, send to OTC and protection) once they are worth this much. */
  feeMinUsd: Number(process.env.FEE_MIN_USD ?? (demo ? 0.25 : 2)),
  feesEveryMs: Number(process.env.FEES_EVERY_MS ?? (demo ? 5_000 : 15_000)),
  /** How often copies' Fleet entries are shared out to their leaders' holders. */
  entriesEveryMs: Number(process.env.ENTRIES_EVERY_MS ?? (demo ? 5_000 : 20_000)),
  /** How often realized losses are covered and owed protection payouts sent. */
  protectionEveryMs: Number(process.env.PROTECTION_EVERY_MS ?? (demo ? 5_000 : 30_000)),
  /**
   * The address lookup table launches use (see chain/engine.ts). The backend creates it and remembers it in its
   * database; set this to keep using the same table with a fresh database.
   */
  lookupTable: isSolanaAddress(process.env.LOOKUP_TABLE ?? "") ? process.env.LOOKUP_TABLE! : undefined,
  /**
   * A quote takes launches while it has at least this much DEX liquidity (Jupiter's figure, read with its price) and
   * this many dollars of it sell into SOL on Jupiter without moving its price further than this. The same impact
   * limit holds a first buy paid in SOL, which swaps the other way.
   */
  minLiquidityUsd: Number(process.env.MIN_LIQUIDITY_USD ?? 5_000),
  routeProbeUsd: Number(process.env.ROUTE_PROBE_USD ?? 100),
  routeMaxImpactBps: Number(process.env.ROUTE_MAX_IMPACT_BPS ?? 200),
  pollMs: Number(process.env.POLL_MS ?? 4000),
  solUsdFallback: Number(process.env.SOL_USD ?? 100),
};

mkdirSync(config.dataDir, { recursive: true });

// ---------------------------------------------------------------- backend-controlled wallets

export type Role = TreasuryWallet["role"];
export const roles: { role: Role; label: string; env: string }[] = [
  { role: "fees", label: "Fee wallet (claims, splits, Fleet entries)", env: "FEE_WALLET" },
  { role: "otc", label: "OTC reserve", env: "OTC_WALLET" },
  { role: "protection", label: brand.shield, env: "PROTECTION_WALLET" },
];

const walletDir = path.join(config.dataDir, "wallets");

/** A secret key from env: base58, a JSON byte array, or a path to a Solana CLI keyfile. */
function parseSecret(value: string): Keypair {
  const v = value.trim();
  if (v.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v)));
  if (existsSync(v)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(v, "utf8"))));
  return Keypair.fromSecretKey(bs58.decode(v));
}

/**
 * Loads each role's keypair from `<ROLE>_WALLET`, else from data/wallets/<role>.json. Demo mode creates the files on
 * first run; for a real cluster run `pnpm --filter @gantry/backend wallets` once and fund the wallets.
 */
export function loadWallets(create = config.demo): Record<Role, Keypair> {
  const out = {} as Record<Role, Keypair>;
  for (const { role, env } of roles) {
    const fromEnv = process.env[env];
    if (fromEnv) {
      out[role] = parseSecret(fromEnv);
      continue;
    }
    const file = path.join(walletDir, `${role}.json`);
    if (!existsSync(file)) {
      if (!create) throw new Error(`No ${env} set and no ${file}. Run \`pnpm --filter @gantry/backend wallets\` first.`);
      mkdirSync(walletDir, { recursive: true });
      writeFileSync(file, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    }
    out[role] = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
  }
  return out;
}

export const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);
