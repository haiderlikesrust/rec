import assert from "node:assert/strict";
import { test } from "node:test";
import { Curve, CurveCalculator, LaunchConstantProductCurve, type LaunchpadConfigInfo } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import {
  CPMM_TIER,
  CURVE_SOLD_SHARE,
  GRADUATION_MCAP_USD,
  GRADUATION_RAISE_USD,
  PLATFORM_FEE_BPS,
  RAYDIUM_CURVE_FEE_BPS,
  RAYDIUM_PLATFORM_FEE_CAP_BPS,
  RUG_COVERAGE_BPS,
  START_MCAP_USD,
  TAX_BPS,
  communityShareBps,
  feeBreakdown,
  otcActivityBps,
  otcPolicy,
  protectionPayout,
  quoteCatalog,
  quoteGroups,
  splitRaw,
} from "@gantry/shared";
import { launchLimits, launchParams, platformFeeRate, platformParams } from "./chain/params";
import { SUPPLY_RAW, cpmmBuy, cpmmFees, cpmmRates, cpmmSell, curveBuy, curveRates, curveReserves, curveSell, launchCurve, priceOf, type CurveState, afterTransferFee, beforeTransferFee, transferFee } from "./curve";
import { UserError } from "./engine";

const bn = (v: bigint) => new BN(v.toString());
const int = (v: BN) => BigInt(v.toString());

// LaunchLab's global configs as they stood on mainnet in Nov 2026 (rates are parts per million)
const config = (minFundRaisingB: bigint, migrateFee = 0n) =>
  ({
    curveType: 0,
    migrateFee: bn(migrateFee),
    tradeFeeRate: new BN(2_500),
    minSupplyA: new BN(10_000_000),
    maxLockRate: new BN(800_000),
    minSellRateA: new BN(200_000),
    minMigrateRateA: new BN(150_000),
    minFundRaisingB: bn(minFundRaisingB),
  }) as unknown as LaunchpadConfigInfo;
const SOL_CONFIG = config(24_000_000_000n);
const USD1_CONFIG = config(5_000_000_000n);

test("fee split is 50/50 and loses nothing to rounding", () => {
  for (const amount of [1n, 7n, 9_999n, 123_456_789n, 10n ** 18n + 3n]) {
    const s = splitRaw(amount);
    assert.equal(s.otcReserve + s.protection, amount);
  }
  const s = splitRaw(10_001n);
  assert.deepEqual([s.otcReserve, s.protection], [5000n, 5001n]);
});

test("on the curve a trade pays 3%: Raydium's 0.25% and a 2.75% platform fee, inside LaunchLab's 5% cap", () => {
  assert.equal(RAYDIUM_CURVE_FEE_BPS + PLATFORM_FEE_BPS, TAX_BPS);
  assert.equal(platformFeeRate(2_500n), 27_500n, "the platform fee tops Raydium's protocol fee up to 3%");
  assert.ok(PLATFORM_FEE_BPS <= RAYDIUM_PLATFORM_FEE_CAP_BPS);
  // if Raydium changed its own fee, the platform fee moves the other way, never below zero or past the cap
  assert.equal(platformFeeRate(10_000n), 20_000n);
  assert.equal(platformFeeRate(40_000n), 0n);
  const p = platformParams(27_500n);
  assert.ok(p.creatorFeeRate.isZero(), "nothing for the creator");
  assert.deepEqual([p.migrateCpLockNftScale.platformScale.toNumber(), p.migrateCpLockNftScale.creatorScale.toNumber(), p.migrateCpLockNftScale.burnScale.toNumber()], [1_000_000, 0, 0]);
  assert.deepEqual(feeBreakdown("curve"), { taxBps: 300, raydiumBps: 25, bucketsBps: 275, burnedBps: 0 });
  assert.ok(Math.abs(communityShareBps("curve") - 9166.67) < 0.01);
});

