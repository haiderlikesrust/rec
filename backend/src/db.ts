import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fleetKey } from "@gantry/shared";
import { config } from "./config";

/**
 * One SQLite file holds everything the API serves: coins, trades, holders, fee buckets, OTC and protection state.
 * Real mode fills it from the chain; demo mode fills it from the simulator. Raw token amounts are TEXT (bigint).
 */
const file = process.env.DB_FILE ?? path.join(config.dataDir, config.demo ? "demo.db" : `${config.cluster}.db`);

const SCHEMA = `
-- grp: its group in the pair picker. usd: the price of one whole unit of the raw amount (raw / 10^decimals), last
-- confirmed by Jupiter at price_at, with liquidity its DEX liquidity in USD. ui_scale: what wallets multiply an amount
-- by before showing it (1 unless the mint scales its displayed amounts, as tokenized stocks do for dividends and
-- splits). fee_bps, fee_max: the mint's own transfer fee and its cap (raw, '' for none). min_raise: LaunchLab's floor
-- on what a curve on this quote must raise (raw). available = 0 when LaunchLab has no global config for it; error:
-- why launches on it are off for now (a sentence for the launcher), from the mint and the config, last read from the
-- chain at checked_at; route_error: the same, from its route to SOL, last asked for at route_at.
CREATE TABLE IF NOT EXISTS quote (
  mint TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, grp TEXT NOT NULL DEFAULT 'crypto',
  issuer TEXT NOT NULL DEFAULT '', logo TEXT NOT NULL, decimals INTEGER NOT NULL, usd REAL NOT NULL, price_at INTEGER NOT NULL DEFAULT 0,
  liquidity REAL NOT NULL DEFAULT 0, ui_scale REAL NOT NULL DEFAULT 1, fee_bps INTEGER NOT NULL DEFAULT 0, fee_max TEXT NOT NULL DEFAULT '',
  min_raise TEXT NOT NULL DEFAULT '0', available INTEGER NOT NULL DEFAULT 1, error TEXT, checked_at INTEGER NOT NULL DEFAULT 0,
  route_error TEXT, route_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quote_grp ON quote(grp);
-- pool: the LaunchLab curve; cpmm_pool: the Raydium CPMM pool it graduated to; fee_key: the NFT that collects that
-- pool's locked LP fees
CREATE TABLE IF NOT EXISTS coin (
  mint TEXT PRIMARY KEY, pool TEXT NOT NULL, cpmm_pool TEXT, fee_key TEXT, quote TEXT NOT NULL,
  name TEXT NOT NULL, symbol TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '', twitter TEXT NOT NULL DEFAULT '', telegram TEXT NOT NULL DEFAULT '', uri TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL, created_at INTEGER NOT NULL, decimals INTEGER NOT NULL DEFAULT 6,
  -- market, raw units. On the curve the price is (virtual_quote + quote_reserve) / (virtual_base - base_sold), and it
  -- completes at base_sold = curve_sell with threshold quote raised. After graduation it is pool_quote / pool_base.
  price REAL NOT NULL, ath REAL NOT NULL, start_price REAL NOT NULL,
  virtual_base TEXT NOT NULL, virtual_quote TEXT NOT NULL, curve_sell TEXT NOT NULL, threshold TEXT NOT NULL,
  base_sold TEXT NOT NULL DEFAULT '0', quote_reserve TEXT NOT NULL DEFAULT '0',
  pool_base TEXT NOT NULL DEFAULT '0', pool_quote TEXT NOT NULL DEFAULT '0',
  graduated INTEGER NOT NULL DEFAULT 0, graduated_at INTEGER,
  total_supply TEXT NOT NULL, burned TEXT NOT NULL DEFAULT '0',
  -- activity
  trades INTEGER NOT NULL DEFAULT 0, volume_quote TEXT NOT NULL DEFAULT '0', volume_sol REAL NOT NULL DEFAULT 0,
  last_trade_at INTEGER NOT NULL DEFAULT 0, holders INTEGER NOT NULL DEFAULT 0,
  -- fees, in the quote: fees = everything traders paid, protocol = Raydium's share, income = what the fee wallet has
  -- earned for certain (claimable = the part of it still in the platform's fee vault), harvest = an estimate of what
  -- waits in the CPMM pool, split = how much of the income went to the buckets; pending_sol = SOL waiting to be split
  fees_quote TEXT NOT NULL DEFAULT '0', fees_sol REAL NOT NULL DEFAULT 0, protocol_quote TEXT NOT NULL DEFAULT '0',
  protocol_sol REAL NOT NULL DEFAULT 0, income_quote TEXT NOT NULL DEFAULT '0', claimable_quote TEXT NOT NULL DEFAULT '0',
  harvest_quote TEXT NOT NULL DEFAULT '0', split_quote TEXT NOT NULL DEFAULT '0', pending_sol REAL NOT NULL DEFAULT 0,
  -- where the fees went: SOL to the two buckets, and the coins burned out of fees that came back in the coin itself
  sol_to_otc REAL NOT NULL DEFAULT 0, sol_to_protection REAL NOT NULL DEFAULT 0, fee_burned TEXT NOT NULL DEFAULT '0',
  -- OTC reserve accounting (SOL)
  otc_credit REAL NOT NULL DEFAULT 0, otc_last_contribution INTEGER NOT NULL DEFAULT 0, otc_burned TEXT NOT NULL DEFAULT '0',
  -- protection: SOL committed to this coin's sellers so far (its pot is sol_to_protection minus this)
  protection_paid REAL NOT NULL DEFAULT 0,
  -- rug heuristic
  creator_bought TEXT NOT NULL DEFAULT '0', creator_sold TEXT NOT NULL DEFAULT '0',
  -- Fleet (see fleet.ts): look-alike keys, the family's OG, fee shares routed to leaders, and a copy's entry
  ticker_key TEXT NOT NULL DEFAULT '', name_key TEXT NOT NULL DEFAULT '', family TEXT NOT NULL DEFAULT '',
  fleet_sent_sol REAL NOT NULL DEFAULT 0, fleet_received_sol REAL NOT NULL DEFAULT 0,
  entry_status TEXT, entry_tokens TEXT NOT NULL DEFAULT '0', entry_sol REAL NOT NULL DEFAULT 0, entry_for TEXT,
  entry_sent TEXT NOT NULL DEFAULT '0', entry_recipients INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS coin_quote ON coin(quote);
CREATE INDEX IF NOT EXISTS coin_pool ON coin(pool);
CREATE INDEX IF NOT EXISTS coin_family ON coin(family);
CREATE TABLE IF NOT EXISTS trade (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, trader TEXT NOT NULL, is_buy INTEGER NOT NULL, quote_amount TEXT NOT NULL,
  token_amount TEXT NOT NULL, tax TEXT NOT NULL, price REAL NOT NULL, sol_value REAL NOT NULL, ts INTEGER NOT NULL,
  tx TEXT NOT NULL, kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trade_coin_ts ON trade(coin, ts);
CREATE INDEX IF NOT EXISTS trade_ts ON trade(ts);
CREATE INDEX IF NOT EXISTS trade_trader ON trade(trader);
CREATE TABLE IF NOT EXISTS candle (
  coin TEXT NOT NULL, t INTEGER NOT NULL, o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL, v REAL NOT NULL,
  PRIMARY KEY (coin, t)
);
CREATE TABLE IF NOT EXISTS holder (
  coin TEXT NOT NULL, wallet TEXT NOT NULL, balance TEXT NOT NULL DEFAULT '0', cost_basis TEXT NOT NULL DEFAULT '0',
  first_buy_at INTEGER NOT NULL DEFAULT 0, realized TEXT NOT NULL DEFAULT '0', tax_paid TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (coin, wallet)
);
CREATE INDEX IF NOT EXISTS holder_wallet ON holder(wallet);
CREATE TABLE IF NOT EXISTS loss (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, wallet TEXT NOT NULL, ts INTEGER NOT NULL, loss_quote TEXT NOT NULL,
  loss_sol REAL NOT NULL, sol_usd REAL NOT NULL, hold INTEGER NOT NULL, tax_paid_sol REAL NOT NULL, processed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS loss_ts ON loss(ts);
-- one row per covered loss, under the id of the sale that realized it: what it pays, the USD price of SOL at that
-- sale, and the transfer that paid it (NULL while owed, 'sending:…' mid-send)
CREATE TABLE IF NOT EXISTS protection_payout (
  id TEXT PRIMARY KEY, wallet TEXT NOT NULL, coin TEXT NOT NULL, ts INTEGER NOT NULL, loss_sol REAL NOT NULL, sol_usd REAL NOT NULL,
  hold INTEGER NOT NULL, tier_bps INTEGER NOT NULL, amount_sol REAL NOT NULL, limit_by TEXT NOT NULL, tx TEXT, sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS payout_wallet ON protection_payout(wallet);
CREATE INDEX IF NOT EXISTS payout_tx ON protection_payout(tx);
-- a copy's Fleet entry, shared out to the leader's holders (tx NULL until sent)
CREATE TABLE IF NOT EXISTS entry_drop (
  coin TEXT NOT NULL, wallet TEXT NOT NULL, amount TEXT NOT NULL, tx TEXT, ts INTEGER NOT NULL, PRIMARY KEY (coin, wallet)
);
CREATE TABLE IF NOT EXISTS otc_quote (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, wallet TEXT NOT NULL, side TEXT NOT NULL, amount_in TEXT NOT NULL,
  amount_out TEXT NOT NULL, tax TEXT NOT NULL, sol_gross REAL NOT NULL, price_sol REAL NOT NULL, created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, last_valid_height INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, signature TEXT
);
CREATE INDEX IF NOT EXISTS otc_quote_status ON otc_quote(status);
-- every movement of treasury funds, for audit
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, coin TEXT, kind TEXT NOT NULL, mint TEXT NOT NULL,
  amount TEXT NOT NULL, sol REAL NOT NULL DEFAULT 0, tx TEXT, note TEXT
);
-- demo mode: simulated balances (mint 'SOL' = lamports)
CREATE TABLE IF NOT EXISTS balance (wallet TEXT NOT NULL, mint TEXT NOT NULL, amount TEXT NOT NULL, PRIMARY KEY (wallet, mint));
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

function open() {
  const d = new DatabaseSync(file);
  // WAL + a busy timeout: during a zero-downtime update two servers share this file for a few seconds
  d.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;");
  return d;
}

let opened = open();
if (config.demo) {
  // The demo's database is simulated history the seeder writes again, so one whose tables are laid out differently
  // from the schema above is thrown away rather than read. The file carries the fingerprint of the schema it was made with.
  const layout = Number.parseInt(createHash("sha256").update(SCHEMA.replace(/--.*$/gm, "").replace(/\s+/g, " ")).digest("hex").slice(0, 7), 16);
  const made = (opened.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (made !== layout && opened.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get()) {
    opened.close();
    for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true });
    opened = open();
  }
  opened.exec(`PRAGMA user_version = ${layout}`);
}
export const db = opened;
db.exec(SCHEMA);

export const one = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as T | undefined;
export const all = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as T[];
export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

/**
 * Stores a coin's look-alike keys and puts it in the family of the earliest coin that shares one (its ticker or name
 * reading the same as the other's ticker or name), or starts its own.
 */
export function joinFamily(mint: string, symbol: string, name: string) {
  const t = fleetKey(symbol);
  const n = fleetKey(name);
  const keys = [t, n].filter(Boolean);
  const match = keys.length
    ? one<{ family: string }>(
        `SELECT family FROM coin WHERE mint != ? AND family != '' AND (ticker_key IN (${keys.map(() => "?").join(",")}) OR name_key IN (${keys.map(() => "?").join(",")}))
         ORDER BY created_at, rowid LIMIT 1`,
        mint,
        ...keys,
        ...keys,
      )
    : undefined;
  run("UPDATE coin SET ticker_key = ?, name_key = ?, family = ? WHERE mint = ?", t, n, match?.family ?? mint, mint);
}

let depth = 0;
/** Runs `fn` in a transaction (nested calls join the outer one). */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

export const kvGet = (k: string) => one<{ v: string }>("SELECT v FROM kv WHERE k = ?", k)?.v;
export const kvSet = (k: string, v: string | number | bigint) =>
  run("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));

export const big = (s: string | null | undefined) => BigInt(s || "0");

// ---------------------------------------------------------------- row types

export type QuoteRow = {
  mint: string;
  symbol: string;
  name: string;
  category: string;
  grp: string;
  issuer: string;
  logo: string;
  decimals: number;
  usd: number;
  price_at: number;
  liquidity: number;
  ui_scale: number;
  fee_bps: number;
  fee_max: string;
  min_raise: string;
  available: number;
  error: string | null;
  checked_at: number;
  route_error: string | null;
  route_at: number;
};

export type CoinRow = {
  mint: string;
  pool: string;
  cpmm_pool: string | null;
  fee_key: string | null;
  quote: string;
  name: string;
  symbol: string;
  image: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  uri: string;
  creator: string;
  created_at: number;
  decimals: number;
  price: number;
  ath: number;
  start_price: number;
  virtual_base: string;
  virtual_quote: string;
  curve_sell: string;
  threshold: string;
  base_sold: string;
  quote_reserve: string;
  pool_base: string;
  pool_quote: string;
  graduated: number;
  graduated_at: number | null;
  total_supply: string;
  burned: string;
  trades: number;
  volume_quote: string;
  volume_sol: number;
  last_trade_at: number;
  holders: number;
  fees_quote: string;
  fees_sol: number;
  protocol_quote: string;
  protocol_sol: number;
  income_quote: string;
  claimable_quote: string;
  harvest_quote: string;
  split_quote: string;
  pending_sol: number;
  sol_to_otc: number;
  sol_to_protection: number;
  fee_burned: string;
  otc_credit: number;
  otc_last_contribution: number;
  otc_burned: string;
  protection_paid: number;
  creator_bought: string;
  creator_sold: string;
  ticker_key: string;
  name_key: string;
  family: string;
  fleet_sent_sol: number;
  fleet_received_sol: number;
  entry_status: "pending" | "done" | "unpaid" | null;
  entry_tokens: string;
  entry_sol: number;
  entry_for: string | null;
  entry_sent: string;
  entry_recipients: number;
};

export type TradeRow = {
  id: string;
  coin: string;
  trader: string;
  is_buy: number;
  quote_amount: string;
  token_amount: string;
  tax: string;
  price: number;
  sol_value: number;
  ts: number;
  tx: string;
  kind: string;
};

export type HolderRow = {
  coin: string;
  wallet: string;
  balance: string;
  cost_basis: string;
  first_buy_at: number;
  realized: string;
  tax_paid: string;
};

export type LossRow = {
  id: string;
  coin: string;
  wallet: string;
  ts: number;
  loss_quote: string;
  loss_sol: number;
  sol_usd: number;
  hold: number;
  tax_paid_sol: number;
  processed: number;
};

export type PayoutRow = {
  id: string;
  wallet: string;
  coin: string;
  ts: number;
  loss_sol: number;
  sol_usd: number;
  hold: number;
  tier_bps: number;
  amount_sol: number;
  limit_by: string;
  tx: string | null;
  sent_at: number | null;
};

export type OtcQuoteRow = {
  id: string;
  coin: string;
  wallet: string;
  side: string;
  amount_in: string;
  amount_out: string;
  tax: string;
  sol_gross: number;
  price_sol: number;
  created_at: number;
  expires_at: number;
  last_valid_height: number;
  status: string;
  signature: string | null;
};
