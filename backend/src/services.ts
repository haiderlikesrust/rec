import type { SQLInputValue } from "node:sqlite";
import {
  PROTECTION_PAYOUT_BPS,
  coverageBpsForHold,
  otcActivityBps,
  otcPolicy,
  otcSellLimitSol,
  otcUsableSol,
  type FleetTag,
  type Coin,
  type CoinProtection,
  type CoinSort,
  type CoveredLoss,
  type Holder,
  type OtcCoin,
  type Payout,
} from "@gantry/shared";
import { config } from "./config";
import { all, big, one, type CoinRow, type HolderRow, type LossRow, type PayoutRow, type QuoteRow } from "./db";
import { SYSTEM, quoteDecimals } from "./ledger";
import { quoteRow, solPerUnit, toQuoteAsset, toUnits } from "./prices";

export const now = () => Math.floor(Date.now() / 1000);

/** Treasury wallet balances (SOL), refreshed in the background so the API never waits on RPC. */
export const treasury = { otcSol: 0, protectionSol: 0, feesSol: 0 };

export function quotesMap() {
  return new Map(all<QuoteRow>("SELECT * FROM quote").map((q) => [q.mint, q]));
}

type CandleRow = { coin: string; t: number; o: number; h: number; l: number; c: number; v: number };

export function shapeCoin(c: CoinRow, q: QuoteRow, candles24h: CandleRow[], trades24h = 0, fleet: FleetTag | null = null): Coin {
  const qa = toQuoteAsset(q);
  const supply = toUnits(c.total_supply, c.decimals);
  const t0 = now() - 86_400;
  const first = candles24h[0];
  const change24h = first && first.o > 0 ? ((c.price - first.o) / first.o) * 100 : 0;
  const volumeQuote = candles24h.reduce((s, k) => s + k.v, 0);

  // 24 hourly closes, forward-filled
  const spark: number[] = [];
  let last = first ? first.o : c.price;
  let i = 0;
  for (let h = 0; h < 24; h++) {
    const end = t0 + (h + 1) * 3600;
    while (i < candles24h.length && candles24h[i]!.t < end) last = candles24h[i++]!.c;
    spark.push(last);
  }
  spark[spark.length - 1] = c.price;

  const threshold = toUnits(c.threshold, q.decimals);
  const inPool = toUnits(c.quote_reserve, q.decimals);
  const usd = q.usd;
  const feesQuote = toUnits(c.fees_quote, q.decimals);
  const potSol = coinPotSol(c);
  return {
    address: c.mint,
    pool: c.pool,
    cpmmPool: c.cpmm_pool,
    name: c.name,
    symbol: c.symbol,
    image: c.image,
    description: c.description,
    website: c.website,
    twitter: c.twitter,
    telegram: c.telegram,
    creator: c.creator,
    createdAt: c.created_at,
    quote: qa,
    isMain: c.mint === config.mainToken,
    decimals: c.decimals,
    price: c.price,
    priceSol: c.price * qa.solPerUnit,
    priceUsd: c.price * usd,
    marketCap: c.price * supply,
    marketCapSol: c.price * supply * qa.solPerUnit,
    marketCapUsd: c.price * supply * usd,
    change24h,
    volume24hSol: volumeQuote * qa.solPerUnit,
    volume24hUsd: volumeQuote * usd,
    trades24h,
    lastTradeAt: c.last_trade_at,
    feesSol: feesQuote * qa.solPerUnit,
    feesUsd: feesQuote * usd,
    feesQuote: c.fees_quote,
    protectionPotSol: potSol,
    // the pot is SOL in the protection wallet: valued at SOL's price, not the coin's quote's
    protectionPotUsd: qa.solPerUnit > 0 ? (potSol * usd) / qa.solPerUnit : 0,
    quoteInPool: inPool,
    graduationThreshold: threshold,
    graduationProgress: c.graduated ? 1 : threshold > 0 ? Math.min(1, inPool / threshold) : 0,
    graduated: c.graduated === 1,
    holders: c.holders,
    burned: c.burned,
    spark,
    fleet,
  };
}

