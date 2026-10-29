import { ponder, type Context } from "ponder:registry";
import { airdrop, candle, coin, holder, loss, otcTrade, platform, protectionClaim, protectionEpoch, quote, trade } from "ponder:schema";
import { erc20Abi, type Address } from "viem";
import { cookHookAbi, launchpadAbi, launchTokenAbi } from "@cook/shared";

import {
  FEE_ROUTER,
  HOOK,
  LAUNCHPAD,
  POOL_MANAGER,
  SUPPLY,
  SYSTEM,
  ZERO,
  priceFromSqrt,
  quoteInPool,
  toEth,
  toUnits,
} from "./lib";

const lc = (a: string) => a.toLowerCase() as Address;

// ---------------------------------------------------------------- helpers

async function ensurePlatform(context: Context) {
  return context.db
    .insert(platform)
    .values({
      id: "global",
      coins: 0,
      mainBurned: 0n,
      otcContributed: 0n,
      otcPaidOut: 0n,
      otcReceived: 0n,
      protectionContributed: 0n,
      protectionPaid: 0n,
      airdroppedEth: 0,
      coinsBurnedEth: 0,
      totalFeesEth: 0,
    })
    .onConflictDoNothing();
}

async function ensureQuote(context: Context, address: Address) {
  const a = lc(address);
  const existing = await context.db.find(quote, { address: a });
  if (existing) return existing;
  const [enabled, startFdv, graduationThreshold] = await context.client.readContract({
    abi: launchpadAbi,
    address: LAUNCHPAD,
    functionName: "quotes",
    args: [a],
  });
  let symbol = "ETH";
  let decimals = 18;
  if (a !== ZERO) {
    [symbol, decimals] = await Promise.all([
      context.client.readContract({ abi: erc20Abi, address: a, functionName: "symbol" }),
      context.client.readContract({ abi: erc20Abi, address: a, functionName: "decimals" }),
    ]);
  }
  return context.db.insert(quote).values({
    address: a,
    symbol,
    decimals,
    enabled,
    startFdv,
    graduationThreshold,
    ethPerQuoteWad: a === ZERO ? 10n ** 18n : 0n,
    rateUpdatedAt: 0,
  });
}

/** Coin rows are created from chain state the first time any of its events is seen
 *  (token Transfers and the creator's first Trade are logged before TokenLaunched). */
async function ensureCoin(context: Context, token: Address, timestamp: number) {
  const t = lc(token);
  const existing = await context.db.find(coin, { address: t });
  if (existing) return existing;

  const launch = await context.client.readContract({
    abi: launchpadAbi,
    address: LAUNCHPAD,
    functionName: "getLaunch",
    args: [t],
  });
  const poolId = await context.client.readContract({ abi: cookHookAbi, address: HOOK, functionName: "poolIdOf", args: [t] });
  const pool = await context.client.readContract({ abi: cookHookAbi, address: HOOK, functionName: "pools", args: [poolId] });
  const [name, symbol, info] = await Promise.all([
    context.client.readContract({ abi: launchTokenAbi, address: t, functionName: "name" }),
    context.client.readContract({ abi: launchTokenAbi, address: t, functionName: "symbol" }),
    context.client.readContract({ abi: launchTokenAbi, address: t, functionName: "getTokenInfo" }),
  ]);
  const meta = info[1];
  const q = await ensureQuote(context, launch.quote);
  const sqrtStart = pool[6];
  const price = priceFromSqrt(sqrtStart, launch.tokenIsCurrency0, q.decimals);

  await ensurePlatform(context);
  await context.db.update(platform, { id: "global" }).set((p) => ({ coins: p.coins + 1 }));

  return context.db.insert(coin).values({
    address: t,
    name,
    symbol,
    image: meta.image,
    description: meta.description,
    website: meta.website,
    twitter: meta.twitter,
    telegram: meta.telegram,
    creator: lc(launch.creator),
    createdAt: Number(launch.launchedAt) || timestamp,
    quote: lc(launch.quote),
    poolId,
    tokenIsCurrency0: launch.tokenIsCurrency0,
    isMain: false,
    graduationThreshold: pool[8],
    sqrtPriceStart: sqrtStart,
    liquidity: pool[7],
    price,
    athPrice: price,
    quoteInPool: 0n,
    graduated: false,
    totalSupply: SUPPLY,
    burned: 0n,
    trades: 0,
    volumeQuote: 0n,
    volumeEth: 0,
    lastTradeAt: 0,
    holders: 0,
    feesQuote: 0n,
    feesEth: 0,
    coinBurned: 0n,
    ethToOtc: 0n,
    ethToProtection: 0n,
    ethToMainBuyback: 0n,
    airdropQuote: 0n,
    airdropsPaid: 0n,
    airdropLastEpoch: 0n,
    airdropLastEpochRecipients: 0,
    creatorBought: 0n,
    creatorSold: 0n,
  });
}

