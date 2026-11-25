import { COIN_DECIMALS, type LaunchCurve } from "./curve";
import { big, joinFamily, one, run, tx, type CoinRow, type HolderRow } from "./db";
import { solPerUnit, solUsd, toUnits } from "./prices";

/**
 * Bookkeeping shared by the chain indexer and the demo simulator: every swap, burn and transfer of coins goes
 * through here, so holders, cost basis, candles, realized losses and fee accounting are computed one way.
 */

/** Wallets that hold coins for the protocol and never count as holders. Filled at startup. */
export const SYSTEM = new Set<string>();

export const getCoin = (mint: string) => one<CoinRow>("SELECT * FROM coin WHERE mint = ?", mint);
export const coinByPool = (pool: string) => one<CoinRow>("SELECT * FROM coin WHERE pool = ? OR cpmm_pool = ?", pool, pool);

function holder(coin: string, wallet: string): HolderRow {
  run("INSERT INTO holder (coin, wallet) VALUES (?, ?) ON CONFLICT DO NOTHING", coin, wallet);
  return one<HolderRow>("SELECT * FROM holder WHERE coin = ? AND wallet = ?", coin, wallet)!;
}

export type LaunchInput = {
  mint: string;
  pool: string;
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
  createdAt: number;
  /** the curve it launched on, raw units (see curve.ts) */
  curve: LaunchCurve;
};

export function recordLaunch(l: LaunchInput) {
  const price = (Number(l.curve.virtualQuote) / Number(l.curve.virtualBase)) * 10 ** (COIN_DECIMALS - quoteDecimals(l.quote));
  run(
    `INSERT INTO coin (mint, pool, quote, name, symbol, image, description, website, twitter, telegram, uri, creator,
       created_at, price, ath, start_price, virtual_base, virtual_quote, curve_sell, threshold, total_supply)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mint) DO NOTHING`,
    l.mint,
    l.pool,
    l.quote,
    l.name,
    l.symbol,
    l.image,
    l.description,
    l.website,
    l.twitter,
    l.telegram,
    l.uri,
    l.creator,
    l.createdAt,
    price,
    price,
    price,
    l.curve.virtualBase.toString(),
    l.curve.virtualQuote.toString(),
    l.curve.sell.toString(),
    l.curve.raise.toString(),
    l.curve.supply.toString(),
  );
  if (getCoin(l.mint)!.family === "") joinFamily(l.mint, l.symbol, l.name);
}

export type TradeInput = {
  id: string;
  coin: string;
  trader: string;
  isBuy: boolean;
  /** gross quote: what a buyer paid in, or what a sale produced before the fee */
  quoteAmount: bigint;
  tokenAmount: bigint;
  /** the whole fee charged on this swap, in the quote */
  tax: bigint;
  /** Raydium's share of the fee */
  protocol: bigint;
  /** the platform fee, which sits in the platform's LaunchLab vault until the fee wallet claims it: the exact amount */
  claimable: bigint;
  /** after graduation: an estimate of the quote the fee wallet will harvest from the pool for this swap */
  harvestable: bigint;
  /** quote per coin after the swap, in whole units */
  price: number;
  /** a curve swap: where the curve stands after it */
  curve?: { sold: bigint; raised: bigint; complete: boolean };
  /** a CPMM swap: the pool's reserves after it */
  pool?: { base: bigint; quote: bigint };
  ts: number;
  tx: string;
  kind: "trade" | "otc";
};

