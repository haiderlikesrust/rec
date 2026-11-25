import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import { LAUNCHLAB_PROGRAM_ID } from "@gantry/shared";
import { cpmmRates } from "../curve";
import { cpmmFacts, curveFacts, decodeEvents, type CpmmSwap, type CurveTrade, type LaunchEvent } from "./events";

/**
 * The fixtures are mainnet transactions (Nov 2026), cut down to what the decoder reads: account keys, instructions,
 * inner instructions and the log lines that carry program data. Every number asserted here was checked against the
 * token balances those transactions actually moved.
 */
type Fixture = {
  keys: string[];
  loaded: { writable: string[]; readonly: string[] };
  instructions: { program: number; accounts: number[]; data: string }[];
  inner: NonNullable<NonNullable<VersionedTransactionResponse["meta"]>["innerInstructions"]>;
  logs: string[];
};
function load(name: string) {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as Fixture;
  return {
    transaction: {
      message: {
        staticAccountKeys: f.keys.map((k) => new PublicKey(k)),
        compiledInstructions: f.instructions.map((ix) => ({ programIdIndex: ix.program, accountKeyIndexes: ix.accounts, data: Buffer.from(ix.data, "base64") })),
      },
    },
    meta: { innerInstructions: f.inner, logMessages: f.logs, loadedAddresses: f.loaded },
  } as unknown as VersionedTransactionResponse;
}
const events = (name: string) => decodeEvents(load(name), "mainnet-beta");

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("a LaunchLab buy, sent through a router: the trade event rides a self-CPI under the swap", () => {
  const [ev, ...rest] = events("curve-buy") as CurveTrade[];
  assert.equal(rest.length, 0);
  assert.equal(ev!.kind, "curve");
  assert.equal(ev!.pool, "ET5PWJijPWX1KkRpbgvvZNTP39CNctWaT68LPNaNsbL6");
  const f = curveFacts(ev!, 6);
  // the buyer's USDC account fell by 67,827 and their coin account rose by 3,355,083,351
  assert.deepEqual([f.isBuy, f.quoteAmount, f.tokenAmount], [true, 67_827n, 3_355_083_351n]);
  // 420 landed in the platform's fee vault, 89 in the creator's, and the pool kept 170 for Raydium
  assert.deepEqual([f.tax, f.protocol, f.claimable], [679n, 170n, 420n]);
  // the curve holds what the buyer paid less the fees
  assert.deepEqual(f.curve, { sold: 90_601_400_967n, raised: 1_814_481n, complete: false });
  assert.ok(Math.abs(f.price - (23_090_062_453 + 1_814_481) / (1_153_884_408_602_150 - 90_601_400_967)) < 1e-12, "priced off the virtual reserves");
});

test("a LaunchLab sell: the fee comes off what the curve pays out", () => {
  const [ev] = events("curve-sell") as CurveTrade[];
  const f = curveFacts(ev!, 6);
  // the seller sent 3,353,292,179 coins and received 66,429; the curve gave up 67,101
  assert.deepEqual([f.isBuy, f.tokenAmount, f.quoteAmount, f.quoteAmount - f.tax], [false, 3_353_292_179n, 67_101n, 66_429n]);
  assert.deepEqual([f.protocol, f.claimable], [168n, 252n]);
  assert.equal(f.curve!.sold, 0n, "every coin the curve had sold came back");
});

test("a launch is read off the initialize instruction, which names the mint and the platform its event leaves out", () => {
  assert.deepEqual(events("launch"), [
    {
      kind: "launch",
      creator: "8q6FCpE6nLCXXwtUzPQBVWwJp2HfoSgVjFui1xtkKHQg",
      platform: "93qzyu7Q8EYcgUGi1xdpmjkyZPoSNLEfXB6rKm4q2QMp",
      pool: "14dazXMJ9fRZGLSUJfBkdo3cGAns3tA2Ud99PN4866Ku",
      mint: "72VcPHK659RmMHdf7CdxT5uWgTiyJy4kq98wi4Akqwme",
      quote: USDC,
    } satisfies LaunchEvent,
  ]);
});