async function ensureHolder(context: Context, token: Address, wallet: Address) {
  const key = { coin: lc(token), wallet: lc(wallet) };
  const existing = await context.db.find(holder, key);
  if (existing) return existing;
  return context.db.insert(holder).values({
    ...key,
    balance: 0n,
    costBasis: 0n,
    firstBuyAt: 0,
    realizedQuote: 0n,
    taxPaid: 0n,
    airdropsReceived: 0n,
  });
}

async function quoteOf(context: Context, c: { quote: Address }) {
  return (await context.db.find(quote, { address: c.quote }))!;
}

// ---------------------------------------------------------------- Launchpad

ponder.on("Launchpad:TokenLaunched", async ({ event, context }) => {
  await ensureCoin(context, event.args.token, Number(event.block.timestamp));
});

ponder.on("Launchpad:QuoteSet", async ({ event, context }) => {
  const q = await ensureQuote(context, event.args.quote);
  await context.db.update(quote, { address: q.address }).set({
    enabled: event.args.enabled,
    startFdv: event.args.startFdv,
    graduationThreshold: event.args.graduationThreshold,
  });
});

ponder.on("Launchpad:MainTokenSet", async ({ event, context }) => {
  await ensureCoin(context, event.args.token, Number(event.block.timestamp));
  await context.db.update(coin, { address: lc(event.args.token) }).set({ isMain: true });
});

// ---------------------------------------------------------------- Hook

ponder.on("CookHook:Trade", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const a = event.args;
  const c = await ensureCoin(context, a.token, ts);
  const q = await quoteOf(context, c);
  const trader = lc(a.trader);
  const kind = trader === FEE_ROUTER ? "buyback" : "trade";
  const price = priceFromSqrt(a.sqrtPriceX96, c.tokenIsCurrency0, q.decimals);
  const ethValue = toEth(a.quoteAmount, q);

  await context.db.insert(trade).values({
    id: event.id,
    coin: c.address,
    trader,
    isBuy: a.isBuy,
    quoteAmount: a.quoteAmount,
    tokenAmount: a.tokenAmount,
    tax: a.tax,
    price,
    ethValue,
    timestamp: ts,
    tx: event.transaction.hash,
    kind,
  });

  const minute = Math.floor(ts / 60) * 60;
  const vol = toUnits(a.quoteAmount, q.decimals);
  const open = c.price;
  await context.db
    .insert(candle)
    .values({ coin: c.address, t: minute, o: open, h: Math.max(open, price), l: Math.min(open, price), c: price, v: vol })
    .onConflictDoUpdate((row) => ({ h: Math.max(row.h, price), l: Math.min(row.l, price), c: price, v: row.v + vol }));

  const isCreator = trader === c.creator;
  await context.db.update(coin, { address: c.address }).set((row) => ({
    price,
    athPrice: Math.max(row.athPrice, price),
    quoteInPool: quoteInPool(a.sqrtPriceX96, row.sqrtPriceStart, row.liquidity, row.tokenIsCurrency0),
    trades: row.trades + (kind === "trade" ? 1 : 0),
    volumeQuote: row.volumeQuote + a.quoteAmount,
    volumeEth: row.volumeEth + ethValue,
    lastTradeAt: kind === "trade" ? ts : row.lastTradeAt,
    creatorBought: row.creatorBought + (isCreator && a.isBuy ? a.tokenAmount : 0n),
    creatorSold: row.creatorSold + (isCreator && !a.isBuy ? a.tokenAmount : 0n),
  }));

  if (kind === "buyback") return;

  // cost basis: this handler runs before the matching token Transfer, so balances are pre-trade
  const h = await ensureHolder(context, c.address, trader);
  if (a.isBuy) {
    await context.db.update(holder, { coin: c.address, wallet: trader }).set({
      costBasis: h.costBasis + a.quoteAmount,
      taxPaid: h.taxPaid + a.tax,
      firstBuyAt: h.balance === 0n || h.firstBuyAt === 0 ? ts : h.firstBuyAt,
    });
    return;
  }

  const sold = a.tokenAmount < h.balance ? a.tokenAmount : h.balance;
  const basisRemoved = h.balance > 0n ? (h.costBasis * sold) / h.balance : 0n;
  const proceeds = a.quoteAmount - a.tax;
  const taxPaid = h.taxPaid + a.tax;
  await context.db.update(holder, { coin: c.address, wallet: trader }).set({
    costBasis: h.costBasis - basisRemoved,
    realizedQuote: h.realizedQuote + proceeds - basisRemoved,
    taxPaid,
  });
  if (basisRemoved > proceeds) {
    const lossQuote = basisRemoved - proceeds;
    await context.db.insert(loss).values({
      id: event.id,
      coin: c.address,
      wallet: trader,
      timestamp: ts,
      lossQuote,
      lossEth: toEth(lossQuote, q),
      holdSeconds: h.firstBuyAt > 0 ? ts - h.firstBuyAt : 0,
      taxPaidEth: toEth(taxPaid, q),
    });
  }
});

