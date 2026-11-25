/**
 * REST contract between the backend (backend/src/api) and the web app.
 * Raw on-chain amounts (token base units, lamports) are decimal strings; display values (prices, caps, SOL
 * equivalents) are numbers. Addresses are base58 public keys. The UI displays USD; coins trade in their quote asset.
 */

import type { FleetCheck, FleetInfo, FleetTag } from "./fleet";
import type { PayoutLimit, Venue } from "./fees";
import type { QuoteCategory, QuoteGroup, StockIssuer } from "./quotes";
import type { Cluster } from "./solana";

export type Address = string;

export type QuoteAsset = {
  address: Address; // mint; wrapped SOL for SOL
  symbol: string;
  name: string;
  category: QuoteCategory;
  /** The pair picker's group for it (see quoteGroups, and GET /api/quotes/groups for the ones in use). */
  group: QuoteGroup;
  /** Who issues a tokenized stock; null for every other quote. */
  issuer: StockIssuer | null;
  /** Official token logo URL (issuer artwork via Jupiter token metadata). */
  logo: string;
  decimals: number;
  /**
   * What wallets multiply a balance by before showing it (1 for most). Stock issuers move it for dividends and
   * splits. Every amount and price in this API is in whole units of the raw amount (raw / 10^decimals), so a wallet
   * shows `amount * uiMultiplier` of the token and a price of `usdPerUnit / uiMultiplier` each.
   */
  uiMultiplier: number;
  /**
   * The mint's own fee on every transfer of it, in bps (0 for most), and that fee's cap in raw units (null without
   * one). On such a pair a buyer pays it on what they send and a seller out of what they're sent, on top of the
   * launchpad's fee; SwapQuote.transferFee is the amount on a given trade.
   */
  transferFeeBps: number;
  transferFeeMax: string | null;
  /** SOL per 1 whole unit of the quote (1 for SOL). */
  solPerUnit: number;
  usdPerUnit: number;
  /** Market cap at launch and at graduation, in USD (the same for every quote). */
  startMcapUsd: number;
  graduationMcapUsd: number;
  /** What a curve launched now raises before it graduates, in whole quote units (about $6k at the live price). */
  graduationThreshold: number;
  /**
   * False while a coin can't be launched on it: it has no live price, its mint is in a state pools can't trade,
   * LaunchLab's floor on what a curve must raise is above that (see QuoteSpec.minRaise), or it is too thinly traded
   * for its fees to be turned into SOL.
   */
  available: boolean;
  /** Why, in a sentence for the launcher; null while available. */
  unavailableReason: string | null;
};

/** A group of the pair picker with how many quotes it has, and how many of them can be launched on right now. */
export type QuoteGroupInfo = { key: QuoteGroup; label: string; count: number; available: number };

/** "protected": coins by what their pot in the protection fund has left for their sellers, largest first. */
export type CoinSort = "mcap" | "new" | "active" | "near" | "graduated" | "protected";

export type Coin = {
  address: Address; // mint
  pool: Address; // LaunchLab bonding-curve pool
  cpmmPool: Address | null; // Raydium CPMM pool once graduated
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
  /** the platform token (brand.mainTicker), featured on the home page; it gets no share of fees */
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
  feesSol: number; // lifetime trading fees, SOL-equivalent (Raydium's share included)
  feesUsd: number;
  feesQuote: string; // raw, lifetime tax in quote units
  /** what the coin has left in the protection fund for its sellers' losses right now (CoinProtection.potSol) */
  protectionPotSol: number;
  protectionPotUsd: number;
  quoteInPool: number; // whole quote units in the curve
  graduationThreshold: number; // whole quote units in the curve at graduation
  graduationProgress: number; // 0..1
  graduated: boolean;
  holders: number;
  burned: string; // raw coin units burned
  spark: number[]; // last 24h hourly closes, in quote units
  /** its Fleet, the family of look-alike coins (see fleet.ts); null when it has no copies */
  fleet: FleetTag | null;
};

export type BucketTotals = {
  /** SOL in this coin's name: its own fees, plus whatever its Fleet's copies sent it while it led */
  solToOtc: number;
  solToProtection: number;
  protocolQuote: string; // Raydium's share of the fees, raw quote
  pendingQuote: string; // raw quote claimed or claimable, waiting for the next split
  feeBurned: string; // raw coin units burned out of the pool fees that came back in the coin itself
  /** a copy's fees that went to its Fleet's leader instead, and what a leader received from its copies (SOL) */
  sentToLeaderSol: number;
  receivedFromCopiesSol: number;
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
  burned: string; // raw coin units the reserve has bought and burned (it never holds any)
  lastContribution: number;
  /**
   * What the reserve pays a seller per whole coin right now, before the limits: the lower of spot and the TWAP, less
   * the spread. In SOL (what it pays in), in the coin's quote (the unit of its chart) and in USD. 0 until `twapReady`.
   */
  sellPriceSol: number;
  sellPrice: number;
  sellPriceUsd: number;
  /** OTC is open for the coin: it has the price history the TWAP needs */
  twapReady: boolean;
};

