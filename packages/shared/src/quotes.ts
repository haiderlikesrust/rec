import { generatedQuotes } from "./quotes.generated";
import { NATIVE_MINT, type Cluster } from "./solana";

/** USD market cap a coin starts at, and where its curve completes and graduates to a Raydium CPMM pool. */
export const START_MCAP_USD = 2_500;
export const GRADUATION_MCAP_USD = 25_000;

/**
 * The curve every coin launches on, whatever its quote: a LaunchLab constant-product curve from START_MCAP_USD to
 * GRADUATION_MCAP_USD. With p0 and p1 the start and graduation prices and S the supply, the virtual base reserve is
 * S·p1/(p1−p0), the coins sold on the curve are that times (1−√(p0/p1)), and what's left of the supply seeds the
 * CPMM pool together with everything the curve raised.
 */
const startRatio = Math.sqrt(START_MCAP_USD / GRADUATION_MCAP_USD);
/** Share of the supply sold on the curve (≈75.97%); the rest (≈24.03%) goes into the CPMM pool at graduation. */
export const CURVE_SOLD_SHARE = (GRADUATION_MCAP_USD / (GRADUATION_MCAP_USD - START_MCAP_USD)) * (1 - startRatio);
/** What a full curve has raised, in USD of its quote (≈$6k). All of it becomes the CPMM pool's quote side. */
export const GRADUATION_RAISE_USD = GRADUATION_MCAP_USD * (1 - CURVE_SOLD_SHARE);

export type QuoteCategory = "solana" | "currency" | "crypto" | "meme" | "stock";

export const quoteCategories: Record<QuoteCategory, string> = {
  solana: "Solana",
  currency: "Stablecoins",
  crypto: "Crypto",
  meme: "Memes",
  stock: "Stocks",
};

/**
 * The groups the pair picker shows its quotes in, in their order. A quote is in the first one that fits:
 *  - an issuer's group when one of the known issuers of tokenized stocks holds the authority over its mint;
 *  - "sunrise" when Sunrise's own token list names it as one of the tokens it brought to Solana;
 *  - "memes" when Jupiter tags it a memecoin or it was minted on a memecoin launchpad;
 *  - "crypto" otherwise: SOL, the stablecoins and every other token Jupiter lists as verified.
 */
export type QuoteGroup = "crypto" | "xstocks" | "backpack" | "prestocks" | "tessera" | "sunrise" | "memes";

export const quoteGroups: { key: QuoteGroup; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "xstocks", label: "xStocks" },
  { key: "backpack", label: "Backpack" },
  { key: "prestocks", label: "PreStocks" },
  { key: "tessera", label: "Tessera" },
  { key: "sunrise", label: "Sunrise" },
  { key: "memes", label: "Memes" },
];

/** Who issues a tokenized stock. */
export type StockIssuer = "xStocks" | "Backpack" | "PreStocks" | "Tessera";
const issuers: Partial<Record<QuoteGroup, StockIssuer>> = { xstocks: "xStocks", backpack: "Backpack", prestocks: "PreStocks", tessera: "Tessera" };

export type QuoteSpec = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  category: QuoteCategory;
  group: QuoteGroup;
  /** Set on tokenized stocks. */
  issuer?: StockIssuer;
  /** Official token logo; replaced by Jupiter's when live prices load, and empty until then for most. */
  logo: string;
  /**
   * Reference USD price of one whole unit of the raw amount (Nov 2026), used only when live prices are unavailable.
   */
  refUsd: number;
  /**
   * What wallets multiply a balance of this mint by before showing it, when it isn't 1 (Token-2022's scaled UI
   * amount, which stock issuers move for dividends and splits). Markets quote such a token per displayed unit, so
   * its price per whole raw unit is that quote times this.
   */
  uiMultiplier?: number;
  /**
   * The mint's own fee on every transfer of it, in bps, and that fee's cap in raw units when it has one (Token-2022's
   * transfer fee). A buyer on such a pair pays it on the way into the pool and a seller on the way out, on top of the
   * launchpad's fee; the fee buckets pay it on what they collect.
   */
  transferFeeBps?: number;
  transferFeeMax?: string;
  /**
   * The least a curve on this quote may raise, in whole units (LaunchLab's `min_quote_fund_raising` on the quote's
   * global config). A quote is unavailable while GRADUATION_RAISE_USD at its live price is below it: for SOL, above
   * about $250.
   */
  minRaise: number;
  /** DEX liquidity in USD, and why coins couldn't be launched on it, as last read. */
  liquidityUsd?: number;
  blocked?: string;
};
// The display multiplier, transfer fee, floor, liquidity and the reason a quote is off are copies as of the day the
// catalog was written. The backend re-reads each from the chain and from Jupiter; the copies serve the demo.