ponder.on("CookHook:Graduated", async ({ event, context }) => {
  await context.db
    .update(coin, { address: lc(event.args.token) })
    .set({ graduated: true, graduatedAt: Number(event.block.timestamp) });
});

// ---------------------------------------------------------------- coin transfers

ponder.on("LaunchToken:Transfer", async ({ event, context }) => {
  const token = lc(event.log.address);
  const c = await ensureCoin(context, token, Number(event.block.timestamp));
  const from = lc(event.args.from);
  const to = lc(event.args.to);
  const value = event.args.value;
  let holderDelta = 0;

  if (from !== ZERO) {
    const h = await ensureHolder(context, token, from);
    const balance = h.balance - value;
    // wallet-to-wallet transfers move tokens without their basis; pool-bound sells were handled in Trade
    const movesBasis = to !== POOL_MANAGER && h.balance > 0n;
    const costBasis = balance === 0n ? 0n : movesBasis ? h.costBasis - (h.costBasis * value) / h.balance : h.costBasis;
    await context.db.update(holder, { coin: token, wallet: from }).set({
      balance,
      costBasis,
      firstBuyAt: balance === 0n ? 0 : h.firstBuyAt,
    });
    if (!SYSTEM.has(from) && h.balance > 0n && balance === 0n) holderDelta -= 1;
  }

  if (to !== ZERO) {
    const h = await ensureHolder(context, token, to);
    await context.db.update(holder, { coin: token, wallet: to }).set({ balance: h.balance + value });
    if (!SYSTEM.has(to) && h.balance === 0n && value > 0n) holderDelta += 1;
  }

  const burn = to === ZERO ? value : 0n;
  if (burn > 0n || holderDelta !== 0) {
    await context.db.update(coin, { address: c.address }).set((row) => ({
      totalSupply: row.totalSupply - burn,
      burned: row.burned + burn,
      holders: row.holders + holderDelta,
    }));
  }
});

// ---------------------------------------------------------------- FeeRouter

ponder.on("FeeRouter:FeesAccrued", async ({ event, context }) => {
  const c = await ensureCoin(context, event.args.token, Number(event.block.timestamp));
  const q = await quoteOf(context, c);
  const fees = event.args.baseFee + event.args.snipeExtra;
  const eth = toEth(fees, q);
  await context.db.update(coin, { address: c.address }).set((row) => ({
    feesQuote: row.feesQuote + fees,
    feesEth: row.feesEth + eth,
  }));
  await ensurePlatform(context);
  await context.db.update(platform, { id: "global" }).set((p) => ({ totalFeesEth: p.totalFeesEth + eth }));
});

ponder.on("FeeRouter:Processed", async ({ event, context }) => {
  const a = event.args;
  const c = await ensureCoin(context, a.token, Number(event.block.timestamp));
  const q = await quoteOf(context, c);
  await context.db.update(coin, { address: c.address }).set((row) => ({
    coinBurned: row.coinBurned + a.coinBurned,
    ethToOtc: row.ethToOtc + a.ethToOtc,
    ethToProtection: row.ethToProtection + a.ethToProtection,
    ethToMainBuyback: row.ethToMainBuyback + a.ethToMainBuyback,
    airdropQuote: row.airdropQuote + a.airdropQuote,
  }));
  const burnedEth = toUnits(a.coinBurned, 18) * c.price * (q.address === ZERO ? 1 : toEth(10n ** BigInt(q.decimals), q));
  await ensurePlatform(context);
  await context.db.update(platform, { id: "global" }).set((p) => ({
    mainBurned: p.mainBurned + a.mainBurned,
    coinsBurnedEth: p.coinsBurnedEth + burnedEth,
  }));
});