test("after graduation the pool's tier is the one closest to 3%, and its fee splits between Raydium, the buckets and a burn", () => {
  const tier = CPMM_TIER["mainnet-beta"];
  assert.deepEqual([tier.tradeFeeBps, tier.creatorFeeBps], [250, 5]);
  const f = feeBreakdown("cpmm");
  assert.equal(f.taxBps, 255);
  assert.ok(Math.abs(f.raydiumBps + f.bucketsBps + f.burnedBps - f.taxBps) < 1e-9, "every part of the fee is accounted for");
  // Raydium: 16% of the trade fee and 5% of the creator fee. The LPs' 84% comes back half in the quote, half in the coin.
  assert.ok(Math.abs(f.raydiumBps - (250 * 0.16 + 5 * 0.05)) < 1e-9);
  assert.ok(Math.abs(f.burnedBps - 105) < 1e-9);
  assert.ok(Math.abs(f.bucketsBps - (105 + 4.75)) < 1e-9);
  // the same split, from a swap's own numbers
  assert.deepEqual(cpmmFees(25_000n, 500n, cpmmRates("mainnet-beta")), { tax: 25_500n, protocol: 4_025n, harvestable: 10_975n });
});

test("every quote's curve starts at $2.5k and graduates at $25k, with numbers LaunchLab accepts", () => {
  for (const [usd, decimals, cfg] of [
    [67.86, 9, SOL_CONFIG], // SOL
    [250, 9, SOL_CONFIG],
    [0.9996, 6, config(1n)], // USDC
    [0.9995, 6, USD1_CONFIG],
  ] as const) {
    const c = launchParams({ symbol: "Q", usd, decimals }, launchLimits(cfg));
    const mcap = (quote: bigint, base: bigint) => (Number(quote) / Number(base)) * (Number(c.supply) / 10 ** decimals) * usd;
    assert.ok(Math.abs(mcap(c.virtualQuote, c.virtualBase) - START_MCAP_USD) < 0.01, "starts at $2.5k");
    assert.ok(Math.abs(mcap(c.virtualQuote + c.raise, c.virtualBase - c.sell) - GRADUATION_MCAP_USD) < 0.01, "the curve ends at $25k");
    assert.ok(Math.abs(mcap(c.raise, c.supply - c.sell) - GRADUATION_MCAP_USD) < 0.01, "and the CPMM pool opens there");
    assert.ok(Math.abs(Number(c.sell) / Number(c.supply) - CURVE_SOLD_SHARE) < 1e-9 && Math.abs(CURVE_SOLD_SHARE - 0.75975) < 1e-5, "75.97% of the supply sells on the curve");
    assert.ok(Math.abs((Number(c.raise) / 10 ** decimals) * usd - GRADUATION_RAISE_USD) < 0.01 && Math.abs(GRADUATION_RAISE_USD - 6006.33) < 0.01, "raising about $6k");
    assert.equal(c.supply, SUPPLY_RAW);

    // LaunchLab derives the virtual reserves from supply, sell and raise: ours are its own
    const init = LaunchConstantProductCurve.getInitParam({ supply: bn(c.supply), totalSell: bn(c.sell), totalFundRaising: bn(c.raise), totalLockedAmount: new BN(0), migrateFee: new BN(0) });
    assert.deepEqual([int(init.a), int(init.b)], [c.virtualBase, c.virtualQuote]);
    assert.doesNotThrow(() => Curve.checkParam({ supply: bn(c.supply), totalSell: bn(c.sell), totalFundRaising: bn(c.raise), totalLockedAmount: new BN(0), decimals: 6, config: cfg, migrateType: "cpmm" }));
  }
});

