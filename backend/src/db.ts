import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { config } from "./config";

/**
 * One SQLite file holds everything the API serves: coins, trades, holders, fee buckets, OTC and protection state.
 * Real mode fills it from the chain; demo mode fills it from the simulator. Raw token amounts are TEXT (bigint).
 */
const file = process.env.DB_FILE ?? path.join(config.dataDir, config.demo ? "demo.db" : `${config.cluster}.db`);
export const db = new DatabaseSync(file);
// WAL + a busy timeout: during a zero-downtime update two servers share this file for a few seconds
db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;");

db.exec(`
CREATE TABLE IF NOT EXISTS quote (
  mint TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, logo TEXT NOT NULL,
  decimals INTEGER NOT NULL, usd REAL NOT NULL, price_at INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1, error TEXT
);
-- one DBC config per quote per price band; the newest active one is used for new launches
CREATE TABLE IF NOT EXISTS config (
  address TEXT PRIMARY KEY, quote TEXT NOT NULL, quote_usd REAL NOT NULL, threshold TEXT NOT NULL,
  created_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS coin (
  mint TEXT PRIMARY KEY, pool TEXT NOT NULL, damm_pool TEXT, config TEXT NOT NULL, quote TEXT NOT NULL,
  name TEXT NOT NULL, symbol TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '', twitter TEXT NOT NULL DEFAULT '', telegram TEXT NOT NULL DEFAULT '', uri TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL, created_at INTEGER NOT NULL, is_main INTEGER NOT NULL DEFAULT 0, decimals INTEGER NOT NULL DEFAULT 6,
  -- market
  price REAL NOT NULL, ath REAL NOT NULL, sqrt_price REAL NOT NULL, liquidity REAL NOT NULL, sqrt_start REAL NOT NULL, sqrt_mig REAL NOT NULL,
  quote_reserve TEXT NOT NULL DEFAULT '0', threshold TEXT NOT NULL, graduated INTEGER NOT NULL DEFAULT 0, graduated_at INTEGER,
  total_supply TEXT NOT NULL, burned TEXT NOT NULL DEFAULT '0',
  -- activity
  trades INTEGER NOT NULL DEFAULT 0, volume_quote TEXT NOT NULL DEFAULT '0', volume_sol REAL NOT NULL DEFAULT 0,
  last_trade_at INTEGER NOT NULL DEFAULT 0, holders INTEGER NOT NULL DEFAULT 0,
  -- fees: tax = meteora + income; income is ours (partner fee + referral rebate)
  fees_quote TEXT NOT NULL DEFAULT '0', fees_sol REAL NOT NULL DEFAULT 0, meteora_quote TEXT NOT NULL DEFAULT '0',
  meteora_sol REAL NOT NULL DEFAULT 0, income_quote TEXT NOT NULL DEFAULT '0', claimable_quote TEXT NOT NULL DEFAULT '0',
  split_quote TEXT NOT NULL DEFAULT '0', pending_sol REAL NOT NULL DEFAULT 0,
  -- where the fees went
  coin_burned TEXT NOT NULL DEFAULT '0', burned_value_sol REAL NOT NULL DEFAULT 0, sol_to_otc REAL NOT NULL DEFAULT 0,
  sol_to_protection REAL NOT NULL DEFAULT 0, sol_to_main REAL NOT NULL DEFAULT 0, airdrop_quote TEXT NOT NULL DEFAULT '0',
  airdrop_balance TEXT NOT NULL DEFAULT '0', airdrops_paid TEXT NOT NULL DEFAULT '0', airdropped_sol REAL NOT NULL DEFAULT 0,
  airdrop_last_epoch INTEGER NOT NULL DEFAULT 0, airdrop_last_recipients INTEGER NOT NULL DEFAULT 0,
  -- OTC reserve accounting (SOL)
  otc_credit REAL NOT NULL DEFAULT 0, otc_last_contribution INTEGER NOT NULL DEFAULT 0, otc_inventory TEXT NOT NULL DEFAULT '0',
  -- rug heuristic
  creator_bought TEXT NOT NULL DEFAULT '0', creator_sold TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS coin_quote ON coin(quote);
CREATE INDEX IF NOT EXISTS coin_pool ON coin(pool);
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
  airdrops TEXT NOT NULL DEFAULT '0', PRIMARY KEY (coin, wallet)
);
CREATE INDEX IF NOT EXISTS holder_wallet ON holder(wallet);
CREATE TABLE IF NOT EXISTS loss (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, wallet TEXT NOT NULL, ts INTEGER NOT NULL, loss_quote TEXT NOT NULL,
  loss_sol REAL NOT NULL, hold INTEGER NOT NULL, tax_paid_sol REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS loss_ts ON loss(ts);
CREATE TABLE IF NOT EXISTS airdrop (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, epoch INTEGER NOT NULL, recipient TEXT NOT NULL, amount TEXT NOT NULL,
  ts INTEGER NOT NULL, tx TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS airdrop_recipient ON airdrop(recipient);
-- airdrop money allocated to a holder but not sent yet (sent once it is worth AIRDROP_MIN_PAYOUT_USD)
CREATE TABLE IF NOT EXISTS airdrop_owed (coin TEXT NOT NULL, wallet TEXT NOT NULL, amount TEXT NOT NULL, PRIMARY KEY (coin, wallet));
CREATE TABLE IF NOT EXISTS otc_quote (
  id TEXT PRIMARY KEY, coin TEXT NOT NULL, wallet TEXT NOT NULL, side TEXT NOT NULL, amount_in TEXT NOT NULL,
  amount_out TEXT NOT NULL, tax TEXT NOT NULL, sol_gross REAL NOT NULL, price_sol REAL NOT NULL, created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, last_valid_height INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, signature TEXT
);
CREATE INDEX IF NOT EXISTS otc_quote_status ON otc_quote(status);
CREATE TABLE IF NOT EXISTS protection_epoch (
  id INTEGER PRIMARY KEY, total TEXT NOT NULL, claimed TEXT NOT NULL DEFAULT '0', published_at INTEGER NOT NULL,
  window_from INTEGER NOT NULL, window_to INTEGER NOT NULL, coins TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS protection_claim (
  id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, wallet TEXT NOT NULL, amount TEXT NOT NULL, breakdown TEXT NOT NULL,
  status TEXT NOT NULL, signature TEXT, last_valid_height INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS claim_wallet ON protection_claim(wallet);
-- every movement of treasury funds, for audit
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, coin TEXT, kind TEXT NOT NULL, mint TEXT NOT NULL,
  amount TEXT NOT NULL, sol REAL NOT NULL DEFAULT 0, tx TEXT, note TEXT
);
-- demo mode: simulated balances (mint 'SOL' = lamports)
CREATE TABLE IF NOT EXISTS balance (wallet TEXT NOT NULL, mint TEXT NOT NULL, amount TEXT NOT NULL, PRIMARY KEY (wallet, mint));
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

export const one = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as T | undefined;
export const all = <T>(sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as T[];
export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

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
  logo: string;
  decimals: number;
  usd: number;
  price_at: number;
  available: number;
  error: string | null;
};

export type CoinRow = {
  mint: string;
  pool: string;
  damm_pool: string | null;
  config: string;
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
  is_main: number;
  decimals: number;
  price: number;
  ath: number;
  sqrt_price: number;
  liquidity: number;
  sqrt_start: number;
  sqrt_mig: number;
  quote_reserve: string;
  threshold: string;
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
  meteora_quote: string;
  meteora_sol: number;
  income_quote: string;
  claimable_quote: string;
  split_quote: string;
  pending_sol: number;
  coin_burned: string;
  burned_value_sol: number;
  sol_to_otc: number;
  sol_to_protection: number;
  sol_to_main: number;
  airdrop_quote: string;
  airdrop_balance: string;
  airdrops_paid: string;
  airdropped_sol: number;
  airdrop_last_epoch: number;
  airdrop_last_recipients: number;
  otc_credit: number;
  otc_last_contribution: number;
  otc_inventory: string;
  creator_bought: string;
  creator_sold: string;
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
  airdrops: string;
};

export type LossRow = {
  id: string;
  coin: string;
  wallet: string;
  ts: number;
  loss_quote: string;
  loss_sol: number;
  hold: number;
  tax_paid_sol: number;
};

export type ClaimRow = {
  id: string;
  epoch: number;
  wallet: string;
  amount: string;
  breakdown: string;
  status: string;
  signature: string | null;
  last_valid_height: number;
  expires_at: number;
  claimed_at: number | null;
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
