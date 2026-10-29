/**
 * Fee policy, shared by the backend (fee router, airdrops, protection epochs), the API and the UI.
 *
 * Every Recur pool is a Meteora DBC pool configured with a 3% fee taken on the quote side of every buy and sell
 * (CollectFeeMode.QuoteToken), 0% to the creator. Meteora keeps its protocol share of that fee; the rest is claimed
 * by the backend's fee wallet and split into the five buckets below. Graduated pools (DAMM v2) keep the same 3%.
 */
export const TAX_BPS = 300;
/** Meteora's protocol share of every trading fee, on DBC and on DAMM v2. */
export const METEORA_PROTOCOL_SHARE_BPS = 2000;
/** Share of Meteora's protocol fee rebated to the referral account. Swaps built by Recur name the fee wallet. */
export const METEORA_REFERRAL_SHARE_BPS = 2000;
/** Share of the 3% that reaches the buckets: 80%, or 84% when the swap carried Recur's referral account. */
export const communityShareBps = (withReferral = false) =>
  10_000 - METEORA_PROTOCOL_SHARE_BPS + (withReferral ? (METEORA_PROTOCOL_SHARE_BPS * METEORA_REFERRAL_SHARE_BPS) / 10_000 : 0);
/** One-off fee, in SOL, paid to the DBC config when a coin launches. Meteora keeps 10%; the rest funds the platform buyback. */
export const LAUNCH_FEE_SOL = 0.01;

export type BucketKey = "mainBuyback" | "coinBuyback" | "otcReserve" | "protection" | "airdrop";

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
    bps: 4000,
    label: "Protection fund",
    short: "Protection",
    paidIn: "SOL",
    blurb: "Covers realized losses: up to 70%, by hold time and by how much the coin paid into the fund.",
  },
  {
    key: "otcReserve",
    bps: 3000,
    label: "OTC reserve",
    short: "OTC reserve",
    paidIn: "SOL",
    blurb: "A SOL wallet you can sell coins into without slippage. Coins that pay more get higher limits.",
  },
  {
    key: "mainBuyback",
    bps: 1000,
    label: "Platform buyback & burn",
    short: "Platform burn",
    paidIn: "SOL → platform token",
    blurb: "Buys the platform token on the open pool and burns it.",
  },
  {
    key: "coinBuyback",
    bps: 1000,
    label: "Coin buyback & burn",
    short: "Coin burn",
    paidIn: "Quote → this coin",
    blurb: "Buys this coin back in its own pool and burns it.",
  },
  {
    key: "airdrop",
    bps: 1000,
    label: "High-entry airdrop",
    short: "Airdrop",
    paidIn: "Quote asset",
    blurb: "Paid out continuously to holders whose average entry is above the current price.",
  },
];

/** Split an amount of fees into the five buckets (remainder to protection, so nothing is lost to rounding). */
export function splitFees(amount: number): Record<BucketKey, number> {
  const part = (bps: number) => (amount * bps) / 10_000;
  const mainBuyback = part(1000);
  const coinBuyback = part(1000);
  const otcReserve = part(3000);
  const airdrop = part(1000);
  return {
    mainBuyback,
    coinBuyback,
    otcReserve,
    airdrop,
    protection: amount - mainBuyback - coinBuyback - otcReserve - airdrop,
  };
}

/** splitFees for raw token amounts. */
export function splitRaw(amount: bigint): Record<BucketKey, bigint> {
  const part = (bps: bigint) => (amount * bps) / 10_000n;
  const mainBuyback = part(1000n);
  const coinBuyback = part(1000n);
  const otcReserve = part(3000n);
  const airdrop = part(1000n);
  return {
    mainBuyback,
    coinBuyback,
    otcReserve,
    airdrop,
    protection: amount - mainBuyback - coinBuyback - otcReserve - airdrop,
  };
}

/** Volume needed to generate `fees` at the 3% tax. */
export const volumeForFees = (fees: number) => fees / (TAX_BPS / 10_000);

/**
 * Anti-snipe: the DBC fee scheduler starts at 99% and decays exponentially to 3% over the first 6 seconds, on both
 * sides. The creator's first buy, bundled into the launch transaction, skips it.
 */