test("a migrate fee comes out of the raise, so the curve raises that much more and the pool still opens at $25k", () => {
  const fee = 2_000_000_000n; // 2 SOL
  const c = launchParams({ symbol: "SOL", usd: 100, decimals: 9 }, launchLimits(config(24_000_000_000n, fee)));
  const mcap = (quote: bigint, base: bigint) => (Number(quote) / Number(base)) * (Number(c.supply) / 1e9) * 100;
  assert.ok(Math.abs(mcap(c.virtualQuote, c.virtualBase) - START_MCAP_USD) < 0.01);
  assert.ok(Math.abs(mcap(c.virtualQuote + c.raise, c.virtualBase - c.sell) - GRADUATION_MCAP_USD) < 0.01);
  assert.ok(Math.abs(mcap(c.raise - fee, c.supply - c.sell) - GRADUATION_MCAP_USD) < 0.01);
  const init = LaunchConstantProductCurve.getInitParam({ supply: bn(c.supply), totalSell: bn(c.sell), totalFundRaising: bn(c.raise), totalLockedAmount: new BN(0), migrateFee: bn(fee) });
  assert.deepEqual([int(init.a), int(init.b)], [c.virtualBase, c.virtualQuote]);
});

test("a quote whose curve would raise less than LaunchLab's floor can't launch", () => {
  // SOL's config asks for 24 SOL: about $6k is that many SOL or more only while SOL is under about $250
  assert.doesNotThrow(() => launchParams({ symbol: "SOL", usd: 240, decimals: 9 }, launchLimits(SOL_CONFIG)));
  assert.throws(() => launchParams({ symbol: "SOL", usd: 260, decimals: 9 }, launchLimits(SOL_CONFIG)), (e: Error) => e instanceof UserError && /at least 24 SOL/.test(e.message));
  assert.throws(() => launchParams({ symbol: "SOL", usd: 0, decimals: 9 }, launchLimits(SOL_CONFIG)), UserError);
  // the catalog's copy of each floor is the one read from mainnet
  const floor = (symbol: string) => quoteCatalog["mainnet-beta"].find((q) => q.symbol === symbol)!.minRaise;
  assert.deepEqual([floor("SOL"), floor("USD1")], [24, 5_000]);
  assert.deepEqual(quoteCatalog["mainnet-beta"].slice(0, 4).map((q) => q.symbol), ["SOL", "USDC", "USDT", "USD1"], "SOL and the stablecoins lead the catalog");
});

test("the catalog: every quote has its group, and a group, a category and an issuer never disagree", () => {
  const catalog = quoteCatalog["mainnet-beta"];
  assert.ok(catalog.length > 400, `${catalog.length} quotes`);
  assert.equal(new Set(catalog.map((q) => q.mint)).size, catalog.length, "no mint twice");
  const groups = quoteGroups.map((g) => g.key);
  for (const g of groups) assert.ok(catalog.some((q) => q.group === g), `${g} has quotes`);
  const issuerOf: Record<string, string | undefined> = { xstocks: "xStocks", backpack: "Backpack", prestocks: "PreStocks", tessera: "Tessera" };
  for (const q of catalog) {
    assert.ok(groups.includes(q.group), `${q.symbol}: ${q.group}`);
    assert.equal(q.issuer, issuerOf[q.group], `${q.symbol}: an issuer's group names its issuer, the others none`);
    assert.equal(q.category === "stock", !!q.issuer, q.symbol);
    assert.equal(q.category === "meme", q.group === "memes", q.symbol);
    assert.ok((q.transferFeeBps ?? 0) <= 500 && (q.uiMultiplier ?? 1) > 0 && q.minRaise > 0, q.symbol);
  }
  // grouped in the picker's order after the four kept by hand, the most liquid first within a group
  const rest = catalog.slice(4);
  assert.deepEqual([...new Set(rest.map((q) => q.group))], groups);
  for (const g of groups) {
    const liquidity = rest.filter((q) => q.group === g).map((q) => q.liquidityUsd ?? 0);
    assert.deepEqual(liquidity, [...liquidity].sort((a, b) => b - a), g);
  }
  const count = (g: string) => catalog.filter((q) => q.group === g).length;
  assert.deepEqual([count("xstocks") >= 25, count("backpack") >= 90, count("prestocks") >= 9, count("tessera"), count("sunrise") >= 30], [true, true, true, 2, true]);
  // the pre-IPO stock tokens are the ones that charge on every transfer: 1% and 0.2%
  assert.ok(catalog.filter((q) => q.group === "prestocks").every((q) => q.transferFeeBps === 100) && catalog.filter((q) => q.group === "tessera").every((q) => q.transferFeeBps === 20));
  assert.ok(catalog.filter((q) => q.group === "xstocks" || q.group === "backpack").every((q) => !q.transferFeeBps));
});

