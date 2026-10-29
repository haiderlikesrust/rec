/** Mirrors contracts/src/libraries/FeeSplit.sol. */
export const TAX_BPS = 300;

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
    paidIn: "ETH",
    blurb: "Covers realized losses: up to 70%, by hold time and by how much the coin paid into the fund.",
  },
  {
    key: "otcReserve",
    bps: 3000,
    label: "OTC reserve",
    short: "OTC reserve",
    paidIn: "ETH",
    blurb: "An ETH pool you can sell coins into without slippage. Coins that pay more get higher limits.",
  },
  {
    key: "mainBuyback",
    bps: 1000,
    label: "Platform buyback & burn",
    short: "Platform burn",
    paidIn: "ETH → platform token",
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
    blurb: "Paid hourly to holders whose average entry is above the current price.",
  },
];

/** Split an amount of fees into the five buckets (same rounding as the contract: remainder to protection). */
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

/** Volume needed to generate `fees` at the 3% tax. */
export const volumeForFees = (fees: number) => fees / (TAX_BPS / 10_000);

/** Snipe surcharge on launch-window buys, mirroring FeeSplit.snipeExtraBps. */
export const buyTaxBpsAt = (secondsSinceLaunch: number) =>
  TAX_BPS + (secondsSinceLaunch < 6 ? 9600 >> secondsSinceLaunch : 0);

// ---------------------------------------------------------------- protection policy
//
// Coverage of a realized loss = hold-time rate ("up to") x the coin's funding ratio for that epoch.
//  - Each epoch may commit at most PROTECTION_EPOCH_BPS of the fund's uncommitted ETH (enforced on-chain).
//  - A coin can draw only its share of that budget, in proportion to what it has paid into the fund.
//    If its claims ask for more, they are paid pro-rata; coins that paid little cover little.
//  - Each wallet's payout on a coin is capped at PROTECTION_CAP_X_TAX x the tax it paid on that coin.
// One source of truth for the keeper (epoch builder), the indexer (estimates) and the UI.

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
/** Mirrors ProtectionFund.maxEpochBps. */
export const PROTECTION_EPOCH_BPS = 1500;

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
  lossEth: number;
  holdSeconds: number;
  /** wallet's lifetime tax on this coin, ETH-equivalent */
  taxPaidEth: number;
  rugged: boolean;
};

export type ProtectionPlan = {
  wallets: Map<
    string,
    {
      totalEth: number;
      breakdown: { coin: string; symbol: string; lossEth: number; tierBps: number; coverageBps: number; holdSeconds: number }[];
    }
  >;
  coins: Map<string, { allocationEth: number; requestedEth: number; scale: number }>;
  totalEth: number;
};

/** A coin's slice of an epoch budget: its share of everything paid into the fund. */
export const coinAllocationEth = (budgetEth: number, coinContributedEth: number, totalContributedEth: number) =>
  totalContributedEth > 0 ? (budgetEth * coinContributedEth) / totalContributedEth : 0;

/**
 * Builds an epoch: per-position requests at the hold-time rate (capped by tax paid), then each coin's requests
 * are scaled to that coin's slice of the budget. `contributedEth` is what each coin has paid into the fund.
 */
export function planProtectionEpoch(
  losses: ProtectionLoss[],
  contributedEth: Record<string, number>,
  totalContributedEth: number,
  budgetEth: number,
): ProtectionPlan {
  // aggregate per wallet+coin first so the tax cap applies once per position
  const positions = new Map<string, ProtectionLoss & { requested: number; tierBps: number }>();
  for (const l of losses) {
    const tierBps = coverageBpsForHold(l.holdSeconds, l.rugged);
    const key = `${l.wallet}:${l.coin}`;
    const req = (l.lossEth * tierBps) / 10_000;
    const p = positions.get(key);
    if (p) {
      p.lossEth += l.lossEth;
      p.requested += req;
      p.taxPaidEth = Math.max(p.taxPaidEth, l.taxPaidEth);
      p.holdSeconds = Math.max(p.holdSeconds, l.holdSeconds);
      p.tierBps = Math.max(p.tierBps, tierBps);
    } else positions.set(key, { ...l, requested: req, tierBps });
  }
  for (const p of positions.values()) p.requested = Math.min(p.requested, p.taxPaidEth * PROTECTION_CAP_X_TAX);

  const coins: ProtectionPlan["coins"] = new Map();
  for (const p of positions.values()) {
    const c = coins.get(p.coin) ?? {
      allocationEth: coinAllocationEth(budgetEth, contributedEth[p.coin] ?? 0, totalContributedEth),
      requestedEth: 0,
      scale: 0,
    };
    c.requestedEth += p.requested;
    coins.set(p.coin, c);
  }
  for (const c of coins.values()) c.scale = c.requestedEth > 0 ? Math.min(1, c.allocationEth / c.requestedEth) : 0;

  const wallets: ProtectionPlan["wallets"] = new Map();
  let totalEth = 0;
  for (const p of positions.values()) {
    const pay = p.requested * coins.get(p.coin)!.scale;
    if (pay <= 0) continue;
    const w = wallets.get(p.wallet) ?? { totalEth: 0, breakdown: [] };
    w.totalEth += pay;
    w.breakdown.push({
      coin: p.coin,
      symbol: p.symbol,
      lossEth: p.lossEth,
      tierBps: p.tierBps,
      coverageBps: p.lossEth > 0 ? Math.round((pay / p.lossEth) * 10_000) : 0,
      holdSeconds: p.holdSeconds,
    });
    wallets.set(p.wallet, w);
    totalEth += pay;
  }
  return { wallets, coins, totalEth };
}