test("the buy that sells a curve out marks it complete, and Raydium's migration emits nothing to index", () => {
  const [ev] = events("curve-complete") as CurveTrade[];
  assert.equal(ev!.pool, "14dazXMJ9fRZGLSUJfBkdo3cGAns3tA2Ud99PN4866Ku");
  assert.equal(ev!.complete, true);
  assert.equal(ev!.sold, ev!.amountOut, "one buy took the whole curve");
  assert.deepEqual(events("migrate"), []);
});

test("CPMM swaps are read from the pool program's log, and leave the reserves the next swap starts from", () => {
  // the graduated pool of the coin above, on Raydium's 0.25% tier with its 0.05% creator fee
  const rates = { ...cpmmRates("mainnet-beta"), trade: 2_500n, creator: 500n };
  const coin = "72VcPHK659RmMHdf7CdxT5uWgTiyJy4kq98wi4Akqwme";
  const next = (name: string) => (events(name) as CpmmSwap[])[0]!;

  const [sell] = events("cpmm-sell") as CpmmSwap[];
  assert.equal(sell!.kind, "cpmm");
  const s = cpmmFacts(sell!, coin, USDC, 6, rates)!;
  // the seller received 259,660 after a 130 creator fee, taken in the quote from what the pool paid out
  assert.deepEqual([s.isBuy, s.tokenAmount, s.quoteAmount], [false, 434_674_388_919_382n, 259_790n]);
  assert.equal(sell!.creatorFeeOnInput, false);
  // the 0.25% trade fee was charged in the coin: valued in the quote it is 649, plus the creator's 130
  assert.equal(s.tax, 779n);
  const after = next("cpmm-sell-next");
  assert.deepEqual(s.reserves, { base: after.inputVaultBefore, quote: after.outputVaultBefore });

  const [buy] = events("cpmm-buy") as CpmmSwap[];
  const b = cpmmFacts(buy!, coin, USDC, 6, rates)!;
  // on a buy both fees come off the quote paid in: 301 for the trade fee, 60 for the creator
  assert.deepEqual([b.isBuy, b.quoteAmount, b.tokenAmount, b.tax], [true, 120_321n, 15_099_097_875_905n, 361n]);
  assert.equal(buy!.creatorFeeOnInput, true);
  // Raydium keeps 16% of the trade fee and 5% of the creator fee; half of the LPs' share is expected in the quote
  assert.deepEqual([b.protocol, b.harvestable], [51n, 183n]);
  const afterBuy = next("cpmm-buy-next");
  assert.deepEqual(b.reserves, { base: afterBuy.inputVaultBefore, quote: afterBuy.outputVaultBefore });

  assert.equal(cpmmFacts(buy!, "So11111111111111111111111111111111111111112", USDC, 6, rates), null, "a swap of another pair isn't ours");
});

/**
 * Decodes whatever LaunchLab is doing on mainnet right now (read-only). Needs network access, so it only runs with
 * NETWORK_TESTS=1; set MAINNET_RPC to use your own RPC instead of the rate-limited public one.
 */
