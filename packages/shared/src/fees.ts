import { brand } from "./brand";
import type { Cluster } from "./solana";

/**
 * Fee policy, shared by the backend (fee router, protection payouts), the API and the UI.
 *
 * Until it graduates a coin trades on a Raydium LaunchLab bonding curve, where every buy and sell pays 3% on the
 * quote side: Raydium's protocol fee plus the platform fee that makes up the rest, and 0% to the creator. The platform
 * fee collects in a vault only the backend's fee wallet can claim; it is converted to SOL and split in half: the OTC
 * reserve and the protection fund (Heat Shield on the site).
 *
 * After graduation it trades in a Raydium CPMM pool whose whole LP is locked for the fee wallet. The fee there is
 * the pool tier's (see CPMM_TIER): most of it stays in the pool as LP fees, which the fee wallet harvests half in
 * the quote (split like the rest) and half in the coin itself (burned), and a small quote-only creator fee goes to
 * the fee wallet directly.
 */
export const TAX_BPS = 300;
/** Raydium's protocol fee on every LaunchLab trade (the global config's trade_fee_rate; the backend reads it live). */
export const RAYDIUM_CURVE_FEE_BPS = 25;
/** The fee set on the LaunchLab platform config: what is left of the 3%. */
export const PLATFORM_FEE_BPS = TAX_BPS - RAYDIUM_CURVE_FEE_BPS;
/** LaunchLab's ceiling on a platform's fee. */
export const RAYDIUM_PLATFORM_FEE_CAP_BPS = 500;

export type Venue = "curve" | "cpmm";

/**
 * The CPMM fee tier graduated pools trade on: of the tiers Raydium has, the one whose total fee is closest to 3%.
 * A tier charges a trade fee (shared by the pool's LPs, Raydium and its treasury) plus a separate creator fee, which
 * these pools are set to pay in the quote token only and which goes to the fee wallet as their creator of record.
 * Devnet has fewer tiers, so the closest one there is not the same.
 */
export const CPMM_TIER: Record<Cluster, { index: number; config: string; tradeFeeBps: number; creatorFeeBps: number }> = {
  "mainnet-beta": { index: 7, config: "ESLj2Rzmvn3RhDo4Z18hY1wYmGyC9xM4ZtRXhvoFkDAi", tradeFeeBps: 250, creatorFeeBps: 5 },
  devnet: { index: 4, config: "5Gt9qrPJ6FVe9VHtwF2W2JrFR6p9jmx4DxBkgfPdaApk", tradeFeeBps: 400, creatorFeeBps: 25 },
};
/** Raydium's cut of every CPMM trade fee: 12% to the protocol and 4% to its treasury. The other 84% stays with the LPs. */
export const RAYDIUM_CPMM_PROTOCOL_SHARE_BPS = 1200;
export const RAYDIUM_CPMM_FUND_SHARE_BPS = 400;
/** Raydium's cut of the CPMM creator fee, taken when the fee is collected. */
export const RAYDIUM_CREATOR_FEE_SHARE_BPS = 500;

/**
 * Where a trade's fee goes, in bps of the trade (not whole numbers after graduation): the whole fee, Raydium's cut,
 * what reaches the two buckets in the quote, and what comes back in the coin and is burned.
 */
export function feeBreakdown(venue: Venue, cluster: Cluster = "mainnet-beta") {
  if (venue === "curve") return { taxBps: TAX_BPS, raydiumBps: RAYDIUM_CURVE_FEE_BPS, bucketsBps: PLATFORM_FEE_BPS, burnedBps: 0 };
  const tier = CPMM_TIER[cluster];
  const lp = (tier.tradeFeeBps * (10_000 - RAYDIUM_CPMM_PROTOCOL_SHARE_BPS - RAYDIUM_CPMM_FUND_SHARE_BPS)) / 10_000;
  const creator = (tier.creatorFeeBps * (10_000 - RAYDIUM_CREATOR_FEE_SHARE_BPS)) / 10_000;
  const taxBps = tier.tradeFeeBps + tier.creatorFeeBps;
  // LP fees are harvested as LP tokens, which pay out both sides of the pool in equal value
  return { taxBps, raydiumBps: taxBps - lp - creator, bucketsBps: lp / 2 + creator, burnedBps: lp / 2 };
}

/** Share of a trade's fee that reaches the buckets, in bps of the fee: about 91.7% on the curve, 43% after graduation. */
export const communityShareBps = (venue: Venue = "curve", cluster: Cluster = "mainnet-beta") => {
  const f = feeBreakdown(venue, cluster);
  return (f.bucketsBps / f.taxBps) * 10_000;
};

/**
 * LaunchLab charges nothing to create a pool. A launch pays Solana rent for the coin's accounts (mint, pool, two
 * vaults and its Metaplex metadata, whose program keeps 0.01 SOL): about this much, measured on a mainnet launch.
 */
export const LAUNCH_RENT_SOL = 0.021;

export type BucketKey = "otcReserve" | "protection";

export const buckets: {
  key: BucketKey;
  bps: number;
  label: string;
  short: string;
  paidIn: string;
  blurb: string;
}[] = [
  {
    key: "protection",
    bps: 5000,
    label: brand.shield,
    short: brand.shield,
    paidIn: "SOL",
    blurb: "Covers realized losses: up to 70%, by hold time and by how much the coin paid into the fund.",
  },
  {
    key: "otcReserve",
    bps: 5000,
    label: "OTC reserve",
    short: "OTC reserve",
    paidIn: "SOL",
    blurb: "A SOL wallet you can sell coins into without slippage. Coins that pay more get higher limits.",
  },
];

