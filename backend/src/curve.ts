import {
  CPMM_TIER,
  GRADUATION_MCAP_USD,
  PLATFORM_FEE_BPS,
  RAYDIUM_CPMM_FUND_SHARE_BPS,
  RAYDIUM_CPMM_PROTOCOL_SHARE_BPS,
  RAYDIUM_CREATOR_FEE_SHARE_BPS,
  RAYDIUM_CURVE_FEE_BPS,
  START_MCAP_USD,
  type Cluster,
} from "@gantry/shared";

/**
 * The two pools a coin trades in, as integer math in raw units, rounded the way Raydium's programs round. The demo
 * simulator trades on this and the chain engine uses it to pick a launch's numbers; live quotes come from the SDK,
 * and the tests hold the two to the same results.
 *
 * Before graduation: a LaunchLab constant-product curve. The pool prices as if it held `virtualBase` coins and
 * `virtualQuote` quote before anyone bought, so with x = virtualBase − sold and y = virtualQuote + raised, x·y stays
 * constant. It completes once `sell` coins are sold; the rest of the supply and everything raised (less LaunchLab's
 * migrate fee) open a Raydium CPMM pool at the price the curve ended on.
 */

export const SUPPLY = 1_000_000_000;
export const COIN_DECIMALS = 6;
export const SUPPLY_RAW = BigInt(SUPPLY) * 10n ** BigInt(COIN_DECIMALS);

/** Raydium's rates are parts per million. */
const RATE = 1_000_000n;
export const ppm = (bps: number) => BigInt(Math.round(bps * 100));
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export type LaunchCurve = { supply: bigint; sell: bigint; raise: bigint; virtualBase: bigint; virtualQuote: bigint };

/**
 * A quote's own fee on every transfer of it (Token-2022's transfer fee): `bps` of the amount, rounded up, at most
 * `max` raw units, kept back by the mint out of what arrives. Null for a quote without one. Both pools trade on
 * what arrived, so on such a pair:
 *  - a buyer sends an amount and the pool prices what's left of it; a seller is sent the pool's payout and keeps
 *    what's left of that;
 *  - the platform fee of a curve trade loses it twice on its way to the fee wallet: into the platform's vault when
 *    the trade happens, and out of it when the vault is claimed.
 */
export type TransferFee = { bps: bigint; max: bigint } | null;

export function transferFee(amount: bigint, fee: TransferFee): bigint {
  if (!fee || fee.bps <= 0n || amount <= 0n) return 0n;
  const cut = ceilDiv(amount * fee.bps, 10_000n);
  return cut > fee.max ? fee.max : cut;
}
/** What arrives of `amount` sent. */
export const afterTransferFee = (amount: bigint, fee: TransferFee) => amount - transferFee(amount, fee);
/** The least that has to be sent for `net` to arrive, the way the token program inverts its fee. */
export function beforeTransferFee(net: bigint, fee: TransferFee): bigint {
  if (!fee || fee.bps <= 0n || net <= 0n) return net;
  if (fee.bps >= 10_000n) return net + fee.max;
  const gross = ceilDiv(net * 10_000n, 10_000n - fee.bps);
  return gross - net > fee.max ? net + fee.max : gross;
}

/**
 * A launch's numbers for a quote worth `quoteUsd`: with p0 and p1 the prices at START_MCAP_USD and
 * GRADUATION_MCAP_USD, the virtual base is S·p1/(p1−p0), the curve sells that times (1−√(p0/p1)) (≈75.97% of the
 * supply) and raises p1 times what's left (≈$6k), so the CPMM pool opens exactly at p1. A migrate fee, taken out
 * of the raise, is added on top so the pool still opens there.
 */
