import type { SQLInputValue } from "node:sqlite";
import {
  AIRDROP_MIN_USD,
  PROTECTION_PAYOUT_BPS,
  coverageBpsForHold,
  otcActivityBps,
  otcPolicy,
  otcSellLimitSol,
  type Coin,
  type CoinProtection,
  type CoinSort,
  type CoveredLoss,
  type Holder,
  type OtcCoin,
} from "@cook/shared";
import { all, big, claimByCoin, one, type ClaimRow, type CoinRow, type HolderRow, type LossRow, type PayoutRow, type QuoteRow } from "./db";
import { SYSTEM, quoteDecimals } from "./ledger";
import { solPerUnit, solUsd, toQuoteAsset, toUnits } from "./prices";

export const now = () => Math.floor(Date.now() / 1000);

/** Treasury wallet balances (SOL), refreshed in the background so the API never waits on RPC. */
export const treasury = { otcSol: 0, protectionSol: 0, feesSol: 0, airdropSol: 0 };

export function quotesMap() {
  return new Map(all<QuoteRow>("SELECT * FROM quote").map((q) => [q.mint, q]));
}

type CandleRow = { coin: string; t: number; o: number; h: number; l: number; c: number; v: number };

export function shapeCoin(c: CoinRow, q: QuoteRow, candles24h: CandleRow[], trades24h = 0): Coin {
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
  return {
    address: c.mint,
    pool: c.pool,
    dammPool: c.damm_pool,
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
    isMain: c.is_main === 1,
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
    quoteInPool: inPool,
    graduationThreshold: threshold,
    graduationProgress: c.graduated ? 1 : threshold > 0 ? Math.min(1, inPool / threshold) : 0,
    graduated: c.graduated === 1,
    holders: c.holders,
    burned: c.burned,
    spark,
  };
}

export function allCoins(): Coin[] {
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
    .filter((c) => quotes.has(c.quote))
    .map((c) => shapeCoin(c, quotes.get(c.quote)!, byCoin.get(c.mint) ?? [], counts.get(c.mint) ?? 0));
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
    default:
      return list.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
  }
}

/** Rug heuristic: the creator sold at least half of what they bought and price is 70%+ below its high. */
export const isRugged = (c: CoinRow) =>
  big(c.creator_bought) > 0n && big(c.creator_sold) * 2n >= big(c.creator_bought) && c.price <= c.ath * 0.3;

// ---------------------------------------------------------------- holders and airdrops

export function holdersOf(mint: string): Holder[] {
  const c = one<CoinRow>("SELECT * FROM coin WHERE mint = ?", mint);
  if (!c) return [];
  const qDec = quoteDecimals(c.quote);
  const usdPerQuote = solPerUnit(c.quote) * solUsd();
  const minQuote = usdPerQuote > 0 ? AIRDROP_MIN_USD / usdPerQuote : Infinity;
  const supply = toUnits(c.total_supply, c.decimals);
  const rows = all<HolderRow>("SELECT * FROM holder WHERE coin = ? AND balance != '0'", mint);
  const out = rows
    .filter((h) => !SYSTEM.has(h.wallet))
    .map((h) => {
      const bal = toUnits(h.balance, c.decimals);
      const basis = toUnits(h.cost_basis, qDec);
      const value = bal * c.price;
      const avgEntry = bal > 0 ? basis / bal : 0;
      const eligible = avgEntry > c.price && value >= minQuote && h.wallet !== c.creator;
      return {
        address: h.wallet,
        balance: h.balance,
        share: supply > 0 ? bal / supply : 0,
        avgEntry,
        costBasis: h.cost_basis,
        unrealized: value - basis,
        airdropEligible: eligible,
        airdropWeight: eligible ? basis - value : 0,
      };
    })
    .sort((a, b) => (big(b.balance) > big(a.balance) ? 1 : -1));
  const total = out.reduce((s, h) => s + h.airdropWeight, 0);
  for (const h of out) h.airdropWeight = total > 0 ? h.airdropWeight / total : 0;
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

/** A wallet's covered losses, the ones still waiting, and anything it claimed back when protection paid in rounds. */
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
  for (const c of all<ClaimRow>("SELECT * FROM protection_claim WHERE wallet = ? AND status = 'claimed'", wallet)) {
    const items = JSON.parse(c.breakdown) as { coin: string; symbol: string; lossSol: number; coverageBps: number; holdSeconds: number }[];
    const amounts = new Map(claimByCoin(c.amount, c.breakdown));
    for (const b of items)
      losses.push({
        id: `claim:${c.id}:${b.coin}`,
        wallet,
        coin: b.coin,
        symbol: b.symbol,
        t: c.claimed_at ?? 0,
        lossSol: b.lossSol,
        holdSeconds: b.holdSeconds,
        tierBps: b.coverageBps,
        amountSol: amounts.get(b.coin) ?? 0,
        limit: "round",
        status: "sent",
        tx: c.signature,
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
  let price = before?.price ?? c.sqrt_start * c.sqrt_start;
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
  const spot = c.price * solPer;
  const avg = twap(c, otcPolicy.twapSeconds, at);
  const spread = otcPolicy.spreadBps / 10_000;
  const outstanding =
    one<{ s: number }>("SELECT COALESCE(SUM(sol_gross), 0) AS s FROM otc_quote WHERE coin = ? AND side = 'sell' AND status = 'issued'", c.mint)
      ?.s ?? 0;
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
    sellPriceSol: avg === null ? 0 : Math.min(spot, avg * solPer) * (1 - spread),
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

export const walletDailyCapSol = () => (treasury.otcSol * otcPolicy.walletDailyBps) / 10_000;