test("a transfer fee: what arrives of an amount sent, and what has to be sent for an amount to arrive", () => {
  const one = { bps: 100n, max: 2n ** 64n - 1n };
  assert.equal(transferFee(883_074n, one), 8_831n, "1%, rounded up");
  assert.equal(afterTransferFee(883_074n, one), 874_243n);
  assert.equal(afterTransferFee(87_203_552n, one), 86_331_516n);
  assert.equal(beforeTransferFee(577_972n, one), 583_811n);
  // sending what the inverse says always lands at least what was asked for, and never a whole unit of fee more
  for (const fee of [one, { bps: 20n, max: 2n ** 64n - 1n }, { bps: 269n, max: 1_000_000n }, { bps: 300n, max: 50n }])
    for (const net of [1n, 2n, 99n, 100n, 101n, 4_999n, 577_972n, 123_456_789_012n]) {
      const sent = beforeTransferFee(net, fee);
      assert.ok(afterTransferFee(sent, fee) >= net && afterTransferFee(sent - 1n, fee) < net + 1n, `${fee.bps}bps cap ${fee.max}: ${net}`);
    }
  // a cap bounds the fee however large the transfer
  assert.equal(transferFee(10n ** 15n, { bps: 300n, max: 5_000n }), 5_000n);
  assert.equal(beforeTransferFee(10n ** 15n, { bps: 300n, max: 5_000n }), 10n ** 15n + 5_000n);
  // none at all
  assert.deepEqual([transferFee(1_000n, null), afterTransferFee(1_000n, null), beforeTransferFee(1_000n, null)], [0n, 1_000n, 1_000n]);
});

test("tokenized stocks: every listed one gets the same $2.5k → $25k curve, inside the limits LaunchLab's stock configs set", () => {
  // the ones with a market price: a few an issuer has minted don't trade yet
  const stocks = quoteCatalog["mainnet-beta"].filter((q) => q.category === "stock" && q.refUsd > 0);
  assert.ok(stocks.length > 120, `${stocks.length} priced stock tokens`);
  assert.ok(stocks.every((q) => q.decimals === { xStocks: 8, Backpack: 6, PreStocks: 9, Tessera: 9 }[q.issuer!]));
  assert.ok(quoteCatalog.devnet.every((q) => q.category !== "stock"), "none on devnet");

  // what every stock quote's global config says on mainnet: no floor on the raise (one raw unit), any share sold on
  // the curve, at least 15% of the supply to the pool, 10M coins or more, no migrate fee
  const limits = { minRaise: 1n, minSellRate: 1n, minMigrateRate: 150_000n, minSupply: 10_000_000n, migrateFee: 0n };
  for (const q of stocks) {
    assert.equal(BigInt(Math.round(q.minRaise * 10 ** q.decimals)), 1n, `${q.symbol}: the catalog's floor is one raw unit`);
    const c = launchParams({ symbol: q.symbol, usd: q.refUsd, decimals: q.decimals }, limits);
    const usd = (raw: bigint) => (Number(raw) / 10 ** q.decimals) * q.refUsd;
    assert.ok(Math.abs(usd(c.raise) / GRADUATION_RAISE_USD - 1) < 1e-4, `${q.symbol}: raises $${usd(c.raise)}`);
    const mcap = (quote: bigint, base: bigint) => (Number(quote) / Number(base)) * 10 ** (6 - q.decimals) * 1e9 * q.refUsd;
    assert.ok(Math.abs(mcap(c.virtualQuote, c.virtualBase) / START_MCAP_USD - 1) < 1e-4, `${q.symbol}: starts at $${mcap(c.virtualQuote, c.virtualBase)}`);
    assert.ok(Math.abs(mcap(c.raise, c.supply - c.sell) / GRADUATION_MCAP_USD - 1) < 1e-4, `${q.symbol}: its pool opens at $${mcap(c.raise, c.supply - c.sell)}`);
  }
  // the cheapest and the dearest of them: the raise is a workable number of raw units either way
  const byPrice = [...stocks].sort((a, b) => a.refUsd - b.refUsd);
  for (const q of [byPrice[0]!, byPrice[byPrice.length - 1]!]) assert.ok(launchCurve(q.refUsd, q.decimals).raise > 100_000n, `${q.symbol} at $${q.refUsd}`);

  // a stock that shows eight tokens for each raw one trades at an eighth of its raw unit's price: the catalog's
  // reference price is the raw unit's, which is what a curve is priced in
  const sndk = stocks.find((q) => q.symbol === "SNDK" && q.issuer === "Backpack")!;
  assert.ok(Math.abs(sndk.uiMultiplier! - 8) < 1e-6 && sndk.refUsd > 400, `SNDK: $${sndk.refUsd} per raw unit, shown as ${sndk.uiMultiplier} tokens`);
});

