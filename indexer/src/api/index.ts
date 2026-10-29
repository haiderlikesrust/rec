import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db, publicClients } from "ponder:api";
import schema from "ponder:schema";
import { and, asc, desc, eq, gt, gte, lt, or } from "ponder";
import type { Address } from "viem";
import {
  coinAllocationEth,
  coverageBpsForHold,
  planProtectionEpoch,
  type CoinProtection,
  type ProtectionLoss,
  feeRouterAbi,
  otcReserveAbi,
  protectionFundAbi,
  type Candle,
  type Coin,
  type CoinDetail,
  type CoinSort,
  type Holder,
  type PlatformStats,
  type Position,
  type ProtectionClaim,
  type ProtectionStatus,
  type QuoteAsset,
  type Trade,
  type WalletSummary,
  type ActivityItem,
} from "@cook/shared";

import { FEE_ROUTER, OTC_RESERVE, PROTECTION_FUND, SYSTEM, ethPerUnit, toUnits } from "../lib";

const client = publicClients.cook;
const app = new Hono();
app.use("*", cors());

const AIRDROP_MIN_USD = Number(process.env.AIRDROP_MIN_USD ?? 20);
const KEEPER_DATA_DIR = process.env.KEEPER_DATA_DIR ?? path.resolve(process.cwd(), "../keeper/data");
const now = () => Math.floor(Date.now() / 1000);
const lc = (a: string) => a.toLowerCase() as Address;

type CoinRow = typeof schema.coin.$inferSelect;
type QuoteRow = typeof schema.quote.$inferSelect;

// ---------------------------------------------------------------- shared loaders

async function loadQuotes() {
  const rows = await db.select().from(schema.quote);
  return new Map(rows.map((q) => [q.address, q]));
}

function toQuoteAsset(q: QuoteRow): QuoteAsset {
  return {
    address: q.address as Address,
    symbol: q.symbol,
    decimals: q.decimals,
    ethPerUnit: ethPerUnit(q),
    startFdv: toUnits(q.startFdv, q.decimals),
    graduationThreshold: toUnits(q.graduationThreshold, q.decimals),
  };
}

function ethUsdFrom(quotes: Map<string, QuoteRow>) {
  const usd = [...quotes.values()].find((q) => q.symbol === "USDG" && q.ethPerQuoteWad > 0n);
  if (usd) return 1 / ethPerUnit(usd);
  return Number(process.env.ETH_USD ?? 3500);
}

async function candlesSince(since: number, coin?: Address) {
  const where = coin
    ? and(gte(schema.candle.t, since), eq(schema.candle.coin, coin))
    : gte(schema.candle.t, since);
  return db.select().from(schema.candle).where(where).orderBy(asc(schema.candle.t));
}

function shapeCoin(c: CoinRow, q: QuoteRow, candles24h: (typeof schema.candle.$inferSelect)[]): Coin {
  const qa = toQuoteAsset(q);
  const supply = toUnits(c.totalSupply, 18);
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
  if (spark.length) spark[spark.length - 1] = c.price;

  const threshold = toUnits(c.graduationThreshold, q.decimals);
  const inPool = toUnits(c.quoteInPool, q.decimals);
  return {
    address: c.address as Address,
    name: c.name,
    symbol: c.symbol,
    image: c.image,
    description: c.description,
    website: c.website,
    twitter: c.twitter,
    telegram: c.telegram,
    creator: c.creator as Address,
    createdAt: c.createdAt,
    quote: qa,
    isMain: c.isMain,
    price: c.price,
    priceEth: c.price * qa.ethPerUnit,
    marketCap: c.price * supply,
    marketCapEth: c.price * supply * qa.ethPerUnit,
    change24h,
    volume24hEth: volumeQuote * qa.ethPerUnit,
    trades24h: 0,
    lastTradeAt: c.lastTradeAt,
    feesEth: c.feesEth,
    feesQuote: c.feesQuote.toString(),
    quoteInPool: inPool,
    graduationProgress: c.graduated ? 1 : threshold > 0 ? Math.min(1, inPool / threshold) : 0,
    graduated: c.graduated,
    holders: c.holders,
    burned: c.burned.toString(),
    spark,
  };
}

