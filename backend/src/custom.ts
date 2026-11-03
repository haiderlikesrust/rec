import { NATIVE_MINT, isSolanaAddress, type TokenPreview } from "@cook/shared";
import { jupQuote } from "./chain/jupiter";
import { one, run, type QuoteRow } from "./db";
import { UserError, type Engine } from "./engine";
import { jupTokens, quoteRow, refreshQuotePrice } from "./prices";

/**
 * Custom pairs: any Solana token a launcher pastes in, on top of the curated quotes. A coin graduates with about
 * $6.7k of its quote in the pool, so a quote worth less than that in total could never graduate one. Set
 * CUSTOM_PAIR_MIN_MCAP_USD=0 to allow any size.
 */
const MIN_MCAP_USD = Number(process.env.CUSTOM_PAIR_MIN_MCAP_USD ?? 10_000);
// fees on a custom pair are sold for SOL through Jupiter: this much has to sell without moving the price too far
const PROBE_USD = 50;
const MAX_PROBE_IMPACT = 0.05;
const PER_HOUR = 30;
const added: number[] = [];

const usd = (n: number) => `$${n >= 1000 ? `${Math.round(n / 1000)}k` : n.toFixed(0)}`;

/** A pasted token's name, ticker, logo and size from Jupiter, before it's added. */
export async function previewToken(mint: string): Promise<TokenPreview> {
  if (!isSolanaAddress(mint)) throw new UserError("Paste a token's mint address.");
  const t = (await jupTokens([mint]).catch(() => {
    throw new UserError("Can't reach Jupiter to look this token up. Try again in a moment.");
  }))[0];
  if (!t) throw new UserError("Jupiter doesn't list this token yet.");
  const symbol = cleanSymbol(t.symbol, mint);
  return {
    address: mint,
    symbol,
    name: (t.name ?? symbol).trim().slice(0, 40),
    logo: t.icon ?? "",
    usdPrice: t.usdPrice ?? 0,
    mcapUsd: t.mcap ?? null,
    liquidityUsd: t.liquidity ?? null,
    launchpad: t.launchpad ?? null,
  };
}

const cleanSymbol = (symbol: string | undefined, mint: string) =>
  (symbol ?? "").trim().replace(/\s+/g, "").slice(0, 12) || mint.slice(0, 4).toUpperCase();

/** Adds `mint` as a custom pair after checking it can work as one, or returns it if it's already a pair. */
export async function addCustomQuote(engine: Engine, mint: string): Promise<QuoteRow> {
  if (!isSolanaAddress(mint)) throw new UserError("Paste a token's mint address.");
  const known = quoteRow(mint);
  if (known) {
    if (!known.available) throw new UserError(known.error ? "Meteora doesn't accept this token as a pair." : "That pair isn't available.");
    if (known.category === "custom") await refreshQuotePrice(mint);
    return quoteRow(mint)!;
  }
  const now = Date.now();
  while (added.length && now - added[0]! > 3_600_000) added.shift();
  if (added.length >= PER_HOUR) throw new UserError("Too many new pairs this hour. Try again in a few minutes.");

  const t = (await jupTokens([mint]).catch(() => {
    throw new UserError("Can't reach Jupiter to price this token. Try again in a moment.");
  }))[0];
  if (!t?.usdPrice) throw new UserError("Jupiter has no price for this token yet. Try again once it's trading.");
  const symbol = cleanSymbol(t.symbol, mint);
  if (t.mcap !== undefined && t.mcap < MIN_MCAP_USD)
    throw new UserError(
      `${symbol} is worth ${usd(t.mcap)} in total. A coin needs about $6.7k of its pair token to graduate, so custom pairs need a ${usd(MIN_MCAP_USD)}+ market cap.`,
    );
  // a lookalike of a listed pair (a fake USDC, say) would read as the real one on every coin page
  if (one("SELECT 1 FROM quote WHERE category != 'custom' AND UPPER(symbol) = UPPER(?)", symbol)) throw new UserError(`${symbol} is already a listed pair. Pick it from the list instead.`);

  const decimals = (await engine.checkQuoteMint(mint))?.decimals ?? t.decimals;
  if (decimals === undefined) throw new UserError("Couldn't read this token's decimals.");
  const probe = BigInt(Math.max(1, Math.floor((PROBE_USD / t.usdPrice) * 10 ** decimals)));
  const route = await jupQuote(mint, NATIVE_MINT, probe, 300).catch(() => null);
  if (!route || Number(route.priceImpactPct) > MAX_PROBE_IMPACT)
    throw new UserError(`${symbol} can't be sold for SOL through Jupiter without a big price hit, and that's how its fees reach the SOL buckets.`);

  added.push(now);
  run(
    "INSERT OR IGNORE INTO quote (mint, symbol, name, category, logo, decimals, usd, price_at) VALUES (?, ?, ?, 'custom', ?, ?, ?, ?)",
    mint,
    symbol,
    (t.name ?? symbol).trim().slice(0, 40),
    t.icon ?? "",
    decimals,
    t.usdPrice,
    Math.floor(now / 1000),
  );
  return quoteRow(mint)!;
}