export const SNIPE = { startBps: 9900, endBps: TAX_BPS, periods: 6, seconds: 6 } as const;

/** Fee in bps at `secondsSinceLaunch`, mirroring the pool's fee scheduler. */
export function buyTaxBpsAt(secondsSinceLaunch: number) {
  if (secondsSinceLaunch >= SNIPE.seconds) return TAX_BPS;
  const period = Math.max(0, Math.floor(secondsSinceLaunch / (SNIPE.seconds / SNIPE.periods)));
  const decay = (SNIPE.endBps / SNIPE.startBps) ** (period / SNIPE.periods);
  return Math.max(TAX_BPS, Math.round(SNIPE.startBps * decay));
}

// ---------------------------------------------------------------- OTC reserve policy
//
// The OTC reserve is a backend-controlled SOL wallet. Every OTC trade is one transaction signed by both sides
// (the trader and the reserve), so it settles atomically or not at all.

export const otcPolicy = {
  /** OTC trades carry the same 3%; it goes to the fee wallet in the same transaction. */
  spreadBps: TAX_BPS,
  /** 1 SOL contributed = 2 SOL of sell capacity. */
  creditMultiplierBps: 20_000,
  /** Sells price at min(spot, TWAP), buys at max(spot, TWAP). OTC opens once this much history exists. */
  twapSeconds: 30 * 60,
  /** Full limit while the coin contributed within this window... */
  activeSeconds: 3 * 86_400,
  /** ...then fades linearly over this window... */
  decaySeconds: 27 * 86_400,
  /** ...to this share of its credit. */
  floorBps: 500,
  /** One coin can never draw more than 10% of the reserve at once. */
  maxShareOfReserveBps: 1_000,
  /** One wallet can sell at most 5% of the reserve per coin per day. */
  walletDailyBps: 500,
  /** Signed OTC quotes are valid this long (and never past their blockhash). */
  quoteTtlSeconds: 60,
} as const;

/** 100% while a coin keeps paying fees, fading to `floorBps` once it goes quiet. */
export function otcActivityBps(lastContribution: number, now: number) {
  if (lastContribution === 0) return 0;
  const age = now - lastContribution;
  if (age <= otcPolicy.activeSeconds) return 10_000;
  if (age >= otcPolicy.activeSeconds + otcPolicy.decaySeconds) return otcPolicy.floorBps;
  return 10_000 - ((10_000 - otcPolicy.floorBps) * (age - otcPolicy.activeSeconds)) / otcPolicy.decaySeconds;
}

/** Current SOL sell capacity for a coin. */
export const otcSellLimitSol = (creditSol: number, activityBps: number, reserveSol: number) =>
  Math.min((creditSol * activityBps) / 10_000, (reserveSol * otcPolicy.maxShareOfReserveBps) / 10_000);

/** Airdrop recipients need at least this much (USD) at stake. */
export const AIRDROP_MIN_USD = 20;
/**
 * Airdrops run continuously: every few seconds each coin's new airdrop money is allocated to its current
 * high-entry holders, and a holder's allocation is sent as soon as it is worth at least this much (USD), so
 * network fees and token-account rent never eat a payout.
 */
export const AIRDROP_MIN_PAYOUT_USD = 0.5;

// ---------------------------------------------------------------- protection policy
//
// Coverage of a realized loss = hold-time rate ("up to") x the coin's funding ratio for that epoch.
//  - Each epoch may commit at most PROTECTION_EPOCH_BPS of the protection wallet's uncommitted SOL.
//  - A coin can draw only its share of that budget, in proportion to what it has paid into the fund.
//    If its claims ask for more, they are paid pro-rata; coins that paid little cover little.
//  - Each wallet's payout on a coin is capped at PROTECTION_CAP_X_TAX x the tax it paid on that coin.
// One source of truth for the backend (epoch builder and estimates) and the UI.

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
export const PROTECTION_EPOCH_BPS = 1500;
/** Epochs are at least this far apart. */
export const PROTECTION_EPOCH_SECONDS = 6 * 86_400;
/** Unclaimed payouts return to the fund after this long. */
export const PROTECTION_CLAIM_WINDOW_SECONDS = 60 * 86_400;

