/**
 * REST contract between the backend (backend/src/api) and the web app.
 * Raw on-chain amounts (token base units, lamports) are decimal strings; display values (prices, caps, SOL
 * equivalents) are numbers. Addresses are base58 public keys. The UI displays USD; coins trade in their quote asset.
 */

import type { QuoteCategory } from "./quotes";
import type { Cluster } from "./solana";

export type Address = string;

export type QuoteAsset = {
  address: Address; // mint; wrapped SOL for SOL
  symbol: string;
  name: string;
  category: QuoteCategory;
  /** Official token logo URL (issuer artwork via Jupiter token metadata). */
  logo: string;
  decimals: number;
  /** SOL per 1 whole unit of the quote (1 for SOL). */
  solPerUnit: number;
  usdPerUnit: number;
  /** Market cap at launch and at graduation, in USD (the same for every quote). */
  startMcapUsd: number;
  graduationMcapUsd: number;
  /** The live DBC config new coins on this quote launch from; null until the first launch creates it. */
  config: Address | null;
  /** Quote in the curve when that config's coins graduate, whole quote units (0 before a config exists). */
  graduationThreshold: number;
  /** False when Meteora rejected a config for this mint (e.g. a Token-2022 quote without a DBC token badge). */
  available: boolean;
};

export type CoinSort = "mcap" | "new" | "active" | "near" | "graduated";

export type Coin = {
  address: Address; // mint
  pool: Address; // Meteora DBC pool
  dammPool: Address | null; // DAMM v2 pool once graduated
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
  decimals: number;
  /** price of one coin, in whole quote units */
  price: number;
  priceSol: number;
  priceUsd: number;
  marketCap: number; // in quote units, circulating = total supply after burns
  marketCapSol: number;
  marketCapUsd: number;
  change24h: number; // percent
  volume24hSol: number;
  volume24hUsd: number;
  trades24h: number;
  lastTradeAt: number;
  feesSol: number; // lifetime 3% tax, SOL-equivalent (Meteora's share included)
  feesUsd: number;
  feesQuote: string; // raw, lifetime tax in quote units
  quoteInPool: number; // whole quote units in the curve
  graduationThreshold: number; // whole quote units in the curve at graduation
  graduationProgress: number; // 0..1
  graduated: boolean;
  holders: number;
  burned: string; // raw coin units burned
  spark: number[]; // last 24h hourly closes, in quote units
};

export type BucketTotals = {
  coinBurned: string; // raw coin units
  solToOtc: number;
  solToProtection: number;
  solToMainBuyback: number;
  airdropQuote: string; // raw quote
  meteoraQuote: string; // raw quote kept by Meteora's protocol fee
  pendingQuote: string; // raw quote claimed or claimable, waiting for the next split
};

export type OtcCoin = {
  coin: Address;
  symbol: string;
  name: string;
  image: string;
  contributedSol: number; // lifetime SOL this coin paid into the reserve
  creditSol: number; // sell credit before activity scaling
  activityBps: number;
  sellLimitSol: number; // SOL the reserve will pay for this coin right now
  inventory: string; // raw coin units the reserve holds
  lastContribution: number;
  /** SOL per whole coin a seller gets, after the spread (0 until the TWAP window fills) */
  sellPriceSol: number;
  /** SOL per whole coin a buyer pays, including the spread */
  buyPriceSol: number;
  twapReady: boolean;
};

export type CoinDetail = Coin & {
  buckets: BucketTotals;
  otc: OtcCoin;
  airdropsPaid: string; // raw quote paid to holders so far
  airdropRecipientsLastEpoch: number;
  /** the fee wallet's buy-and-burns of this coin in the last 24h (they run continuously) */
  buybacks24h: { count: number; tokenAmount: string; usd: number };
  protection: CoinProtection;
};

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Trade = {
  id: string;
  tx: string; // signature
  t: number;
  trader: Address;
  isBuy: boolean;
  quoteAmount: string; // raw, gross of tax
  tokenAmount: string; // raw
  tax: string; // raw quote
  price: number; // quote per coin
  kind: "trade" | "buyback" | "otc";
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
  valueUsd: number;
  unrealized: number;
  unrealizedUsd: number;
  realizedPnl: number; // quote units
  realizedPnlUsd: number;
  firstBuyAt: number;
  taxPaid: string; // raw quote
  airdropEligible: boolean;
  airdropsReceived: string; // raw quote
};