async function allCoins(): Promise<Coin[]> {
  const [rows, quotes, candles, recentTrades] = await Promise.all([
    db.select().from(schema.coin),
    loadQuotes(),
    candlesSince(now() - 86_400),
    db
      .select({ coin: schema.trade.coin })
      .from(schema.trade)
      .where(and(gte(schema.trade.timestamp, now() - 86_400), eq(schema.trade.kind, "trade"))),
  ]);
  const byCoin = new Map<string, (typeof candles)[number][]>();
  for (const k of candles) {
    const list = byCoin.get(k.coin) ?? [];
    list.push(k);
    byCoin.set(k.coin, list);
  }
  const tradeCounts = new Map<string, number>();
  for (const t of recentTrades) tradeCounts.set(t.coin, (tradeCounts.get(t.coin) ?? 0) + 1);
  return rows.map((c) => {
    const shaped = shapeCoin(c, quotes.get(c.quote)!, byCoin.get(c.address) ?? []);
    shaped.trades24h = tradeCounts.get(c.address) ?? 0;
    return shaped;
  });
}

function sortCoins(list: Coin[], sort: CoinSort) {
  switch (sort) {
    case "new":
      return list.sort((a, b) => b.createdAt - a.createdAt);
    case "active":
      return list.filter((c) => c.lastTradeAt > 0).sort((a, b) => b.lastTradeAt - a.lastTradeAt);
    case "near":
      return list.filter((c) => !c.graduated).sort((a, b) => b.graduationProgress - a.graduationProgress);
    case "graduated":
      return list.filter((c) => c.graduated).sort((a, b) => b.marketCapEth - a.marketCapEth);
    default:
      return list.sort((a, b) => b.marketCapEth - a.marketCapEth);
  }
}

/** Rug heuristic: the creator sold at least half of what they bought and price is 70%+ below its high. */
const isRugged = (c: CoinRow) => c.creatorBought > 0n && c.creatorSold * 2n >= c.creatorBought && c.price <= c.athPrice * 0.3;

/** The protection epoch as it would be built right now, from losses since the last published epoch. */
async function currentProtectionPlan() {
  const [coins, latest, budget] = await Promise.all([
    db.select().from(schema.coin),
    db.select().from(schema.protectionEpoch).orderBy(desc(schema.protectionEpoch.publishedAt)).limit(1),
    client.readContract({ abi: protectionFundAbi, address: PROTECTION_FUND, functionName: "epochBudget" }),
  ]);
  const since = latest[0]?.publishedAt ?? 0;
  const rows = await db.select().from(schema.loss).where(gte(schema.loss.timestamp, since));
  const byAddr = new Map(coins.map((c) => [c.address, c]));
  const losses: ProtectionLoss[] = rows
    .filter((l) => byAddr.get(l.coin) && byAddr.get(l.coin)!.creator !== l.wallet)
    .map((l) => {
      const c = byAddr.get(l.coin)!;
      return {
        coin: l.coin,
        symbol: c.symbol,
        wallet: l.wallet,
        lossEth: l.lossEth,
        holdSeconds: l.holdSeconds,
        taxPaidEth: l.taxPaidEth,
        rugged: isRugged(c),
      };
    });
  const contributed: Record<string, number> = {};
  let total = 0;
  for (const c of coins) {
    contributed[c.address] = toUnits(c.ethToProtection, 18);
    total += contributed[c.address]!;
  }
  const budgetEth = toUnits(budget, 18);
  const plan = planProtectionEpoch(losses, contributed, total, budgetEth);

  const coinFunding = (c: CoinRow): CoinProtection => {
    const allocationEth = coinAllocationEth(budgetEth, contributed[c.address] ?? 0, total);
    const requestedEth = plan.coins.get(c.address)?.requestedEth ?? 0;
    return {
      coin: c.address as Address,
      symbol: c.symbol,
      image: c.image,
      contributedEth: contributed[c.address] ?? 0,
      shareOfFund: total > 0 ? (contributed[c.address] ?? 0) / total : 0,
      allocationEth,
      requestedEth,
      scale: requestedEth > 0 ? Math.min(1, allocationEth / requestedEth) : allocationEth > 0 ? 1 : 0,
    };
  };
  return { plan, coins, byAddr, losses, contributed, total, budgetEth, since, coinFunding };
}

// ---------------------------------------------------------------- routes