test("on a quote with a transfer fee the books follow the trader's wallet and the platform's vault, not the event's round numbers", () => {
  // Four mainnet trades (Nov 2026) on coins paired with a pre-IPO stock token whose mint keeps 1% of every transfer.
  // The amounts asserted are the token balances those transactions moved.
  const fee = { bps: 100n, max: 2n ** 64n - 1n };
  const curve = (over: Partial<CurveTrade>): CurveTrade => ({ kind: "curve", pool: "p", isBuy: true, amountIn: 0n, amountOut: 0n, protocolFee: 0n, platformFee: 0n, creatorFee: 0n, shareFee: 0n, virtualBase: 2n, virtualQuote: 1n, sold: 0n, raised: 0n, complete: false, ...over });

  // a buy: 577,972 reached the curve's vault, of which 5,780 went on to the platform's vault, where 5,722 arrived
  const buy = curveFacts(curve({ amountIn: 577_972n, amountOut: 137_076_699_835n, protocolFee: 1_445n, platformFee: 5_780n }), 9, fee);
  assert.deepEqual([buy.quoteAmount, buy.tax, buy.claimable], [583_811n, 7_225n, 5_722n], "the buyer sent 1% more than landed; the platform fee arrived 1% short");
  // a sale: the curve sent 87,203,552 after its fees, the platform's vault gained 874,243
  const sell = curveFacts(curve({ isBuy: false, amountIn: 17_965_563_043_765n, amountOut: 87_203_552n, protocolFee: 220_769n, platformFee: 883_074n }), 9, fee);
  assert.deepEqual([sell.quoteAmount - sell.tax, sell.claimable], [86_331_516n, 874_243n], "the seller kept 99% of what was sent");
  // without a fee the same events read as they are
  assert.deepEqual([curveFacts(curve({ amountIn: 577_972n, platformFee: 5_780n }), 9).quoteAmount, curveFacts(curve({ amountIn: 577_972n, platformFee: 5_780n }), 9).claimable], [577_972n, 5_780n]);

  // CPMM names the transfer fee itself: a buy that landed 3,087,813 cost 31,191 more; a sale of 3,738,014 arrived 37,381 short
  const rates = cpmmRates("mainnet-beta");
  const swap = (over: Partial<CpmmSwap>): CpmmSwap => ({ kind: "cpmm", pool: "p", inputMint: "quote", outputMint: "coin", inputVaultBefore: 10_935_877_575n, outputVaultBefore: 957_735_720_408_632n, inputAmount: 0n, outputAmount: 0n, inputTransferFee: 0n, outputTransferFee: 0n, tradeFee: 0n, creatorFee: 0n, creatorFeeOnInput: true, ...over });
  const bought = cpmmFacts(swap({ inputAmount: 3_087_813n, outputAmount: 267_643_515_401n, inputTransferFee: 31_191n, tradeFee: 927n, creatorFee: 29_952n }), "coin", "quote", 9, rates)!;
  assert.equal(bought.quoteAmount, 3_119_004n);
  assert.equal(bought.reserves!.quote, 10_938_935_288n, "the pool's side grew by what landed, not by what was sent: the next swap on it started from exactly this");
  const sold = cpmmFacts(swap({ inputMint: "coin", outputMint: "quote", inputVaultBefore: 957_468_076_893_231n, outputVaultBefore: 10_938_935_288n, inputAmount: 330_600_584_184n, outputAmount: 3_738_014n, outputTransferFee: 37_381n, tradeFee: 99_180_176n, creatorFee: 36_614n, creatorFeeOnInput: false }), "coin", "quote", 9, rates)!;
  assert.equal(sold.quoteAmount, 3_738_014n + 36_614n - 37_381n);
});

test("decodes live LaunchLab trades from mainnet", { skip: process.env.NETWORK_TESTS !== "1" }, async () => {
  const conn = new Connection(process.env.MAINNET_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const sigs = await conn.getSignaturesForAddress(new PublicKey(LAUNCHLAB_PROGRAM_ID["mainnet-beta"]), { limit: 25 });
  let trades = 0;
  for (const s of sigs.filter((x) => !x.err).slice(0, 12)) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
    if (!tx) continue;
    for (const ev of decodeEvents(tx, "mainnet-beta")) {
      if (ev.kind !== "curve") continue;
      trades++;
      const f = curveFacts(ev, 9);
      assert.ok(f.quoteAmount > 0n && f.tokenAmount > 0n, `amounts in ${s.signature}`);
      // the fee is a sane share of the trade: Raydium's 0.25% plus a platform fee LaunchLab caps at 5%, a creator fee and a referral
      const bps = Number((f.tax * 10_000n) / f.quoteAmount);
      assert.ok(f.tax < f.quoteAmount && bps >= 1 && bps <= 700, `fee ${bps} bps in ${s.signature}`);
      console.log(`${f.isBuy ? "buy " : "sell"} quote=${f.quoteAmount} tokens=${f.tokenAmount} fee=${bps}bps`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(trades > 0, "expected at least one trade among recent LaunchLab transactions");
});
