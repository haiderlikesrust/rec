import { CURVE_SOLD_SHARE, GRADUATION_MCAP_USD, GRADUATION_RAISE_USD, START_MCAP_USD, TAX_BPS } from "@gantry/shared";

/*
 * The launch curve in USD terms, for the form's first-buy estimate. It is the same constant-product curve for every
 * pair (packages/shared/src/quotes.ts): a virtual base reserve of supply x BASE, and a virtual quote reserve that
 * starts at QUOTE0 dollars. The chain does the real maths at launch; everything here is shown with an "about" sign.
 */

/** The virtual base reserve as a multiple of the supply. */
const BASE = GRADUATION_MCAP_USD / (GRADUATION_MCAP_USD - START_MCAP_USD);
/** The virtual quote reserve at launch, in USD. */
const QUOTE0 = START_MCAP_USD * BASE;

/** What it costs to buy the whole curve, fee included, in USD. */
export const CURVE_COST_USD = GRADUATION_RAISE_USD / (1 - TAX_BPS / 10_000);

/** The share of the supply (0..1) bought by `usd` of buys from the curve's start, the fee taken off first. */
export function curveAfter(usd: number) {
  const net = Math.max(0, Number.isFinite(usd) ? usd : 0) * (1 - TAX_BPS / 10_000);
  const share = Math.min(CURVE_SOLD_SHARE, BASE * (1 - QUOTE0 / (QUOTE0 + net)));
  return { share, full: share >= CURVE_SOLD_SHARE - 1e-9 };
}