export function coverageBpsForHold(holdSeconds: number, rugged = false) {
  if (rugged) return RUG_COVERAGE_BPS;
  let bps = 0;
  for (const t of protectionTiers) if (holdSeconds >= t.minHold) bps = t.coverageBps;
  return bps;
}

export type ProtectionLoss = {
  coin: string;
  symbol: string;
  wallet: string;
  lossSol: number;
  holdSeconds: number;
  /** wallet's lifetime tax on this coin, SOL-equivalent */
  taxPaidSol: number;
  rugged: boolean;
};

export type ProtectionPlan = {
  wallets: Map<
    string,
    {
      totalSol: number;
      breakdown: { coin: string; symbol: string; lossSol: number; tierBps: number; coverageBps: number; holdSeconds: number }[];
    }
  >;
  coins: Map<string, { allocationSol: number; requestedSol: number; scale: number }>;
  totalSol: number;
};

/** A coin's slice of an epoch budget: its share of everything paid into the fund. */
export const coinAllocationSol = (budgetSol: number, coinContributedSol: number, totalContributedSol: number) =>
  totalContributedSol > 0 ? (budgetSol * coinContributedSol) / totalContributedSol : 0;

/**
 * Builds an epoch: per-position requests at the hold-time rate (capped by tax paid), then each coin's requests
 * are scaled to that coin's slice of the budget. `contributedSol` is what each coin has paid into the fund.
 */
export function planProtectionEpoch(
  losses: ProtectionLoss[],
  contributedSol: Record<string, number>,
  totalContributedSol: number,
  budgetSol: number,
): ProtectionPlan {
  // aggregate per wallet+coin first so the tax cap applies once per position
  const positions = new Map<string, ProtectionLoss & { requested: number; tierBps: number }>();
  for (const l of losses) {
    const tierBps = coverageBpsForHold(l.holdSeconds, l.rugged);
    const key = `${l.wallet}:${l.coin}`;
    const req = (l.lossSol * tierBps) / 10_000;
    const p = positions.get(key);
    if (p) {
      p.lossSol += l.lossSol;
      p.requested += req;
      p.taxPaidSol = Math.max(p.taxPaidSol, l.taxPaidSol);
      p.holdSeconds = Math.max(p.holdSeconds, l.holdSeconds);
      p.tierBps = Math.max(p.tierBps, tierBps);
    } else positions.set(key, { ...l, requested: req, tierBps });
  }
  for (const p of positions.values()) p.requested = Math.min(p.requested, p.taxPaidSol * PROTECTION_CAP_X_TAX);

  const coins: ProtectionPlan["coins"] = new Map();
  for (const p of positions.values()) {
    const c = coins.get(p.coin) ?? {
      allocationSol: coinAllocationSol(budgetSol, contributedSol[p.coin] ?? 0, totalContributedSol),
      requestedSol: 0,
      scale: 0,
    };
    c.requestedSol += p.requested;
    coins.set(p.coin, c);
  }
  for (const c of coins.values()) c.scale = c.requestedSol > 0 ? Math.min(1, c.allocationSol / c.requestedSol) : 0;

  const wallets: ProtectionPlan["wallets"] = new Map();
  let totalSol = 0;
  for (const p of positions.values()) {
    const pay = p.requested * coins.get(p.coin)!.scale;
    if (pay <= 0) continue;
    const w = wallets.get(p.wallet) ?? { totalSol: 0, breakdown: [] };
    w.totalSol += pay;
    w.breakdown.push({
      coin: p.coin,
      symbol: p.symbol,
      lossSol: p.lossSol,
      tierBps: p.tierBps,
      coverageBps: p.lossSol > 0 ? Math.round((pay / p.lossSol) * 10_000) : 0,
      holdSeconds: p.holdSeconds,
    });
    wallets.set(p.wallet, w);
    totalSol += pay;
  }
  return { wallets, coins, totalSol };
}