export type CoinDetail = Coin & {
  buckets: BucketTotals;
  otc: OtcCoin;
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
  kind: "trade" | "otc";
};

export type Holder = {
  address: Address;
  balance: string; // raw
  share: number; // 0..1 of circulating supply
  avgEntry: number; // quote per coin, 0 if no buys
  costBasis: string; // raw quote still at risk
  unrealized: number; // quote units, negative = underwater
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
};

/** A realized loss and what it paid. The protection wallet sends payouts automatically; there's nothing to claim. */
export type CoveredLoss = {
  /** also the id of its payout (GET /api/payouts/:id) once `amountSol` is above 0 */
  id: string;
  wallet: Address;
  coin: Address;
  symbol: string;
  t: number; // when the losing sale happened
  lossSol: number;
  holdSeconds: number;
  tierBps: number; // hold-time rate
  amountSol: number; // 0 when the rate or a cap left nothing
  /** what capped it */
  limit: PayoutLimit;
  /** "waiting": not decided yet, because the protection wallet can't cover it right now */
  status: "waiting" | "owed" | "sending" | "sent";
  tx: string | null;
};

/** One loss cover that paid something, with everything its share page shows. USD is at the SOL price of the sale. */
export type Payout = {
  id: string;
  coin: { address: Address; symbol: string; name: string; image: string };
  wallet: Address;
  t: number; // when the losing sale happened
  lossSol: number;
  lossUsd: number;
  payoutSol: number;
  payoutUsd: number;
  /** the share of the loss the payout covers, after the caps */
  coverageBps: number;
  /** the hold-time rate it started from, and what capped it */
  tierBps: number;
  limit: PayoutLimit;
  holdSeconds: number;
  status: "owed" | "sending" | "sent";
  /** the transfer that paid it, once sent (one transfer can carry several of a wallet's payouts) */
  tx: string | null;
  paidAt: number | null;
};

/** A coin's protection pot: what it paid into the fund, what it has paid its sellers, and what's left. */
export type CoinProtection = {
  coin: Address;
  symbol: string;
  image: string;
  contributedSol: number; // SOL this coin has paid into the protection wallet
  paidSol: number; // paid or owed to its sellers
  potSol: number; // left for future losses
  maxPayoutSol: number; // the most the next payout on this coin can be
};

export type ProtectionStatus = {
  wallet: Address; // the protection wallet, verifiable on-chain
  fundSol: number; // wallet balance
  owedSol: number; // covered but not sent yet
  waitingLosses: number; // losses not decided yet, waiting for the wallet to cover them
  totalPaidSol: number;
  paid24hSol: number;
  payoutBps: number; // the most one payout can take from its coin's pot
  /** the latest losses that earned a payout */
  recent: CoveredLoss[];
  /** coins ranked by what they paid in */
  coins: CoinProtection[];
};

export type WalletSummary = {
  address: Address;
  positions: Position[];
  /** this wallet's covered losses, newest first */
  protection: { receivedSol: number; owedSol: number; losses: CoveredLoss[] };
};

/** A backend-controlled wallet. Each one is a plain Solana account anyone can audit. */
export type TreasuryWallet = {
  role: "fees" | "otc" | "protection";
  label: string;
  address: Address;
  sol: number;
};

/** The platform token (MAIN_TOKEN_MINT) as the site shows it. Its numbers are null until they are known. */
export type PlatformToken = {
  address: Address;
  symbol: string;
  name: string;
  image: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  change24h: number | null; // percent
  /** launched here, so it has a coin page; otherwise it trades elsewhere */
  listed: boolean;
};

