import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import { BaseFeeMode, getFeeSchedulerParams, validateConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  GRADUATION_MCAP_USD,
  SNIPE,
  START_MCAP_USD,
  TAX_BPS,
  buyTaxBpsAt,
  otcActivityBps,
  otcPolicy,
  planProtectionEpoch,
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

test("protection: coverage scales with what the coin paid into the fund, capped at 5x tax", () => {
  const losses = [
    { coin: "A", symbol: "A", wallet: "w1", lossSol: 10, holdSeconds: 7 * 3600, taxPaidSol: 1, rugged: false },
    { coin: "B", symbol: "B", wallet: "w2", lossSol: 10, holdSeconds: 7 * 3600, taxPaidSol: 0.1, rugged: false },
  ];
  // A paid 90% of the fund, B 10%; budget 2 SOL
  const plan = planProtectionEpoch(losses, { A: 9, B: 1 }, 10, 2);
  const w1 = plan.wallets.get("w1")!.totalSol;
  const w2 = plan.wallets.get("w2")!.totalSol;
  assert.ok(Math.abs(w1 - 1.8) < 1e-9, `A gets its 90% slice of the budget: ${w1}`); // asked 6, allotted 1.8
  assert.ok(Math.abs(w2 - 0.2) < 1e-9, `B is capped by its slice: ${w2}`); // asked min(6, 0.5) = 0.5, allotted 0.2
  assert.ok(plan.totalSol <= 2 + 1e-9);
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