export function recordTrade(t: TradeInput) {
  return tx(() => {
    if (one("SELECT 1 FROM trade WHERE id = ?", t.id)) return false;
    const c = getCoin(t.coin);
    if (!c) return false;
    const qDec = quoteDecimals(c.quote);
    const solPer = solPerUnit(c.quote);
    const solValue = toUnits(t.quoteAmount, qDec) * solPer;

    run(
      `INSERT INTO trade (id, coin, trader, is_buy, quote_amount, token_amount, tax, price, sol_value, ts, tx, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      c.mint,
      t.trader,
      t.isBuy ? 1 : 0,
      t.quoteAmount.toString(),
      t.tokenAmount.toString(),
      t.tax.toString(),
      t.price,
      solValue,
      t.ts,
      t.tx,
      t.kind,
    );

    const minute = Math.floor(t.ts / 60) * 60;
    const vol = toUnits(t.quoteAmount, qDec);
    run(
      `INSERT INTO candle (coin, t, o, h, l, c, v) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(coin, t) DO UPDATE SET h = MAX(h, excluded.c), l = MIN(l, excluded.c), c = excluded.c, v = v + excluded.v`,
      c.mint,
      minute,
      c.price,
      Math.max(c.price, t.price),
      Math.min(c.price, t.price),
      t.price,
      vol,
    );

    const isCreator = t.trader === c.creator;
    const graduated = c.graduated === 1 || !!t.curve?.complete;
    run(
      `UPDATE coin SET price = ?, ath = MAX(ath, ?), base_sold = ?, quote_reserve = ?, pool_base = ?, pool_quote = ?,
         trades = trades + ?, volume_quote = ?, volume_sol = volume_sol + ?, last_trade_at = ?, fees_quote = ?,
         fees_sol = fees_sol + ?, protocol_quote = ?, protocol_sol = protocol_sol + ?, income_quote = ?, claimable_quote = ?,
         harvest_quote = ?, creator_bought = ?, creator_sold = ?, graduated = ?, graduated_at = COALESCE(graduated_at, ?)
       WHERE mint = ?`,
      t.price,
      t.price,
      (t.curve?.sold ?? big(c.base_sold)).toString(),
      (t.curve?.raised ?? big(c.quote_reserve)).toString(),
      (t.pool?.base ?? big(c.pool_base)).toString(),
      (t.pool?.quote ?? big(c.pool_quote)).toString(),
      t.kind === "trade" ? 1 : 0,
      (big(c.volume_quote) + t.quoteAmount).toString(),
      solValue,
      t.kind === "trade" ? t.ts : c.last_trade_at,
      (big(c.fees_quote) + t.tax).toString(),
      toUnits(t.tax, qDec) * solPer,
      (big(c.protocol_quote) + t.protocol).toString(),
      toUnits(t.protocol, qDec) * solPer,
      (big(c.income_quote) + t.claimable).toString(),
      (big(c.claimable_quote) + t.claimable).toString(),
      (big(c.harvest_quote) + t.harvestable).toString(),
      (big(c.creator_bought) + (isCreator && t.isBuy ? t.tokenAmount : 0n)).toString(),
      (big(c.creator_sold) + (isCreator && !t.isBuy ? t.tokenAmount : 0n)).toString(),
      graduated ? 1 : 0,
      graduated ? t.ts : null,
      c.mint,
    );

    if (SYSTEM.has(t.trader)) return true;

    const h = holder(c.mint, t.trader);
    const bal = big(h.balance);
    const basis = big(h.cost_basis);
    if (t.isBuy) {
      setHolder(c, h, {
        balance: bal + t.tokenAmount,
        cost_basis: basis + t.quoteAmount,
        tax_paid: big(h.tax_paid) + t.tax,
        first_buy_at: bal === 0n || h.first_buy_at === 0 ? t.ts : h.first_buy_at,
      });
      return true;
    }

    const sold = t.tokenAmount < bal ? t.tokenAmount : bal;
    const basisRemoved = bal > 0n ? (basis * sold) / bal : 0n;
    const proceeds = t.quoteAmount - t.tax;
    const taxPaid = big(h.tax_paid) + t.tax;
    const left = bal > t.tokenAmount ? bal - t.tokenAmount : 0n;
    setHolder(c, h, {
      balance: left,
      cost_basis: left === 0n ? 0n : basis - basisRemoved,
      realized: big(h.realized) + proceeds - basisRemoved,
      tax_paid: taxPaid,
      first_buy_at: left === 0n ? 0 : h.first_buy_at,
    });
    if (basisRemoved > proceeds) {
      const lossQuote = basisRemoved - proceeds;
      run(
        "INSERT INTO loss (id, coin, wallet, ts, loss_quote, loss_sol, sol_usd, hold, tax_paid_sol) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        t.id,
        c.mint,
        t.trader,
        t.ts,
        lossQuote.toString(),
        toUnits(lossQuote, qDec) * solPer,
        solUsd(),
        h.first_buy_at > 0 ? t.ts - h.first_buy_at : 0,
        toUnits(taxPaid, qDec) * solPer,
      );
    }
    return true;
  });
}

type HolderPatch = Partial<{ balance: bigint; cost_basis: bigint; realized: bigint; tax_paid: bigint; first_buy_at: number }>;

function setHolder(c: CoinRow, h: HolderRow, p: HolderPatch) {
  const before = big(h.balance);
  const next = { ...h, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) };
  run(
    "UPDATE holder SET balance = ?, cost_basis = ?, realized = ?, tax_paid = ?, first_buy_at = ? WHERE coin = ? AND wallet = ?",
    next.balance,
    next.cost_basis,
    next.realized,
    next.tax_paid,
    next.first_buy_at,
    h.coin,
    h.wallet,
  );
  const after = big(next.balance);
  if (SYSTEM.has(h.wallet)) return;
  if (before === 0n && after > 0n) run("UPDATE coin SET holders = holders + 1 WHERE mint = ?", c.mint);
  if (before > 0n && after === 0n) run("UPDATE coin SET holders = MAX(0, holders - 1) WHERE mint = ?", c.mint);
}

/**
 * A balance change no trade explains (wallet-to-wallet transfer). Tokens received this way carry zero cost basis,
 * so moving coins to a fresh wallet can't fake a high entry; tokens sent away take their share of basis with them.
 */
export function recordTransfer(coinMint: string, wallet: string, delta: bigint) {
  tx(() => {
    const c = getCoin(coinMint);
    if (!c || delta === 0n || SYSTEM.has(wallet)) return;
    const h = holder(c.mint, wallet);
    const bal = big(h.balance);
    if (delta > 0n) return setHolder(c, h, { balance: bal + delta });
    const out = -delta < bal ? -delta : bal;
    const left = bal - out;
    setHolder(c, h, {
      balance: left,
      cost_basis: left === 0n ? 0n : big(h.cost_basis) - (big(h.cost_basis) * out) / (bal || 1n),
      first_buy_at: left === 0n ? 0 : h.first_buy_at,
    });
  });
}

/** Burned supply: coins sold to the OTC reserve, pool fees that came back in the coin, or an entry nobody could get. */
export function recordBurn(coinMint: string, amount: bigint, source: "otc" | "fees" | "entry") {
  const c = getCoin(coinMint);
  if (!c) return;
  run(
    "UPDATE coin SET total_supply = ?, burned = ?, otc_burned = ?, fee_burned = ? WHERE mint = ?",
    (big(c.total_supply) - amount).toString(),
    (big(c.burned) + amount).toString(),
    (big(c.otc_burned) + (source === "otc" ? amount : 0n)).toString(),
    (big(c.fee_burned) + (source === "fees" ? amount : 0n)).toString(),
    coinMint,
  );
}

/** Audit log of treasury movements. */
export function ledger(e: { coin?: string | null; kind: string; mint: string; amount: bigint; sol?: number; tx?: string; note?: string }) {
  run(
    "INSERT INTO ledger (ts, coin, kind, mint, amount, sol, tx, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    Math.floor(Date.now() / 1000),
    e.coin ?? null,
    e.kind,
    e.mint,
    e.amount.toString(),
    e.sol ?? 0,
    e.tx ?? null,
    e.note ?? null,
  );
}

const decimalsCache = new Map<string, number>();
export function quoteDecimals(mint: string) {
  let d = decimalsCache.get(mint);
  if (d === undefined) {
    d = one<{ decimals: number }>("SELECT decimals FROM quote WHERE mint = ?", mint)?.decimals ?? 9;
    decimalsCache.set(mint, d);
  }
  return d;
}