export function launchCurve(quoteUsd: number, quoteDecimals: number, migrateFee = 0n, supply = SUPPLY_RAW): LaunchCurve {
  const s = Number(supply);
  // raw quote per raw coin
  const p0 = (START_MCAP_USD / quoteUsd) * 10 ** quoteDecimals / s;
  const p1 = (GRADUATION_MCAP_USD / quoteUsd) * 10 ** quoteDecimals / s;
  const fee = Number(migrateFee);
  const virtualBase = ((s + fee / p1) * p1) / (p1 - p0);
  const sell = BigInt(Math.floor(virtualBase * (1 - Math.sqrt(p0 / p1))));
  const raise = BigInt(Math.ceil(p1 * (s - Number(sell)) + fee));
  return { supply, sell, raise, ...virtualReserves(supply, sell, raise, migrateFee) };
}

/** The virtual reserves LaunchLab derives from a launch's three numbers, in its own integer steps. */
export function virtualReserves(supply: bigint, sell: bigint, raise: bigint, migrateFee = 0n) {
  const left = supply - sell;
  const net = raise - migrateFee;
  const denominator = (net * sell) / left - raise;
  return { virtualBase: (net * sell * sell) / left / denominator, virtualQuote: (raise * raise) / denominator };
}

export type Reserves = { base: bigint; quote: bigint };

/** Constant product: what `amountIn` buys, rounded down, and what `amountOut` costs, rounded up. */
export const swapOut = (amountIn: bigint, reserveIn: bigint, reserveOut: bigint) => (amountIn * reserveOut) / (reserveIn + amountIn);
export const swapIn = (amountOut: bigint, reserveIn: bigint, reserveOut: bigint) => ceilDiv(reserveIn * amountOut, reserveOut - amountOut);

/** Quote per coin, in whole units. */
export const priceOf = (r: Reserves, quoteDecimals: number) => (Number(r.quote) / Number(r.base)) * 10 ** (COIN_DECIMALS - quoteDecimals);

// ---------------------------------------------------------------- the curve (LaunchLab)

export type CurveState = { virtualBase: bigint; virtualQuote: bigint; sold: bigint; raised: bigint; sell: bigint };
/** LaunchLab's fees, each a share of the quote side: Raydium's protocol fee and the platform's. */
export type CurveRates = { protocol: bigint; platform: bigint };
export type CurveFill = {
  /** quote paid in, fee included (a buy that completes the curve uses less than it was given), or coins sold */
  amountIn: bigint;
  /** coins bought, or quote received after the fee */
  amountOut: bigint;
  fee: bigint;
  protocolFee: bigint;
  platformFee: bigint;
  sold: bigint;
  raised: bigint;
  complete: boolean;
};

export const curveReserves = (s: CurveState): Reserves => ({ base: s.virtualBase - s.sold, quote: s.virtualQuote + s.raised });

function splitCurveFee(fee: bigint, r: CurveRates) {
  const platformFee = (fee * r.platform) / (r.protocol + r.platform);
  return { protocolFee: fee - platformFee, platformFee };
}

export function curveBuy(s: CurveState, quoteIn: bigint, r: CurveRates): CurveFill {
  const rate = r.protocol + r.platform;
  const pool = curveReserves(s);
  let amountIn = quoteIn;
  let fee = ceilDiv(quoteIn * rate, RATE);
  let net = quoteIn - fee;
  let out = swapOut(net, pool.quote, pool.base);
  const left = s.sell - s.sold;
  if (out > left) {
    // the curve has this much left: take only what it costs
    out = left;
    net = swapIn(out, pool.quote, pool.base);
    amountIn = ceilDiv(net * RATE, RATE - rate);
    fee = amountIn - net;
  }
  const sold = s.sold + out;
  return { amountIn, amountOut: out, fee, ...splitCurveFee(fee, r), sold, raised: s.raised + net, complete: sold >= s.sell };
}

export function curveSell(s: CurveState, baseIn: bigint, r: CurveRates): CurveFill {
  const pool = curveReserves(s);
  const gross = swapOut(baseIn, pool.base, pool.quote);
  const fee = ceilDiv(gross * (r.protocol + r.platform), RATE);
  return { amountIn: baseIn, amountOut: gross - fee, fee, ...splitCurveFee(fee, r), sold: s.sold - baseIn, raised: s.raised - gross, complete: false };
}