test("curve swaps come out the way Raydium's own math says, down to the buy that sells it out", () => {
  const c = launchCurve(67.86, 9);
  const rates = { protocolFeeRate: new BN(2_500), platformFeeRate: new BN(27_500), creatorFeeRate: new BN(0), shareFeeRate: new BN(0), curveType: 0, transferFeeConfigA: undefined, slot: 0 };
  let s: CurveState = { virtualBase: c.virtualBase, virtualQuote: c.virtualQuote, sold: 0n, raised: 0n, sell: c.sell };
  const pool = () => ({ virtualA: bn(s.virtualBase), virtualB: bn(s.virtualQuote), realA: bn(s.sold), realB: bn(s.raised), totalSellA: bn(c.sell), totalFundRaisingB: bn(c.raise) });
  const fee = (f: { splitFee: { protocolFee: BN; platformFee: BN } }) => [int(f.splitFee.protocolFee), int(f.splitFee.platformFee)];

  for (const quoteIn of [1n, 999n, 123_456_789n, 5_000_000_000n, 31_415_926_535n]) {
    const ours = curveBuy(s, quoteIn, curveRates);
    const theirs = Curve.buyExactIn({ poolInfo: pool(), amountB: bn(quoteIn), ...rates });
    assert.deepEqual([ours.amountOut, ours.amountIn, ours.protocolFee, ours.platformFee], [int(theirs.amountA.amount), int(theirs.amountB), ...fee(theirs)], `buy ${quoteIn}`);
    assert.equal(ours.fee, (quoteIn * 3n + 99n) / 100n, "3% of what was paid, rounded up");
    s = { ...s, sold: ours.sold, raised: ours.raised };
  }
  for (const baseIn of [1_000_000n, s.sold / 3n]) {
    const ours = curveSell(s, baseIn, curveRates);
    const theirs = Curve.sellExactIn({ poolInfo: pool(), amountA: bn(baseIn), ...rates });
    assert.deepEqual([ours.amountOut, ours.protocolFee, ours.platformFee], [int(theirs.amountB), ...fee(theirs)], `sell ${baseIn}`);
    s = { ...s, sold: ours.sold, raised: ours.raised };
  }
  // far more than the curve has left: it takes only what the last coins cost
  const last = curveBuy(s, 10n ** 13n, curveRates);
  const theirs = Curve.buyExactIn({ poolInfo: pool(), amountB: bn(10n ** 13n), ...rates });
  assert.deepEqual([last.amountOut, last.amountIn], [int(theirs.amountA.amount), int(theirs.amountB)]);
  assert.ok(last.complete && last.sold === c.sell && last.amountIn < 10n ** 13n);
  // the curve raised what it set out to (integer rounding leaves it within a few lamports of the target, either side)
  assert.ok(c.raise - last.raised > -10n && c.raise - last.raised < 10n, `raised ${last.raised} of ${c.raise}`);
  const end = priceOf(curveReserves({ ...s, sold: last.sold, raised: last.raised }), 9);
  const open = priceOf({ base: c.supply - c.sell, quote: last.raised }, 9);
  assert.ok(Math.abs(end / open - 1) < 1e-9 && Math.abs(end * 1e9 * 67.86 - GRADUATION_MCAP_USD) < 0.01, "the pool opens where the curve stopped: $25k");
});