app.get("/api/quotes", async (ctx) => {
  const quotes = await loadQuotes();
  return ctx.json([...quotes.values()].filter((q) => q.enabled).map(toQuoteAsset));
});

app.get("/api/stats", async (ctx) => {
  const [p, quotes, main, recent, otcBal, protBal] = await Promise.all([
    db.select().from(schema.platform).where(eq(schema.platform.id, "global")),
    loadQuotes(),
    db.select().from(schema.coin).where(eq(schema.coin.isMain, true)),
    db
      .select({ ethValue: schema.trade.ethValue })
      .from(schema.trade)
      .where(and(gte(schema.trade.timestamp, now() - 86_400), eq(schema.trade.kind, "trade"))),
    client.getBalance({ address: OTC_RESERVE }),
    client.getBalance({ address: PROTECTION_FUND }),
  ]);
  const row = p[0];
  const stats: PlatformStats = {
    ethUsd: ethUsdFrom(quotes),
    coins: row?.coins ?? 0,
    volume24hEth: recent.reduce((s, t) => s + t.ethValue, 0),
    totalFeesEth: row?.totalFeesEth ?? 0,
    mainBurned: (row?.mainBurned ?? 0n).toString(),
    mainSupply: (main[0]?.totalSupply ?? 0n).toString(),
    otcReserveEth: otcBal.toString(),
    protectionFundEth: protBal.toString(),
    protectionPaidEth: (row?.protectionPaid ?? 0n).toString(),
    airdroppedEth: row?.airdroppedEth ?? 0,
    coinsBurnedEth: row?.coinsBurnedEth ?? 0,
  };
  return ctx.json(stats);
});

app.get("/api/coins", async (ctx) => {
  const sort = (ctx.req.query("sort") ?? "mcap") as CoinSort;
  const quote = ctx.req.query("quote");
  const search = ctx.req.query("search")?.toLowerCase().trim();
  const limit = Math.min(Number(ctx.req.query("limit") ?? 100), 500);
  let list = await allCoins();
  if (quote && quote !== "all") list = list.filter((c) => c.quote.address.toLowerCase() === quote.toLowerCase());
  if (search)
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.symbol.toLowerCase().includes(search) ||
        c.address.toLowerCase() === search,
    );
  return ctx.json(sortCoins(list, sort).slice(0, limit));
});

app.get("/api/trending", async (ctx) => {
  const list = (await allCoins())
    .filter((c) => c.volume24hEth > 0)
    .sort((a, b) => b.volume24hEth - a.volume24hEth || b.trades24h - a.trades24h)
    .slice(0, 10);
  return ctx.json(list);
});

app.get("/api/coins/:address", async (ctx) => {
  const address = lc(ctx.req.param("address"));
  const [rows, quotes, candles] = await Promise.all([
    db.select().from(schema.coin).where(eq(schema.coin.address, address)),
    loadQuotes(),
    candlesSince(now() - 86_400, address),
  ]);
  const c = rows[0];
  if (!c) return ctx.json({ error: "not found" }, 404);
  const [pending, otcCoin, recent, protection] = await Promise.all([
    client.readContract({ abi: feeRouterAbi, address: FEE_ROUTER, functionName: "pending", args: [address] }),
    client.readContract({ abi: otcReserveAbi, address: OTC_RESERVE, functionName: "coins", args: [address] }),
    db
      .select({ id: schema.trade.id })
      .from(schema.trade)
      .where(and(eq(schema.trade.coin, address), gte(schema.trade.timestamp, now() - 86_400), eq(schema.trade.kind, "trade"))),
    currentProtectionPlan(),
  ]);
  const pendingQuote = (pending as readonly bigint[]).reduce((s: bigint, v: bigint) => s + v, 0n);
  const detail: CoinDetail = {
    ...shapeCoin(c, quotes.get(c.quote)!, candles),
    trades24h: recent.length,
    buckets: {
      coinBurned: c.coinBurned.toString(),
      ethToOtc: c.ethToOtc.toString(),
      ethToProtection: c.ethToProtection.toString(),
      ethToMainBuyback: c.ethToMainBuyback.toString(),
      airdropQuote: c.airdropQuote.toString(),
      pendingQuote: pendingQuote.toString(),
    },
    otc: {
      creditEth: otcCoin[0].toString(),
      contributedEth: otcCoin[1].toString(),
      lastContribution: Number(otcCoin[2]),
      inventory: otcCoin[3].toString(),
    },
    airdropsPaid: c.airdropsPaid.toString(),
    airdropRecipientsLastEpoch: c.airdropLastEpochRecipients,
    protection: protection.coinFunding(c),
  };
  return ctx.json(detail);
});