/**
 * Every coin, with its Fleet tag from `tags`. Copies that skipped their Fleet entry are left out unless
 * `listedOnly` is false.
 */
export function allCoins(tags: Map<string, FleetTag> = new Map(), listedOnly = true): Coin[] {
  const since = now() - 86_400;
  const rows = all<CoinRow>("SELECT * FROM coin");
  const quotes = quotesMap();
  const candles = all<CandleRow>("SELECT * FROM candle WHERE t >= ? ORDER BY t", since);
  const byCoin = new Map<string, CandleRow[]>();
  for (const k of candles) {
    const list = byCoin.get(k.coin) ?? [];
    list.push(k);
    byCoin.set(k.coin, list);
  }
  const counts = new Map(
    all<{ coin: string; n: number }>("SELECT coin, COUNT(*) AS n FROM trade WHERE ts >= ? AND kind = 'trade' GROUP BY coin", since).map(
      (r) => [r.coin, r.n],
    ),
  );
  return rows
    .filter((c) => quotes.has(c.quote) && (!listedOnly || c.entry_status !== "unpaid"))
    .map((c) => shapeCoin(c, quotes.get(c.quote)!, byCoin.get(c.mint) ?? [], counts.get(c.mint) ?? 0, tags.get(c.mint) ?? null));
}

export function coinCandles24h(mint: string) {
  return all<CandleRow>("SELECT * FROM candle WHERE coin = ? AND t >= ? ORDER BY t", mint, now() - 86_400);
}

export function sortCoins(list: Coin[], sort: CoinSort) {
  switch (sort) {
    case "new":
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case "active":
      return list.filter((c) => c.lastTradeAt > 0).sort((a, b) => b.lastTradeAt - a.lastTradeAt);
    case "near":
      return list.filter((c) => !c.graduated).sort((a, b) => b.graduationProgress - a.graduationProgress);
    case "graduated":
      return list.filter((c) => c.graduated).sort((a, b) => b.marketCapUsd - a.marketCapUsd);
    case "protected":
      // the most cover first; a coin with nothing left in its pot covers nothing and isn't on this list
      return list.filter((c) => c.protectionPotSol > 0).sort((a, b) => b.protectionPotSol - a.protectionPotSol || b.marketCapUsd - a.marketCapUsd);
    default:
      return list.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  }
}

/** Rug heuristic: the creator sold at least half of what they bought and price is 70%+ below its high. */
export const isRugged = (c: CoinRow) =>
  big(c.creator_bought) > 0n && big(c.creator_sold) * 2n >= big(c.creator_bought) && c.price <= c.ath * 0.3;

// ---------------------------------------------------------------- holders

export function holdersOf(mint: string): Holder[] {
  const c = one<CoinRow>("SELECT * FROM coin WHERE mint = ?", mint);
  if (!c) return [];
  const qDec = quoteDecimals(c.quote);
  const supply = toUnits(c.total_supply, c.decimals);
  const rows = all<HolderRow>("SELECT * FROM holder WHERE coin = ? AND balance != '0'", mint);
  const out = rows
    .filter((h) => !SYSTEM.has(h.wallet))
    .map((h) => {
      const bal = toUnits(h.balance, c.decimals);
      const basis = toUnits(h.cost_basis, qDec);
      const value = bal * c.price;
      const avgEntry = bal > 0 ? basis / bal : 0;
      return {
        address: h.wallet,
        balance: h.balance,
        share: supply > 0 ? bal / supply : 0,
        avgEntry,
        costBasis: h.cost_basis,
        unrealized: value - basis,
      };
    })
    .sort((a, b) => (big(b.balance) > big(a.balance) ? 1 : -1));
  return out;
}

// ---------------------------------------------------------------- protection