/** Split an amount of fees in half (remainder to protection, so nothing is lost to rounding). */
export function splitFees(amount: number): Record<BucketKey, number> {
  const otcReserve = amount / 2;
  return { otcReserve, protection: amount - otcReserve };
}

/** splitFees for raw token amounts. */
export function splitRaw(amount: bigint): Record<BucketKey, bigint> {
  const otcReserve = amount / 2n;
  return { otcReserve, protection: amount - otcReserve };
}

/** Volume needed to generate `fees` at the curve's 3%. */
export const volumeForFees = (fees: number) => fees / (TAX_BPS / 10_000);

// ---------------------------------------------------------------- OTC reserve policy
//
// The OTC reserve is a backend-controlled SOL wallet that only buys. Every OTC sale is one transaction signed by
// both sides (the seller and the reserve) that pays the seller and burns the coins, so it settles atomically or not
// at all and the reserve never holds coins.

export const otcPolicy = {
  /** OTC trades carry the same 3%; it goes to the fee wallet in the same transaction. */
  spreadBps: TAX_BPS,
  /** 1 SOL contributed = 2 SOL of sell capacity. */
  creditMultiplierBps: 20_000,
  /** Sells price at min(spot, TWAP). OTC opens once this much history exists. */
  twapSeconds: 15 * 60,
  /** Full limit while the coin paid fees within this window... */
  activeSeconds: 2 * 86_400,
  /** ...and only this share of its credit once it has gone that long without any. */
  floorBps: 500,
  /** One coin can never draw more than 10% of the reserve at once. */
  maxShareOfReserveBps: 1_000,
  /** One wallet can sell at most 5% of the reserve per coin per day. */
  walletDailyBps: 500,
  /** Signed OTC quotes are valid this long (and never past their blockhash). */
  quoteTtlSeconds: 60,
} as const;

/** 100% while a coin keeps paying fees, `floorBps` once it has gone `activeSeconds` without any. */
export function otcActivityBps(lastContribution: number, now: number) {
  if (lastContribution === 0) return 0;
  return now - lastContribution <= otcPolicy.activeSeconds ? 10_000 : otcPolicy.floorBps;
}

/** Current SOL sell capacity for a coin. */
export const otcSellLimitSol = (creditSol: number, activityBps: number, reserveSol: number) =>
  Math.min((creditSol * activityBps) / 10_000, (reserveSol * otcPolicy.maxShareOfReserveBps) / 10_000);

// ---------------------------------------------------------------- protection policy
//
// Realized losses are covered as they happen and paid automatically, with nothing to claim:
//  payout = loss x hold-time rate, then capped
//  - per wallet and coin at PROTECTION_CAP_X_TAX x the tax that wallet has paid on the coin, across all its payouts;
//  - at PROTECTION_PAYOUT_BPS of the coin's pot (what it paid into the fund minus what it has paid out), so a coin
//    only ever pays from its own fees, one loss can't empty it, and coins that paid little cover little.
// One source of truth for the backend (payouts) and the UI (estimates).

/** "Up to" coverage by hold time (seconds). Markets are fast, so tiers are minutes and hours. */
export const protectionTiers = [
  { minHold: 0, coverageBps: 0, label: "< 5 min" },
  { minHold: 300, coverageBps: 2500, label: "5–30 min" },
  { minHold: 1_800, coverageBps: 4500, label: "30 min – 6 h" },
  { minHold: 21_600, coverageBps: 6000, label: "6 h+" },
] as const;
/** Coins flagged as rugs get the top rate regardless of hold time. */
export const RUG_COVERAGE_BPS = 7000;
export const PROTECTION_CAP_X_TAX = 5;
/** The most one payout can take from its coin's pot. */
export const PROTECTION_PAYOUT_BPS = 1500;
/** A wallet's payouts are sent once they add up to this; anything smaller can't fund an empty account's rent. */
export const PROTECTION_MIN_PAYOUT_SOL = 0.001;

export function coverageBpsForHold(holdSeconds: number, rugged = false) {
  if (rugged) return RUG_COVERAGE_BPS;
  let bps = 0;
  for (const t of protectionTiers) if (holdSeconds >= t.minHold) bps = t.coverageBps;
  return bps;
}

/** What capped a payout: the hold-time rate itself, the 5x-tax cap, or the coin's pot. */
export type PayoutLimit = "rate" | "tax" | "pot";

/**
 * What one realized loss pays. `paidOnCoinSol` is what this wallet has already been paid on the coin, `taxPaidSol`
 * its lifetime tax on it, and `potSol` what the coin has left in the fund.
 */
export function protectionPayout(p: {
  lossSol: number;
  holdSeconds: number;
  rugged: boolean;
  taxPaidSol: number;
  paidOnCoinSol: number;
  potSol: number;
}): { tierBps: number; requestedSol: number; payoutSol: number; limit: PayoutLimit } {
  const tierBps = coverageBpsForHold(p.holdSeconds, p.rugged);
  const requestedSol = (p.lossSol * tierBps) / 10_000;
  const taxRoom = Math.max(0, p.taxPaidSol * PROTECTION_CAP_X_TAX - p.paidOnCoinSol);
  const potRoom = Math.max(0, (p.potSol * PROTECTION_PAYOUT_BPS) / 10_000);
  const payoutSol = Math.min(requestedSol, taxRoom, potRoom);
  const limit: PayoutLimit = payoutSol >= requestedSol ? "rate" : taxRoom <= potRoom ? "tax" : "pot";
  return { tierBps, requestedSol, payoutSol, limit };
}