app.get("/api/coins/:address/candles", async (ctx) => {
  const address = lc(ctx.req.param("address"));
  const interval = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600 }[ctx.req.query("interval") ?? "5m"] ?? 300;
  const rows = await candlesSince(now() - interval * 500, address);
  const out: Candle[] = [];
  for (const k of rows) {
    const t = Math.floor(k.t / interval) * interval;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, k.h);
      last.l = Math.min(last.l, k.l);
      last.c = k.c;
      last.v += k.v;
    } else out.push({ t, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
  }
  return ctx.json(out);
});

app.get("/api/coins/:address/trades", async (ctx) => {
  const address = lc(ctx.req.param("address"));
  const limit = Math.min(Number(ctx.req.query("limit") ?? 50), 200);
  const rows = await db
    .select()
    .from(schema.trade)
    .where(eq(schema.trade.coin, address))
    .orderBy(desc(schema.trade.timestamp), desc(schema.trade.id))
    .limit(limit);
  const trades: Trade[] = rows.map((t) => ({
    id: t.id,
    tx: t.tx as Address,
    t: t.timestamp,
    trader: t.trader as Address,
    isBuy: t.isBuy,
    quoteAmount: t.quoteAmount.toString(),
    tokenAmount: t.tokenAmount.toString(),
    tax: t.tax.toString(),
    price: t.price,
    kind: t.kind as Trade["kind"],
  }));
  return ctx.json(trades);
});

async function holdersOf(address: Address): Promise<Holder[]> {
  const [coinRows, quotes, rows] = await Promise.all([
    db.select().from(schema.coin).where(eq(schema.coin.address, address)),
    loadQuotes(),
    db
      .select()
      .from(schema.holder)
      .where(and(eq(schema.holder.coin, address), gt(schema.holder.balance, 0n)))
      .orderBy(desc(schema.holder.balance)),
  ]);
  const c = coinRows[0];
  if (!c) return [];
  const q = quotes.get(c.quote)!;
  const ethUsd = ethUsdFrom(quotes);
  const minQuote = AIRDROP_MIN_USD / ethUsd / ethPerUnit(q);
  const supply = toUnits(c.totalSupply, 18);
  const out = rows
    .filter((h) => !SYSTEM.has(h.wallet))
    .map((h) => {
      const bal = toUnits(h.balance, 18);
      const basis = toUnits(h.costBasis, q.decimals);
      const value = bal * c.price;
      const avgEntry = bal > 0 ? basis / bal : 0;
      const eligible = avgEntry > c.price && value >= minQuote && h.wallet !== c.creator;
      return {
        address: h.wallet as Address,
        balance: h.balance.toString(),
        share: supply > 0 ? bal / supply : 0,
        avgEntry,
        costBasis: h.costBasis.toString(),
        unrealized: value - basis,
        airdropEligible: eligible,
        airdropWeight: eligible ? basis - value : 0,
      };
    });
  const total = out.reduce((s, h) => s + h.airdropWeight, 0);
  for (const h of out) h.airdropWeight = total > 0 ? h.airdropWeight / total : 0;
  return out;
}

app.get("/api/coins/:address/holders", async (ctx) => ctx.json(await holdersOf(lc(ctx.req.param("address")))));

// ---------------------------------------------------------------- protection

type EpochFile = {
  epoch: number;
  root: string;
  total: string;
  claims: { account: Address; amount: string; proof: Address[]; breakdown: ProtectionClaim["breakdown"] }[];
};

function readEpochFiles(): EpochFile[] {
  if (!existsSync(KEEPER_DATA_DIR)) return [];
  return readdirSync(KEEPER_DATA_DIR)
    .filter((f) => /^epoch-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(path.join(KEEPER_DATA_DIR, f), "utf8")) as EpochFile);
}

