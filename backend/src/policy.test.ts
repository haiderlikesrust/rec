import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { BaseFeeMode, MigratedCollectFeeMode, getFeeSchedulerParams, validateConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  GRADUATION_MCAP_USD,
  RUG_COVERAGE_BPS,
  SNIPE,
  START_MCAP_USD,
  TAX_BPS,
  buyTaxBpsAt,
  otcActivityBps,
  otcPolicy,
  protectionPayout,
  splitRaw,
} from "@cook/shared";
import { configParams } from "./chain/params";
import { buy, curveFor, sell } from "./curve";

test("fee split is 10/10/30/40/10 and loses nothing to rounding", () => {
  for (const amount of [1n, 7n, 9_999n, 123_456_789n, 10n ** 18n + 3n]) {
    const s = splitRaw(amount);
    assert.equal(s.mainBuyback + s.coinBuyback + s.otcReserve + s.protection + s.airdrop, amount);
  }
  const s = splitRaw(10_000n);
  assert.deepEqual([s.protection, s.otcReserve, s.mainBuyback, s.coinBuyback, s.airdrop], [4000n, 3000n, 1000n, 1000n, 1000n]);
});

test("anti-snipe schedule mirrors the DBC exponential fee scheduler", () => {
  const p = getFeeSchedulerParams(SNIPE.startBps, SNIPE.endBps, BaseFeeMode.FeeSchedulerExponential, SNIPE.periods, SNIPE.seconds);
  const cliff = Number(p.cliffFeeNumerator.toString()) / 1e9;
  const r = Number(p.thirdFactor.toString()) / 10_000; // reduction factor
  for (let t = 0; t < SNIPE.seconds; t++) {
    const onChain = cliff * (1 - r) ** t * 10_000;
    assert.ok(Math.abs(buyTaxBpsAt(t) - onChain) <= 2, `t=${t}s ours ${buyTaxBpsAt(t)} vs DBC ${onChain.toFixed(1)}`);
  }
  assert.equal(buyTaxBpsAt(SNIPE.seconds), TAX_BPS);
  assert.equal(buyTaxBpsAt(3600), TAX_BPS);
});

test("every quote's DBC config starts at $2.5k and graduates at $30k, and Meteora's validator accepts it", () => {
  for (const [usd, decimals] of [
    [100, 9], // SOL
    [1, 6], // USDC
    [213.8, 8], // NVDAx
    [949.6, 6], // MU (Backpack)
    [1500, 9], // OPENAI (Tessera)
  ] as const) {
    const params = configParams(usd, decimals);
    const curve = curveFor(START_MCAP_USD / usd, GRADUATION_MCAP_USD / usd);
    const threshold = Number(params.migrationQuoteThreshold.toString()) / 10 ** decimals;
    // the demo curve and Meteora's curve agree on how much quote completes the curve
    assert.ok(Math.abs(threshold - curve.threshold) / curve.threshold < 0.01, `threshold ${threshold} vs ${curve.threshold}`);
    assert.ok(Math.abs(threshold * usd - 6720) < 30, `~$6.7k in the curve at graduation, got $${(threshold * usd).toFixed(0)}`);
    const fees = Keypair.generate().publicKey;
    assert.doesNotThrow(() => validateConfigParameters({ ...params, leftoverReceiver: fees }, { feeClaimer: fees }));
    assert.equal(params.creatorTradingFeePercentage, 0);
    assert.equal(params.partnerPermanentLockedLiquidityPercentage, 100);
    assert.equal(params.migratedPoolFee.poolFeeBps, TAX_BPS);
  }
});

test("quotes with a transfer fee (PreStocks, Tessera) graduate to a Compounding pool that keeps every fee claimable", () => {
  const fees = Keypair.generate().publicKey;
  const opts = { feeClaimer: fees, quoteMintHasTransferFee: true };
  // what failed a live launch: Meteora won't take a QuoteToken migrated pool for such a quote
  const plain = configParams(1001, 9);
  assert.throws(() => validateConfigParameters({ ...plain, leftoverReceiver: fees }, opts), /Compounding/);
  const params = configParams(1001, 9, true);
  assert.doesNotThrow(() => validateConfigParameters({ ...params, leftoverReceiver: fees }, opts));
  assert.equal(params.migratedPoolFee.collectFeeMode, MigratedCollectFeeMode.Compounding);
  assert.equal(params.compoundingFeeBps, 0);
  assert.equal(params.migratedPoolFee.poolFeeBps, TAX_BPS);
});

test("demo curve: buying to the threshold reaches the $30k graduation price", () => {
  const c = curveFor(START_MCAP_USD, GRADUATION_MCAP_USD); // quote = USD
  const s = { sqrtPrice: c.sqrtStart, liquidity: c.liquidity, sqrtStart: c.sqrtStart, sqrtMig: c.sqrtMig };
  const r = buy(s, c.threshold * 2, true);
  assert.ok(Math.abs(r.used - c.threshold) < 1e-6);
  assert.ok(Math.abs(r.next ** 2 * 1e9 - GRADUATION_MCAP_USD) < 1);
  // selling everything back returns the quote (no fee in the raw curve)
  const back = sell({ ...s, sqrtPrice: r.next }, r.out);
  assert.ok(Math.abs(back.out - r.used) < 1e-6);
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
