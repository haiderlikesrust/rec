import {
  CURVE_SOLD_SHARE,
  ENTRY_RENT_LAMPORTS,
  FLEET,
  GRADUATION_MCAP_USD,
  GRADUATION_RAISE_USD,
  LAMPORTS_PER_SOL,
  START_MCAP_USD,
  TAX_BPS,
  feeBreakdown,
  otcPolicy,
  quoteCatalog,
  type Venue,
} from "@gantry/shared";

/**
 * Every number the guide prints, derived once from the shared policy code so the page cannot drift from what the
 * backend does. The guide describes mainnet; devnet trades on a different pool tier (see CPMM_TIER).
 */
export const CLUSTER = "mainnet-beta" as const;

/** A coin's fixed supply (the backend's SUPPLY in backend/src/curve.ts). */
export const SUPPLY = 1_000_000_000;

export const fee: Record<Venue, ReturnType<typeof feeBreakdown>> = {
  curve: feeBreakdown("curve", CLUSTER),
  cpmm: feeBreakdown("cpmm", CLUSTER),
};

/** How fast a graduated coin fills the two wallets compared with the curve, per dollar traded, in percent. */
export const graduatedPacePct = Math.round((fee.cpmm.bucketsBps / fee.curve.bucketsBps) * 100);

/**
 * Basis points as a percentage. Exact values drop trailing zeros (`3%`, `0.25%`); a value that had to be rounded
 * keeps its decimals and is marked (`≈0.40%`).
 */
export function pct(bps: number, digits = 2) {
  const v = bps / 100;
  const fixed = v.toFixed(digits);
  if (Math.abs(Number(fixed) - v) > 1e-9) return `≈${fixed}%`;
  return `${fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
}

/** Whole dollars with separators, cents only when there are any. */
export function dollars(n: number) {
  const cents = Math.round(n * 100) % 100 !== 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** A count of coins: 759.7M */
export const millions = (n: number) => `${(n / 1e6).toFixed(1)}M`;

/** A fraction as a percentage with two decimals: 75.97% */
export const share = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/** A SOL amount without trailing zeros: 0.102 SOL */
export const solAmount = (v: number, digits = 3) => `${Number(v.toFixed(digits))} SOL`;

// ---------------------------------------------------------------- the curve

const p0 = START_MCAP_USD / SUPPLY;
const p1 = GRADUATION_MCAP_USD / SUPPLY;
/** The virtual reserves a constant-product curve from p0 to p1 starts with, the quote side valued in USD. */
const virtualBase = (SUPPLY * p1) / (p1 - p0);
const virtualQuoteUsd = virtualBase * p0;

const solQuote = quoteCatalog[CLUSTER].find((q) => q.symbol === "SOL")!;

export const curve = {
  startPriceUsd: p0,
  graduationPriceUsd: p1,
  multiple: GRADUATION_MCAP_USD / START_MCAP_USD,
  soldShare: CURVE_SOLD_SHARE,
  /** the same share as a whole percentage, for running text */
  soldPct: Math.round(CURVE_SOLD_SHARE * 100),
  soldCoins: SUPPLY * CURVE_SOLD_SHARE,
  poolCoins: SUPPLY * (1 - CURVE_SOLD_SHARE),
  raiseUsd: GRADUATION_RAISE_USD,
  /** the raise to the nearest hundred dollars, for running text */
  raiseRoundUsd: Math.round(GRADUATION_RAISE_USD / 100) * 100,
  /** Raydium's floor on a SOL curve's raise, in SOL... */
  solMinRaise: solQuote.minRaise,
  /** ...and the SOL price above which a full curve raises less than that, so SOL launches pause. */
  solCeilingUsd: Math.round(GRADUATION_RAISE_USD / solQuote.minRaise / 10) * 10,
};

// ---------------------------------------------------------------- copies

/** Coins a first buy of `usd` gets on a new curve, after the curve's fee: x·y = k on the virtual reserves. */
function firstBuyCoins(usd: number) {
  const net = usd * (1 - TAX_BPS / 10_000);
  return (net * virtualBase) / (virtualQuoteUsd + net);
}

/** Share of a copy's supply its entry buys at launch, in percent. */
export const entrySupplyPct = (firstBuyCoins(FLEET.entryUsd) / SUPPLY) * 100;

/** Rent a copy pays for the token accounts of its entry's recipients, in SOL. */
export const entryRentSol = ENTRY_RENT_LAMPORTS / LAMPORTS_PER_SOL;

// ---------------------------------------------------------------- OTC reserve

export const otc = {
  creditX: otcPolicy.creditMultiplierBps / 10_000,
  twapMinutes: otcPolicy.twapSeconds / 60,
  idleDays: otcPolicy.activeSeconds / 86_400,
};
