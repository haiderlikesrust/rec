/**
 * Single-segment bonding curve, in whole units. A Meteora DBC curve built with `buildCurveWithMarketCap` is
 * concentrated liquidity L between the start and migration sqrt prices: Δquote = L·Δ√P and Δbase = L·Δ(1/√P).
 * L is chosen so the base sold on the curve plus the base deposited into DAMM v2 at the migration price is the
 * whole supply. The demo simulator trades on this; the real pools do the same math on-chain.
 */

export const SUPPLY = 1_000_000_000;
export const COIN_DECIMALS = 6;
export const SUPPLY_RAW = BigInt(SUPPLY) * 10n ** BigInt(COIN_DECIMALS);

export type CurveState = { sqrtPrice: number; liquidity: number; sqrtStart: number; sqrtMig: number };

export function curveFor(startMcap: number, gradMcap: number, supply = SUPPLY) {
  const p0 = startMcap / supply;
  const pm = gradMcap / supply;
  const liquidity = (supply * Math.sqrt(p0) * pm) / (pm - p0);
  return {
    sqrtStart: Math.sqrt(p0),
    sqrtMig: Math.sqrt(pm),
    liquidity,
    /** quote in the curve when it completes, whole quote units */
    threshold: liquidity * (Math.sqrt(pm) - Math.sqrt(p0)),
  };
}

export const priceOf = (s: CurveState) => s.sqrtPrice * s.sqrtPrice;
/** Quote held by the curve at its current price. */
export const quoteReserve = (s: CurveState) => Math.max(0, s.liquidity * (s.sqrtPrice - s.sqrtStart));

/** Buy with `quoteIn` whole quote units (after fee). Before graduation the curve stops at the migration price. */
export function buy(s: CurveState, quoteIn: number, capped: boolean) {
  let next = s.sqrtPrice + quoteIn / s.liquidity;
  let used = quoteIn;
  if (capped && next > s.sqrtMig) {
    next = s.sqrtMig;
    used = (next - s.sqrtPrice) * s.liquidity;
  }
  const out = s.liquidity * (1 / s.sqrtPrice - 1 / next);
  return { out, used, next };
}

/** Sell `baseIn` whole coins. The price can't fall below the start price. */
export function sell(s: CurveState, baseIn: number) {
  let next = 1 / (1 / s.sqrtPrice + baseIn / s.liquidity);
  if (next < s.sqrtStart) next = s.sqrtStart;
  const out = s.liquidity * (s.sqrtPrice - next);
  return { out, next };
}