/**
 * SOL and the dollar stablecoins, kept by hand at the head of the catalog. LaunchLab's configs are created by
 * Raydium (its program admin or its delegated config authority), one per quote mint, so the list of quotes can only
 * grow where Raydium has published one. The curve's numbers are computed per launch from the quote's live USD price,
 * so every coin starts at START_MCAP_USD and graduates at GRADUATION_MCAP_USD whatever it is paired with.
 */
const base: QuoteSpec[] = [
  {
    symbol: "SOL",
    name: "Wrapped SOL",
    mint: NATIVE_MINT,
    decimals: 9,
    category: "solana",
    group: "crypto",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    refUsd: 67.86,
    minRaise: 24,
  },
  {
    symbol: "USDC",
    name: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    category: "currency",
    group: "crypto",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    refUsd: 0.9996,
    minRaise: 0.000001,
  },
  {
    symbol: "USDT",
    name: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    category: "currency",
    group: "crypto",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    refUsd: 0.9983,
    minRaise: 0.000001,
  },
  {
    symbol: "USD1",
    name: "World Liberty Financial USD",
    mint: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
    decimals: 6,
    category: "currency",
    group: "crypto",
    logo: "https://img-v1.raydium.io/icon/USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB.png",
    refUsd: 0.9995,
    minRaise: 5_000,
  },
];

/**
 * Every other quote LaunchLab has a constant-product config for and whose identity is established (see
 * quotes.generated.ts and the script that writes it): the tokenized stocks by their issuers, and the tokens Jupiter
 * lists as verified.
 *
 * About the tokenized stocks: all are Token-2022 mints. Their issuer can freeze any token account, pause all
 * transfers, and move or burn tokens through a permanent delegate, which reaches every pool and wallet holding
 * them. They are regulated products with their own terms and regional limits on who may hold them. The pre-IPO
 * ones also charge a transfer fee.
 */
const listed: QuoteSpec[] = generatedQuotes.map(([group, symbol, name, mint, decimals, usd, minRaise, liquidity, scale = 1, feeBps = 0, feeMax = "", blocked = ""]) => {
  const g = group as QuoteGroup;
  return {
    symbol,
    name,
    mint,
    decimals,
    category: issuers[g] ? "stock" : g === "memes" ? "meme" : "crypto",
    group: g,
    issuer: issuers[g],
    logo: "",
    refUsd: usd,
    uiMultiplier: scale,
    transferFeeBps: feeBps,
    transferFeeMax: feeMax || undefined,
    minRaise: Number(minRaise) / 10 ** decimals,
    liquidityUsd: liquidity,
    blocked: blocked || undefined,
  };
});

const sol = base[0]!;
const usdc = base[1]!;

/** Every quote asset a coin can launch against. */
export const quoteCatalog: Record<Cluster, QuoteSpec[]> = {
  "mainnet-beta": [...base, ...listed],
  // LaunchLab's devnet deployment has configs for SOL and Raydium's own devnet USDC, both with no floor on the raise
  devnet: [
    { ...sol, minRaise: 0.000000001 },
    { ...usdc, name: "USDC (devnet)", mint: "USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT" },
  ],
};