// ---------------------------------------------------------------- after graduation (CPMM)

/**
 * A CPMM tier's rates. The trade fee comes off the input and is shared between the pool's LPs (it stays in the pool),
 * Raydium (`protocolShare`) and its treasury (`fundShare`). The creator fee is charged on top, in the quote: off the
 * input of a buy, off the output of a sell. Raydium keeps `creatorShare` of it when it is collected.
 */
export type CpmmRates = { trade: bigint; creator: bigint; protocolShare: bigint; fundShare: bigint; creatorShare: bigint };
export type CpmmFill = {
  amountOut: bigint;
  /** in the input token: quote on a buy, the coin on a sell */
  tradeFee: bigint;
  /** always in the quote */
  creatorFee: bigint;
  /** the quote side of the trade before the creator fee came off a sale */
  quoteGross: bigint;
  pool: Reserves;
};

/** The part of a trade fee that stays in the pool for its LPs. */
export const lpShare = (tradeFee: bigint, r: CpmmRates) => tradeFee - (tradeFee * r.protocolShare) / RATE - (tradeFee * r.fundShare) / RATE;

export function cpmmBuy(pool: Reserves, quoteIn: bigint, r: CpmmRates): CpmmFill {
  const fee = ceilDiv(quoteIn * (r.trade + r.creator), RATE);
  const creatorFee = (fee * r.creator) / (r.trade + r.creator);
  const tradeFee = fee - creatorFee;
  const net = quoteIn - fee;
  const out = swapOut(net, pool.quote, pool.base);
  return { amountOut: out, tradeFee, creatorFee, quoteGross: quoteIn, pool: { base: pool.base - out, quote: pool.quote + net + lpShare(tradeFee, r) } };
}

export function cpmmSell(pool: Reserves, baseIn: bigint, r: CpmmRates): CpmmFill {
  const tradeFee = ceilDiv(baseIn * r.trade, RATE);
  const net = baseIn - tradeFee;
  const gross = swapOut(net, pool.base, pool.quote);
  const creatorFee = ceilDiv(gross * r.creator, RATE);
  return { amountOut: gross - creatorFee, tradeFee, creatorFee, quoteGross: gross, pool: { base: pool.base + net + lpShare(tradeFee, r), quote: pool.quote - gross } };
}

/**
 * A CPMM trade's fee in quote terms: all of it, Raydium's cut, and what the fee wallet can expect in the quote. LP
 * fees are harvested as LP tokens, which pay out both sides of the pool in equal value: half in the quote, half in
 * the coin (burned). An estimate: the harvest itself says what arrived.
 */
export function cpmmFees(tradeFeeQuote: bigint, creatorFee: bigint, r: CpmmRates) {
  const lp = lpShare(tradeFeeQuote, r);
  const creatorCut = (creatorFee * r.creatorShare) / RATE;
  return { tax: tradeFeeQuote + creatorFee, protocol: tradeFeeQuote - lp + creatorCut, harvestable: lp / 2n + creatorFee - creatorCut };
}

// ---------------------------------------------------------------- the rates fees.ts describes (the chain engine reads the live ones)

export const curveRates: CurveRates = { protocol: ppm(RAYDIUM_CURVE_FEE_BPS), platform: ppm(PLATFORM_FEE_BPS) };
export const cpmmRates = (cluster: Cluster): CpmmRates => ({
  trade: ppm(CPMM_TIER[cluster].tradeFeeBps),
  creator: ppm(CPMM_TIER[cluster].creatorFeeBps),
  protocolShare: ppm(RAYDIUM_CPMM_PROTOCOL_SHARE_BPS),
  fundShare: ppm(RAYDIUM_CPMM_FUND_SHARE_BPS),
  creatorShare: ppm(RAYDIUM_CREATOR_FEE_SHARE_BPS),
});