app.get("/api/protection", async (ctx) => {
  const [epochs, balance, reserved, budget, lastPublished, minInterval, protection] = await Promise.all([
    db.select().from(schema.protectionEpoch).orderBy(desc(schema.protectionEpoch.id)),
    client.getBalance({ address: PROTECTION_FUND }),
    client.readContract({ abi: protectionFundAbi, address: PROTECTION_FUND, functionName: "reserved" }),
    client.readContract({ abi: protectionFundAbi, address: PROTECTION_FUND, functionName: "epochBudget" }),
    client.readContract({ abi: protectionFundAbi, address: PROTECTION_FUND, functionName: "lastPublished" }),
    client.readContract({ abi: protectionFundAbi, address: PROTECTION_FUND, functionName: "minEpochInterval" }),
    currentProtectionPlan(),
  ]);
  const status: ProtectionStatus = {
    fundEth: balance.toString(),
    reservedEth: reserved.toString(),
    epochBudgetEth: budget.toString(),
    nextEpochAt: Number(lastPublished) === 0 ? 0 : Number(lastPublished) + Number(minInterval),
    epochs: epochs.map((e) => ({
      id: Number(e.id),
      total: e.total.toString(),
      claimed: e.claimed.toString(),
      publishedAt: e.publishedAt,
      uri: e.uri,
    })),
    coins: protection.coins
      .map(protection.coinFunding)
      .filter((c) => c.contributedEth > 0)
      .sort((a, b) => b.contributedEth - a.contributedEth),
  };
  return ctx.json(status);
});

/** Keeper input: realized losses in a window, with rug flags and exclusions applied. */
/** Keeper input for an epoch: realized losses in a window (creators excluded, rug flags applied) and
 *  each coin's contributions, so the keeper builds exactly the plan the UI estimates. */
app.get("/api/keeper/protection-input", async (ctx) => {
  const from = Number(ctx.req.query("from") ?? 0);
  const to = Number(ctx.req.query("to") ?? now());
  const [rows, coins] = await Promise.all([
    db
      .select()
      .from(schema.loss)
      .where(and(gte(schema.loss.timestamp, from), lt(schema.loss.timestamp, to))),
    db.select().from(schema.coin),
  ]);
  const byAddr = new Map(coins.map((c) => [c.address, c]));
  const losses: ProtectionLoss[] = rows
    .filter((l) => byAddr.get(l.coin) && byAddr.get(l.coin)!.creator !== l.wallet)
    .map((l) => {
      const c = byAddr.get(l.coin)!;
      return {
        coin: l.coin,
        symbol: c.symbol,
        wallet: l.wallet,
        lossEth: l.lossEth,
        holdSeconds: l.holdSeconds,
        taxPaidEth: l.taxPaidEth,
        rugged: isRugged(c),
      };
    });
  const contributedEth: Record<string, number> = {};
  let totalContributedEth = 0;
  for (const c of coins) {
    contributedEth[c.address] = toUnits(c.ethToProtection, 18);
    totalContributedEth += contributedEth[c.address]!;
  }
  return ctx.json({ losses, contributedEth, totalContributedEth });
});

// ---------------------------------------------------------------- wallet