/** SOL covered but not sent yet: owed, or in a transfer being sent. */
export const owedProtectionSol = () =>
  one<{ s: number }>("SELECT COALESCE(SUM(amount_sol), 0) AS s FROM protection_payout WHERE (tx IS NULL OR tx LIKE 'sending:%') AND amount_sol > 0")!.s;

/** What a coin has left for its sellers: what its fees put into the fund, minus what it has paid out. */
export const coinPotSol = (c: CoinRow) => Math.max(0, c.sol_to_protection - c.protection_paid);

export function coinProtection(c: CoinRow): CoinProtection {
  const potSol = coinPotSol(c);
  return {
    coin: c.mint,
    symbol: c.symbol,
    image: c.image,
    contributedSol: c.sol_to_protection,
    paidSol: c.protection_paid,
    potSol,
    maxPayoutSol: (potSol * PROTECTION_PAYOUT_BPS) / 10_000,
  };
}

const payoutStatus = (tx: string | null): CoveredLoss["status"] => (tx === null ? "owed" : tx.startsWith("sending:") ? "sending" : "sent");

/** Covered losses, newest first. `where` filters protection_payout (aliased p). */
export function coveredLosses(where: string, params: SQLInputValue[], limit = 50): CoveredLoss[] {
  return all<PayoutRow & { symbol: string | null }>(
    `SELECT p.*, c.symbol FROM protection_payout p LEFT JOIN coin c ON c.mint = p.coin WHERE ${where} ORDER BY p.ts DESC, p.rowid DESC LIMIT ?`,
    ...params,
    limit,
  ).map((p) => ({
    id: p.id,
    wallet: p.wallet,
    coin: p.coin,
    symbol: p.symbol ?? "?",
    t: p.ts,
    lossSol: p.loss_sol,
    holdSeconds: p.hold,
    tierBps: p.tier_bps,
    amountSol: p.amount_sol,
    limit: p.limit_by as CoveredLoss["limit"],
    status: payoutStatus(p.tx),
    tx: p.tx?.startsWith("sending:") ? null : p.tx,
  }));
}

/** One loss cover that paid something, by its id (the id of the sale that realized the loss). */
export function payoutById(id: string): Payout | null {
  const p = one<PayoutRow>("SELECT * FROM protection_payout WHERE id = ? AND amount_sol > 0", id);
  if (!p) return null;
  const c = one<CoinRow>("SELECT * FROM coin WHERE mint = ?", p.coin);
  const status = payoutStatus(p.tx);
  return {
    id: p.id,
    coin: { address: p.coin, symbol: c?.symbol ?? "?", name: c?.name ?? "", image: c?.image ?? "" },
    wallet: p.wallet,
    t: p.ts,
    lossSol: p.loss_sol,
    lossUsd: p.loss_sol * p.sol_usd,
    payoutSol: p.amount_sol,
    payoutUsd: p.amount_sol * p.sol_usd,
    coverageBps: p.loss_sol > 0 ? Math.round((p.amount_sol / p.loss_sol) * 10_000) : 0,
    tierBps: p.tier_bps,
    limit: p.limit_by as Payout["limit"],
    holdSeconds: p.hold,
    status: status as Payout["status"],
    tx: status === "sent" ? p.tx : null,
    paidAt: status === "sent" ? p.sent_at : null,
  };
}

/** A wallet's covered losses and the ones still waiting. */
export function walletProtection(wallet: string) {
  const losses = coveredLosses("p.wallet = ?", [wallet], 200);
  for (const l of all<LossRow>("SELECT * FROM loss WHERE wallet = ? AND processed = 0", wallet)) {
    const c = one<CoinRow>("SELECT * FROM coin WHERE mint = ?", l.coin);
    if (!c || c.creator === wallet) continue;
    losses.push({
      id: l.id,
      wallet,
      coin: l.coin,
      symbol: c.symbol,
      t: l.ts,
      lossSol: l.loss_sol,
      holdSeconds: l.hold,
      tierBps: coverageBpsForHold(l.hold, isRugged(c)),
      amountSol: 0,
      limit: "rate",
      status: "waiting",
      tx: null,
    });
  }
  losses.sort((a, b) => b.t - a.t);
  const sum = (s: CoveredLoss["status"][]) => losses.filter((l) => s.includes(l.status)).reduce((t, l) => t + l.amountSol, 0);
  return { receivedSol: sum(["sent"]), owedSol: sum(["owed", "sending"]), losses };
}