export type ProtectionClaim = {
  epoch: number;
  account: Address;
  amount: string; // lamports
  status: "open" | "pending" | "claimed" | "expired";
  signature: string | null;
  expiresAt: number;
  breakdown: { coin: Address; symbol: string; lossSol: number; coverageBps: number; holdSeconds: number }[];
};

/** How well a coin's losses are funded in the coming protection epoch. */
export type CoinProtection = {
  coin: Address;
  symbol: string;
  image: string;
  contributedSol: number; // SOL this coin has paid into the protection wallet
  shareOfFund: number; // 0..1 of everything ever paid in
  allocationSol: number; // most this coin's claims can draw from the next epoch
  requestedSol: number; // tier-weighted claims since the last epoch
  /** 0..1 multiplier applied to tier rates in the next epoch (1 = fully funded) */
  scale: number;
};

export type ProtectionStatus = {
  wallet: Address; // the protection wallet, verifiable on-chain
  fundSol: number; // wallet balance
  reservedSol: number; // committed to open claims
  epochBudgetSol: number;
  maxEpochBps: number;
  totalPaidSol: number;
  lastEpochAt: number;
  nextEpochAt: number; // unix seconds (0 = any time)
  epochs: { id: number; totalSol: number; claimedSol: number; publishedAt: number; claims: number }[];
  /** coins ranked by contribution, with their next-epoch funding */
  coins: CoinProtection[];
};

export type WalletSummary = {
  address: Address;
  positions: Position[];
  airdrops: { coin: Address; symbol: string; amount: string; quoteSymbol: string; quoteDecimals: number; t: number; tx: string }[];
  claims: ProtectionClaim[];
  /** realized losses not yet in a published epoch, with the coverage they'd earn today */
  pendingCoverage: {
    coin: Address;
    symbol: string;
    lossSol: number;
    tierBps: number; // hold-time rate
    coverageBps: number; // effective rate after the coin funding ratio
    estimatedSol: number;
  }[];
};

/** A backend-controlled wallet. Each one is a plain Solana account anyone can audit. */
export type TreasuryWallet = {
  role: "fees" | "otc" | "protection" | "airdrop";
  label: string;
  address: Address;
  sol: number;
};

export type PlatformStats = {
  cluster: Cluster;
  demo: boolean;
  solUsd: number;
  coins: number;
  mainToken: Address | null;
  volume24hSol: number;
  volume24hUsd: number;
  totalFeesSol: number;
  totalFeesUsd: number;
  meteoraFeesSol: number;
  mainBurned: string; // raw platform-token units
  mainSupply: string;
  otcReserveSol: number;
  protectionFundSol: number;
  protectionPaidSol: number;
  airdroppedSol: number; // SOL-equivalent
  coinsBurnedSol: number; // SOL-equivalent value of coin buybacks
  treasury: TreasuryWallet[];
};

/** Recent platform activity for the live ticker. */
export type ActivityItem = {
  id: string;
  kind: "buy" | "sell" | "launch";
  coin: Address;
  symbol: string;
  image: string;
  wallet: Address;
  solValue: number;
  usdValue: number;
  t: number;
};

/** Native SOL and SPL balances of a wallet (from the chain, or the simulated ledger in demo mode). */
export type Balances = {
  sol: string; // lamports
  tokens: Record<Address, string>; // mint → raw amount
};

// ---------------------------------------------------------------- transactions
//
// The backend builds every transaction; the wallet signs it (and the backend co-signs where one of its wallets
// moves funds). In demo mode there is no chain: the backend applies the action itself and returns `demo: true`.

export type TxEnvelope = {
  /** base64 serialized transaction for the wallet to sign and send; null in demo mode */
  tx: string | null;
  demo: boolean;
  /** demo mode: the simulated signature */
  signature?: string;
  lastValidBlockHeight?: number;
};

export type SwapSide = "buy" | "sell";

export type SwapQuote = {
  side: SwapSide;
  amountIn: string; // raw (quote for buys, coin for sells)
  amountOut: string; // raw
  minOut: string; // raw, after slippage
  fee: string; // raw quote
  feeBps: number; // includes the anti-snipe surcharge, if any
  priceImpact: number; // 0..1
  venue: "dbc" | "damm" | "demo";
};