app.get("/api/wallet/:address", async (ctx) => {
  const wallet = lc(ctx.req.param("address"));
  const [holdings, quotes, drops, claimedRows, epochs, losses] = await Promise.all([
    db
      .select()
      .from(schema.holder)
      .where(and(eq(schema.holder.wallet, wallet), or(gt(schema.holder.balance, 0n), gt(schema.holder.airdropsReceived, 0n)))),
    loadQuotes(),
    db.select().from(schema.airdrop).where(eq(schema.airdrop.recipient, wallet)).orderBy(desc(schema.airdrop.timestamp)).limit(200),
    db.select().from(schema.protectionClaim).where(eq(schema.protectionClaim.account, wallet)),
    db.select().from(schema.protectionEpoch).orderBy(desc(schema.protectionEpoch.publishedAt)),
    db.select().from(schema.loss).where(eq(schema.loss.wallet, wallet)),
  ]);
  const coinList = await allCoins();
  const coinMap = new Map(coinList.map((c) => [c.address.toLowerCase(), c]));

  const positions: Position[] = holdings
    .filter((h) => coinMap.has(h.coin))
    .map((h) => {
      const c = coinMap.get(h.coin)!;
      const bal = toUnits(h.balance, 18);
      const basis = toUnits(h.costBasis, c.quote.decimals);
      const value = bal * c.price;
      const avgEntry = bal > 0 ? basis / bal : 0;
      return {
        coin: c,
        balance: h.balance.toString(),
        avgEntry,
        costBasis: h.costBasis.toString(),
        value,
        unrealized: value - basis,
        realizedPnl: toUnits(h.realizedQuote, c.quote.decimals),
        firstBuyAt: h.firstBuyAt,
        taxPaid: h.taxPaid.toString(),
        airdropEligible: bal > 0 && avgEntry > c.price,
        airdropsReceived: h.airdropsReceived.toString(),
      };
    });

  const claimed = new Set(claimedRows.map((r) => Number(r.epoch)));
  const claims: ProtectionClaim[] = [];
  for (const f of readEpochFiles()) {
    const mine = f.claims.find((c) => c.account.toLowerCase() === wallet);
    if (mine)
      claims.push({ epoch: f.epoch, account: wallet, amount: mine.amount, proof: mine.proof, claimed: claimed.has(f.epoch), breakdown: mine.breakdown });
  }

  const lastEpochAt = epochs[0]?.publishedAt ?? 0;
  const protection = await currentProtectionPlan();
  const planned = protection.plan.wallets.get(wallet)?.breakdown ?? [];
  const byCoin = new Map<string, { lossEth: number; hold: number }>();
  for (const l of losses.filter((x) => x.timestamp >= lastEpochAt)) {
    const e = byCoin.get(l.coin) ?? { lossEth: 0, hold: 0 };
    e.lossEth += l.lossEth;
    e.hold = Math.max(e.hold, l.holdSeconds);
    byCoin.set(l.coin, e);
  }
  const pendingCoverage = [...byCoin].map(([coin, e]) => {
    const p = planned.find((b) => b.coin === coin);
    const row = protection.byAddr.get(coin as Address);
    return {
      coin: coin as Address,
      symbol: coinMap.get(coin)?.symbol ?? "?",
      lossEth: e.lossEth,
      tierBps: p?.tierBps ?? coverageBpsForHold(e.hold, row ? isRugged(row) : false),
      coverageBps: p?.coverageBps ?? 0,
      estimatedEth: p ? (p.lossEth * p.coverageBps) / 10_000 : 0,
    };
  });

  const summary: WalletSummary = {
    address: wallet,
    positions,
    airdrops: drops.map((d) => {
      const c = coinMap.get(d.coin);
      const q = c ? quotes.get(lc(c.quote.address)) : undefined;
      return {
        coin: d.coin as Address,
        symbol: c?.symbol ?? "?",
        amount: d.amount.toString(),
        quoteSymbol: q?.symbol ?? "ETH",
        quoteDecimals: q?.decimals ?? 18,
        t: d.timestamp,
      };
    }),
    claims: claims.sort((a, b) => b.epoch - a.epoch),
    pendingCoverage,
  };
  return ctx.json(summary);
});

app.get("/api/activity", async (ctx) => {
  const limit = Math.min(Number(ctx.req.query("limit") ?? 40), 100);
  const [trades, coins] = await Promise.all([
    db.select().from(schema.trade).where(eq(schema.trade.kind, "trade")).orderBy(desc(schema.trade.timestamp), desc(schema.trade.id)).limit(limit),
    db.select().from(schema.coin).orderBy(desc(schema.coin.createdAt)).limit(10),
  ]);
  const meta = new Map((await db.select().from(schema.coin)).map((c) => [c.address, c]));
  const items: ActivityItem[] = [
    ...trades.map((t) => ({
      id: t.id,
      kind: (t.isBuy ? "buy" : "sell") as ActivityItem["kind"],
      coin: t.coin as Address,
      symbol: meta.get(t.coin)?.symbol ?? "?",
      image: meta.get(t.coin)?.image ?? "",
      wallet: t.trader as Address,
      ethValue: t.ethValue,
      t: t.timestamp,
    })),
    ...coins.map((c) => ({
      id: `launch-${c.address}`,
      kind: "launch" as const,
      coin: c.address as Address,
      symbol: c.symbol,
      image: c.image,
      wallet: c.creator as Address,
      ethValue: 0,
      t: c.createdAt,
    })),
  ];
  return ctx.json(items.sort((a, b) => b.t - a.t).slice(0, limit));
});

export default app;