// ---------------------------------------------------------------- OTC

/** Time-weighted average price (quote per coin) over the last `seconds`, or null without enough history. */
export function twap(c: CoinRow, seconds: number, at = now()): number | null {
  if (c.created_at > at - seconds) return null;
  const from = at - seconds;
  const before = one<{ price: number }>(
    "SELECT price FROM trade WHERE coin = ? AND ts < ? ORDER BY ts DESC, rowid DESC LIMIT 1",
    c.mint,
    from,
  );
  const rows = all<{ price: number; ts: number }>("SELECT price, ts FROM trade WHERE coin = ? AND ts >= ? ORDER BY ts, rowid", c.mint, from);
  let price = before?.price ?? c.start_price;
  let t = from;
  let acc = 0;
  for (const r of rows) {
    acc += price * (r.ts - t);
    price = r.price;
    t = r.ts;
  }
  acc += price * (at - t);
  return acc / seconds;
}

export function otcCoin(c: CoinRow, at = now()): OtcCoin {
  const solPer = solPerUnit(c.quote);
  const activityBps = otcActivityBps(c.otc_last_contribution, at);
  const avg = twap(c, otcPolicy.twapSeconds, at);
  // what a seller gets per coin, in the coin's quote: the lower of spot and the TWAP, plus the premium
  const bid = avg === null ? 0 : Math.min(c.price, avg) * (1 + otcPolicy.premiumBps / 10_000);
  const outstanding =
    (otcPolicy.limited
      ? one<{ s: number }>("SELECT COALESCE(SUM(sol_gross), 0) AS s FROM otc_quote WHERE coin = ? AND side = 'sell' AND status = 'issued'", c.mint)
      : // one reserve for every coin: what it has promised any of them is spoken for
        one<{ s: number }>("SELECT COALESCE(SUM(sol_gross), 0) AS s FROM otc_quote WHERE side = 'sell' AND status = 'issued'"))?.s ?? 0;
  return {
    coin: c.mint,
    symbol: c.symbol,
    name: c.name,
    image: c.image,
    contributedSol: c.sol_to_otc,
    creditSol: c.otc_credit,
    activityBps,
    sellLimitSol: Math.max(0, otcSellLimitSol(c.otc_credit, activityBps, treasury.otcSol) - outstanding),
    burned: c.otc_burned,
    lastContribution: c.otc_last_contribution,
    sellPriceSol: bid * solPer,
    sellPrice: bid,
    sellPriceUsd: bid * (quoteRow(c.quote)?.usd ?? 0),
    twapReady: avg !== null,
  };
}

/** SOL a wallet has sold to the reserve for a coin today (UTC), including quotes still outstanding. */
export function walletSoldToday(coin: string, wallet: string, at = now()) {
  const day = at - (at % 86_400);
  return (
    one<{ s: number }>(
      "SELECT COALESCE(SUM(sol_gross), 0) AS s FROM otc_quote WHERE coin = ? AND wallet = ? AND side = 'sell' AND status IN ('issued', 'done') AND created_at >= ?",
      coin,
      wallet,
      day,
    )?.s ?? 0
  );
}

export const walletDailyCapSol = () => (otcPolicy.limited ? (treasury.otcSol * otcPolicy.walletDailyBps) / 10_000 : otcUsableSol(treasury.otcSol));

/** SOL a wallet may still sell the reserve for a coin today. */
export const walletRemainingSol = (coin: string, wallet: string, at = now()) =>
  otcPolicy.limited ? Math.max(0, walletDailyCapSol() - walletSoldToday(coin, wallet, at)) : walletDailyCapSol();