// ---------------------------------------------------------------- OTC reserve

ponder.on("OTCReserve:Contributed", async ({ event, context }) => {
  await ensurePlatform(context);
  await context.db
    .update(platform, { id: "global" })
    .set((p) => ({ otcContributed: p.otcContributed + event.args.amount }));
});

ponder.on("OTCReserve:SoldToReserve", async ({ event, context }) => {
  await context.db.insert(otcTrade).values({
    id: event.id,
    coin: lc(event.args.token),
    wallet: lc(event.args.seller),
    isSellToReserve: true,
    tokenAmount: event.args.tokenAmount,
    ethAmount: event.args.ethOut,
    timestamp: Number(event.block.timestamp),
  });
  await ensurePlatform(context);
  await context.db.update(platform, { id: "global" }).set((p) => ({ otcPaidOut: p.otcPaidOut + event.args.ethOut }));
});

ponder.on("OTCReserve:BoughtFromReserve", async ({ event, context }) => {
  await context.db.insert(otcTrade).values({
    id: event.id,
    coin: lc(event.args.token),
    wallet: lc(event.args.buyer),
    isSellToReserve: false,
    tokenAmount: event.args.tokenAmount,
    ethAmount: event.args.ethIn,
    timestamp: Number(event.block.timestamp),
  });
  await ensurePlatform(context);
  await context.db.update(platform, { id: "global" }).set((p) => ({ otcReceived: p.otcReceived + event.args.ethIn }));
});

ponder.on("OTCReserve:QuoteRateSet", async ({ event, context }) => {
  const q = await ensureQuote(context, event.args.quote);
  await context.db
    .update(quote, { address: q.address })
    .set({ ethPerQuoteWad: event.args.ethPerQuoteWad, rateUpdatedAt: Number(event.block.timestamp) });
});

// ---------------------------------------------------------------- protection fund

ponder.on("ProtectionFund:Contributed", async ({ event, context }) => {
  await ensurePlatform(context);
  await context.db
    .update(platform, { id: "global" })
    .set((p) => ({ protectionContributed: p.protectionContributed + event.args.amount }));
});

ponder.on("ProtectionFund:EpochPublished", async ({ event, context }) => {
  await context.db.insert(protectionEpoch).values({
    id: event.args.epoch,
    root: event.args.root,
    total: event.args.total,
    claimed: 0n,
    publishedAt: Number(event.block.timestamp),
    uri: event.args.uri,
  });
});

ponder.on("ProtectionFund:Claimed", async ({ event, context }) => {
  await context.db.insert(protectionClaim).values({
    epoch: event.args.epoch,
    account: lc(event.args.account),
    amount: event.args.amount,
    timestamp: Number(event.block.timestamp),
  });
  await context.db
    .update(protectionEpoch, { id: event.args.epoch })
    .set((e) => ({ claimed: e.claimed + event.args.amount }));
  await ensurePlatform(context);
  await context.db
    .update(platform, { id: "global" })
    .set((p) => ({ protectionPaid: p.protectionPaid + event.args.amount }));
});

// ---------------------------------------------------------------- airdrops

ponder.on("HolderAirdrop:Airdropped", async ({ event, context }) => {
  const a = event.args;
  const c = await ensureCoin(context, a.token, Number(event.block.timestamp));
  const q = await quoteOf(context, c);
  await context.db.insert(airdrop).values({
    id: event.id,
    coin: c.address,
    epoch: a.epoch,
    recipient: lc(a.recipient),
    amount: a.amount,
    timestamp: Number(event.block.timestamp),
  });
  const h = await ensureHolder(context, c.address, a.recipient);
  await context.db
    .update(holder, { coin: c.address, wallet: lc(a.recipient) })
    .set({ airdropsReceived: h.airdropsReceived + a.amount });
  await context.db.update(coin, { address: c.address }).set((row) => ({
    airdropsPaid: row.airdropsPaid + a.amount,
    airdropLastEpoch: a.epoch,
    airdropLastEpochRecipients: row.airdropLastEpoch === a.epoch ? row.airdropLastEpochRecipients + 1 : 1,
  }));
  await ensurePlatform(context);
  await context.db
    .update(platform, { id: "global" })
    .set((p) => ({ airdroppedEth: p.airdroppedEth + toEth(a.amount, q) }));
});