export type SwapRequest = { wallet: Address; coin: Address; side: SwapSide; amount: string; slippageBps: number };
export type SwapResponse = TxEnvelope & { quote: SwapQuote };

export type LaunchRequest = {
  wallet: Address;
  name: string;
  symbol: string;
  description: string;
  image: string;
  website: string;
  twitter: string;
  telegram: string;
  quote: Address; // quote mint
  initialBuy: string; // raw quote; 0 for none
};
export type LaunchResponse = TxEnvelope & { mint: Address; pool: Address };

export type OtcSide = "sell" | "buy"; // sell coins to the reserve / buy coins from it
export type OtcQuoteRequest = { wallet: Address; coin: Address; side: OtcSide; amount: string /* raw coin for sells, lamports for buys */ };
export type OtcQuote = TxEnvelope & {
  id: string;
  side: OtcSide;
  coin: Address;
  amountIn: string;
  amountOut: string;
  taxLamports: string;
  priceSol: number;
  expiresAt: number;
};
export type OtcWalletLimits = OtcCoin & { reserveSol: number; walletRemainingSol: number };
export type OtcStatus = { wallet: Address; reserveSol: number; walletDailyCapSol: number; coins: OtcCoin[] };

export type ClaimResponse = TxEnvelope & { claimId: string; amount: string };

export const api = (base: string) => {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { cache: "no-store" } as RequestInit);
    if (!res.ok) throw new Error(await errorText(res, path));
    return res.json() as Promise<T>;
  };
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await errorText(res, path));
    return res.json() as Promise<T>;
  };
  const qs = (q: Record<string, string | number | undefined>) =>
    new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined) as [string, string][]).toString();
  return {
    stats: () => get<PlatformStats>("/api/stats"),
    quotes: () => get<QuoteAsset[]>("/api/quotes"),
    coins: (q: { sort?: CoinSort; quote?: string; limit?: number; search?: string } = {}) => get<Coin[]>(`/api/coins?${qs(q)}`),
    trending: () => get<Coin[]>("/api/trending"),
    coin: (address: string) => get<CoinDetail>(`/api/coins/${address}`),
    candles: (address: string, interval: "1m" | "5m" | "15m" | "1h" = "5m") =>
      get<Candle[]>(`/api/coins/${address}/candles?interval=${interval}`),
    trades: (address: string, limit = 50, opts: { buybacks?: boolean } = {}) =>
      get<Trade[]>(`/api/coins/${address}/trades?limit=${limit}${opts.buybacks === false ? "&buybacks=0" : ""}`),
    holders: (address: string) => get<Holder[]>(`/api/coins/${address}/holders`),
    wallet: (address: string) => get<WalletSummary>(`/api/wallet/${address}`),
    balances: (address: string) => get<Balances>(`/api/balances/${address}`),
    protection: () => get<ProtectionStatus>("/api/protection"),
    activity: (limit = 40) => get<ActivityItem[]>(`/api/activity?limit=${limit}`),
    otc: () => get<OtcStatus>("/api/otc"),
    otcCoin: (coin: string, wallet?: string) => get<OtcWalletLimits>(`/api/otc/${coin}?${qs({ wallet })}`),

    swapQuote: (q: { coin: string; side: SwapSide; amount: string; wallet?: string; slippageBps?: number }) =>
      get<SwapQuote>(`/api/swap/quote?${qs(q)}`),
    swap: (req: SwapRequest) => post<SwapResponse>("/api/tx/swap", req),
    launch: (req: LaunchRequest) => post<LaunchResponse>("/api/tx/launch", req),
    otcQuote: (req: OtcQuoteRequest) => post<OtcQuote>("/api/otc/quote", req),
    otcConfirm: (id: string, signature: string) => post<{ ok: boolean }>("/api/otc/confirm", { id, signature }),
    claim: (wallet: string, epoch: number) => post<ClaimResponse>("/api/protection/claim", { wallet, epoch }),
    claimConfirm: (claimId: string, signature: string) => post<{ ok: boolean }>("/api/protection/confirm", { claimId, signature }),
    /** Ask the backend to index a transaction the wallet just sent, so the UI updates without waiting for polling. */
    ingest: (signature: string) => post<{ ok: boolean }>("/api/ingest", { signature }),
  };
};

async function errorText(res: Response, path: string) {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `${res.status} ${path}`;
}