export type PlatformStats = {
  cluster: Cluster;
  demo: boolean;
  solUsd: number;
  coins: number;
  /** the platform token's mint (MAIN_TOKEN_MINT), or null before it's set */
  mainToken: Address | null;
  /** that token's ticker, image and price, or null before it's set */
  platformToken: PlatformToken | null;
  volume24hSol: number;
  volume24hUsd: number;
  totalFeesSol: number;
  totalFeesUsd: number;
  /** Raydium's share of all fees, SOL-equivalent */
  protocolFeesSol: number;
  otcReserveSol: number;
  protectionFundSol: number;
  protectionPaidSol: number;
  /** SOL the OTC reserve has paid sellers */
  otcPaidSol: number;
  /** SOL copies sent to their Fleet's leader */
  fleetRoutedSol: number;
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
  amountIn: string; // raw (quote for buys, coin for sells): what leaves the wallet
  amountOut: string; // raw: what reaches the wallet
  minOut: string; // raw, after slippage
  fee: string; // raw quote
  /** raw quote the quote's own transfer fee keeps back on this trade ("0" on most pairs), already out of the amounts above */
  transferFee: string;
  feeBps: number; // of the quote side: 300 on the curve, the pool tier's after graduation
  priceImpact: number; // 0..1
  venue: Venue | "demo";
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
  /** a copy's Fleet entry in raw quote, as the launch form showed it (see fleet.ts) */
  entry?: string;
};
export type LaunchResponse = TxEnvelope & { mint: Address; pool: Address };

/** A first buy paid in SOL on another pair: a Jupiter swap from SOL into the quote, signed before the launch. */
export type SolToQuoteRequest = { wallet: Address; quote: Address; lamports: string };
export type SolToQuote = TxEnvelope & { quote: Address; lamports: string; outAmount: string; minOut: string };

export type OtcSide = "sell"; // sell coins to the reserve, which burns them in the same transaction
export type OtcQuoteRequest = { wallet: Address; coin: Address; side: OtcSide; amount: string /* raw coin units */ };
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
    /** Every quote, or the ones of a group, matching a search (ticker, name or mint) or launchable right now. */
    quotes: (q: { group?: QuoteGroup; search?: string; available?: boolean; limit?: number; offset?: number } = {}) =>
      get<QuoteAsset[]>(`/api/quotes?${qs({ ...q, available: q.available ? 1 : undefined })}`),
    quoteGroups: () => get<QuoteGroupInfo[]>("/api/quotes/groups"),
    coins: (q: { sort?: CoinSort; quote?: string; limit?: number; search?: string } = {}) => get<Coin[]>(`/api/coins?${qs(q)}`),
    trending: () => get<Coin[]>("/api/trending"),
    coin: (address: string) => get<CoinDetail>(`/api/coins/${address}`),
    candles: (address: string, interval: "1m" | "5m" | "15m" | "1h" = "5m") =>
      get<Candle[]>(`/api/coins/${address}/candles?interval=${interval}`),
    trades: (address: string, limit = 50, opts: { trader?: string } = {}) =>
      get<Trade[]>(`/api/coins/${address}/trades?limit=${limit}${opts.trader ? `&trader=${opts.trader}` : ""}`),
    holders: (address: string) => get<Holder[]>(`/api/coins/${address}/holders`),
    fleet: (address: string) => get<FleetInfo>(`/api/coins/${address}/fleet`),
    /** The family a launch with this ticker and name would join, and the entry it would pay on that pair. */
    fleetCheck: (q: { symbol: string; name: string; quote: string }) => get<FleetCheck>(`/api/fleet/check?${qs(q)}`),
    wallet: (address: string) => get<WalletSummary>(`/api/wallet/${address}`),
    balances: (address: string) => get<Balances>(`/api/balances/${address}`),
    protection: () => get<ProtectionStatus>("/api/protection"),
    /** One paid loss cover by its id (a CoveredLoss's id); rejects with "not found" for an unknown one. */
    payout: (id: string) => get<Payout>(`/api/payouts/${encodeURIComponent(id)}`),
    activity: (limit = 40) => get<ActivityItem[]>(`/api/activity?limit=${limit}`),
    otc: () => get<OtcStatus>("/api/otc"),
    otcCoin: (coin: string, wallet?: string) => get<OtcWalletLimits>(`/api/otc/${coin}?${qs({ wallet })}`),

    swapQuote: (q: { coin: string; side: SwapSide; amount: string; wallet?: string; slippageBps?: number }) =>
      get<SwapQuote>(`/api/swap/quote?${qs(q)}`),
    swap: (req: SwapRequest) => post<SwapResponse>("/api/tx/swap", req),
    launch: (req: LaunchRequest) => post<LaunchResponse>("/api/tx/launch", req),
    solToQuote: (req: SolToQuoteRequest) => post<SolToQuote>("/api/tx/sol-to-quote", req),
    otcQuote: (req: OtcQuoteRequest) => post<OtcQuote>("/api/otc/quote", req),
    otcConfirm: (id: string, signature: string) => post<{ ok: boolean }>("/api/otc/confirm", { id, signature }),
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
