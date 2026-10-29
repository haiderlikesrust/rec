/**
 * REST contract between the indexer (indexer/src/api) and the web app.
 * Raw on-chain amounts are decimal strings; display values (prices, caps, ETH equivalents) are numbers.
 */

export type Address = `0x${string}`;

export type QuoteAsset = {
  address: Address; // 0x000…000 for native ETH
  symbol: string;
  decimals: number;
  /** ETH per 1 whole unit of the quote (1 for ETH). */
  ethPerUnit: number;
  startFdv: number; // whole quote units
  graduationThreshold: number; // whole quote units
};

export type CoinSort = "mcap" | "new" | "active" | "near" | "graduated";

export type Coin = {
  address: Address;
  name: string;
  symbol: string;
  image: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  creator: Address;
  createdAt: number; // unix seconds
  quote: QuoteAsset;
  isMain: boolean;
  /** price of one coin, in whole quote units */
  price: number;
  priceEth: number;
  marketCap: number; // in quote units, circulating = total supply after burns
  marketCapEth: number;
  change24h: number; // percent
  volume24hEth: number;
  trades24h: number;
  lastTradeAt: number;
  feesEth: number; // lifetime tax, ETH-equivalent
  feesQuote: string; // raw, lifetime tax in quote units
  quoteInPool: number; // whole quote units
  graduationProgress: number; // 0..1
  graduated: boolean;
  holders: number;
  burned: string; // raw coin units burned
  spark: number[]; // last 24h hourly closes, in quote units
};

export type BucketTotals = {
  coinBurned: string; // raw coin units
  ethToOtc: string; // wei
  ethToProtection: string;
  ethToMainBuyback: string;
  airdropQuote: string; // raw quote
  pendingQuote: string; // raw quote waiting for the next keeper run
};

export type CoinDetail = Coin & {
  buckets: BucketTotals;
  otc: {
    contributedEth: string; // wei
    creditEth: string; // wei, before activity scaling
    inventory: string; // raw coin units held by the reserve
    lastContribution: number;
  };
  airdropsPaid: string; // raw quote paid to holders so far
  airdropRecipientsLastEpoch: number;
  protection: CoinProtection;
};

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Trade = {
  id: string;
  tx: Address;
  t: number;
  trader: Address;
  isBuy: boolean;
  quoteAmount: string; // raw, gross of tax
  tokenAmount: string; // raw
  tax: string; // raw quote
  price: number; // quote per coin
  kind: "trade" | "buyback";
};

export type Holder = {
  address: Address;
  balance: string; // raw
  share: number; // 0..1 of circulating supply
  avgEntry: number; // quote per coin, 0 if no buys
  costBasis: string; // raw quote still at risk
  unrealized: number; // quote units, negative = underwater
  airdropEligible: boolean;
  airdropWeight: number; // 0..1 share of the next airdrop
};

export type Position = {
  coin: Coin;
  balance: string;
  avgEntry: number;
  costBasis: string;
  value: number; // quote units at spot
  unrealized: number;
  realizedPnl: number; // quote units
  firstBuyAt: number;
  taxPaid: string; // raw quote
  airdropEligible: boolean;
  airdropsReceived: string; // raw quote
};

export type ProtectionClaim = {
  epoch: number;
  account: Address;
  amount: string; // wei
  proof: Address[];
  claimed: boolean;
  breakdown: { coin: Address; symbol: string; lossEth: number; coverageBps: number; holdSeconds: number }[];
};

/** How well a coin's losses are funded in the coming protection epoch. */
export type CoinProtection = {
  coin: Address;
  symbol: string;
  image: string;
  contributedEth: number; // ETH this coin has paid into the protection fund
  shareOfFund: number; // 0..1 of everything ever paid in
  allocationEth: number; // most this coin's claims can draw from the next epoch
  requestedEth: number; // tier-weighted claims since the last epoch
  /** 0..1 multiplier applied to tier rates in the next epoch (1 = fully funded) */
  scale: number;
};

export type ProtectionStatus = {
  fundEth: string; // wei
  reservedEth: string;
  epochBudgetEth: string;
  nextEpochAt: number; // unix seconds (0 = any time)
  epochs: { id: number; total: string; claimed: string; publishedAt: number; uri: string }[];
  /** coins ranked by contribution, with their next-epoch funding */
  coins: CoinProtection[];
};

export type WalletSummary = {
  address: Address;
  positions: Position[];
  airdrops: { coin: Address; symbol: string; amount: string; quoteSymbol: string; quoteDecimals: number; t: number }[];
  claims: ProtectionClaim[];
  /** realized losses not yet in a published epoch, with the coverage they'd earn today */
  pendingCoverage: {
    coin: Address;
    symbol: string;
    lossEth: number;
    tierBps: number; // hold-time rate
    coverageBps: number; // effective rate after the coin funding ratio
    estimatedEth: number;
  }[];
};

export type PlatformStats = {
  ethUsd: number;
  coins: number;
  volume24hEth: number;
  totalFeesEth: number;
  mainBurned: string; // raw platform-token units
  mainSupply: string;
  otcReserveEth: string; // wei
  protectionFundEth: string;
  protectionPaidEth: string;
  airdroppedEth: number; // ETH-equivalent
  coinsBurnedEth: number; // ETH-equivalent value of coin buybacks
};

/** Recent platform activity for the live ticker. */
export type ActivityItem = {
  id: string;
  kind: "buy" | "sell" | "launch";
  coin: Address;
  symbol: string;
  image: string;
  wallet: Address;
  ethValue: number;
  t: number;
};

export const api = (base: string) => {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { cache: "no-store" } as RequestInit);
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json() as Promise<T>;
  };
  return {
    stats: () => get<PlatformStats>("/api/stats"),
    quotes: () => get<QuoteAsset[]>("/api/quotes"),
    coins: (q: { sort?: CoinSort; quote?: string; limit?: number; search?: string } = {}) =>
      get<Coin[]>(`/api/coins?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined) as [string, string][])}`),
    trending: () => get<Coin[]>("/api/trending"),
    coin: (address: string) => get<CoinDetail>(`/api/coins/${address}`),
    candles: (address: string, interval: "1m" | "5m" | "15m" | "1h" = "5m") =>
      get<Candle[]>(`/api/coins/${address}/candles?interval=${interval}`),
    trades: (address: string, limit = 50) => get<Trade[]>(`/api/coins/${address}/trades?limit=${limit}`),
    holders: (address: string) => get<Holder[]>(`/api/coins/${address}/holders`),
    wallet: (address: string) => get<WalletSummary>(`/api/wallet/${address}`),
    protection: () => get<ProtectionStatus>("/api/protection"),
    activity: (limit = 40) => get<ActivityItem[]>(`/api/activity?limit=${limit}`),
  };
};