test("CPMM swaps come out the way Raydium's own math says, with the creator fee always in the quote", () => {
  const r = cpmmRates("mainnet-beta");
  const pool = { base: 226_467_211_436_238n, quote: 116_732_621_833n };
  const [trade, creator, protocol, fund] = [new BN(25_000), new BN(500), new BN(120_000), new BN(40_000)];

  const buy = cpmmBuy(pool, 2_000_000_000n, r);
  const sdkBuy = CurveCalculator.swapBaseInput(new BN("2000000000"), bn(pool.quote), bn(pool.base), trade, creator, protocol, fund, true);
  assert.deepEqual([buy.amountOut, buy.tradeFee, buy.creatorFee], [int(sdkBuy.outputAmount), int(sdkBuy.tradeFee), int(sdkBuy.creatorFee)]);
  assert.equal(buy.tradeFee + buy.creatorFee, 51_000_000n, "2.55% of the quote paid in");
  // of the trade fee only the LPs' 84% stays in the pool
  assert.equal(buy.pool.quote, pool.quote + 2_000_000_000n - 51_000_000n + 42_000_000n);

  const sell = cpmmSell(pool, 5_000_000_000_000n, r);
  const sdkSell = CurveCalculator.swapBaseInput(new BN("5000000000000"), bn(pool.base), bn(pool.quote), trade, creator, protocol, fund, false);
  assert.deepEqual([sell.amountOut, sell.tradeFee, sell.creatorFee], [int(sdkSell.outputAmount), int(sdkSell.tradeFee), int(sdkSell.creatorFee)]);
  assert.equal(sell.tradeFee, 125_000_000_000n, "a sale's 2.5% is charged in the coin");
  assert.equal(sell.quoteGross - sell.amountOut, sell.creatorFee);
  assert.ok(sell.pool.base * sell.pool.quote > pool.base * pool.quote, "fees left in the pool grow it");
});

test("protection: a loss pays its hold-time rate, capped at 5x tax and 15% of the coin's pot", () => {
  const base = { lossSol: 10, holdSeconds: 7 * 3600, rugged: false, taxPaidSol: 2, paidOnCoinSol: 0, potSol: 100 };
  // 6h+ holds earn 60%: 6 SOL, well inside 5x tax (10) and 15% of the pot (15)
  assert.deepEqual(protectionPayout(base), { tierBps: 6000, requestedSol: 6, payoutSol: 6, limit: "rate" });
  // the tax cap counts what this wallet was already paid on the coin
  const taxed = protectionPayout({ ...base, paidOnCoinSol: 7 });
  assert.equal(taxed.limit, "tax");
  assert.ok(Math.abs(taxed.payoutSol - 3) < 1e-9);
  // a small pot: one payout takes at most 15% of it, so the next seller still gets something
  const small = protectionPayout({ ...base, potSol: 10 });
  assert.equal(small.limit, "pot");
  assert.ok(Math.abs(small.payoutSol - 1.5) < 1e-9);
  // sold within 5 minutes of buying: nothing, whatever the pot
  assert.equal(protectionPayout({ ...base, holdSeconds: 60 }).payoutSol, 0);
  // rugs get the top rate whatever the hold time
  assert.equal(protectionPayout({ ...base, holdSeconds: 60, rugged: true }).tierBps, RUG_COVERAGE_BPS);
});

test("OTC limits drop to 5% after 2 days without fees", () => {
  const now = 10_000_000;
  assert.equal(otcActivityBps(0, now), 0);
  assert.equal(otcActivityBps(now - 3600, now), 10_000);
  assert.equal(otcActivityBps(now - 2 * 86_400, now), 10_000);
  assert.equal(otcActivityBps(now - 2 * 86_400 - 1, now), otcPolicy.floorBps);
  assert.equal(otcPolicy.floorBps, 500);
  assert.equal(otcActivityBps(now - 90 * 86_400, now), otcPolicy.floorBps);
});
