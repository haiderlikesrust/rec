import { GRADUATION_MCAP_USD, NATIVE_MINT, START_MCAP_USD, quoteCatalog, type QuoteAsset, type QuoteCategory } from "@cook/shared";
import { config, log } from "./config";
import { curveFor } from "./curve";
import { all, one, run, type QuoteRow } from "./db";

/** Seeds the quote table from the shared catalog (keeps live prices and availability already stored). */
export function syncQuotes() {
  for (const q of quoteCatalog[config.cluster]) {
    run(
      `INSERT INTO quote (mint, symbol, name, category, logo, decimals, usd) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mint) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, category = excluded.category,
         logo = CASE WHEN quote.logo = '' THEN excluded.logo ELSE quote.logo END`,
      q.mint,
      q.symbol,
      q.name,
      q.category,
      q.logo,
      q.decimals,
      q.refUsd,
    );
  }
}

export type JupToken = {
  id: string;
  name?: string;
  symbol?: string;
  usdPrice?: number;
  icon?: string;
  decimals?: number;
  liquidity?: number;
  mcap?: number;
  launchpad?: string;
};

/** Jupiter's token API for up to 40 mints at a time. Throws when Jupiter is unreachable. */
export async function jupTokens(ids: string[]): Promise<JupToken[]> {
  const res = await fetch(`${config.jupiterApi}/tokens/v2/search?query=${ids.join(",")}`, {
    headers: config.jupiterKey ? { "x-api-key": config.jupiterKey } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as JupToken[]).filter((t) => ids.includes(t.id));
}

/** Fresh USD price for one quote right before it's used (custom pairs are only refreshed while they have coins). */
export async function refreshQuotePrice(mint: string) {
  const t = (await jupTokens([mint]).catch(() => []))[0];
  if (t?.usdPrice) run("UPDATE quote SET usd = ?, price_at = ? WHERE mint = ?", t.usdPrice, Math.floor(Date.now() / 1000), mint);
}

/** Live USD prices (and logos) for every quote from Jupiter's token API. Keeps the last good price on failure. */
export async function refreshPrices() {
  // custom pairs nobody has launched on yet are priced when they're used
  const quotes = all<QuoteRow>("SELECT * FROM quote WHERE category != 'custom' OR mint IN (SELECT quote FROM coin)");
  // devnet mints have no market; price them like their mainnet twins
  const lookup = new Map(quotes.map((q) => [q.mint, q.mint]));
  if (config.cluster === "devnet") {
    const usdc = quoteCatalog["mainnet-beta"].find((q) => q.symbol === "USDC")!.mint;
    for (const q of quotes) if (q.symbol === "USDC") lookup.set(q.mint, usdc);
  }
  const ids = [...new Set(lookup.values())];
  const got = new Map<string, JupToken>();
  for (let i = 0; i < ids.length; i += 40) {
    try {
      for (const t of await jupTokens(ids.slice(i, i + 40))) got.set(t.id, t);
    } catch (e) {
      log(`prices: Jupiter unavailable (${(e as Error).message}); keeping last prices`);
      return false;
    }
  }
  const now = Math.floor(Date.now() / 1000);
  for (const q of quotes) {
    const t = got.get(lookup.get(q.mint)!);
    if (!t?.usdPrice) continue;
    run("UPDATE quote SET usd = ?, price_at = ?, logo = COALESCE(NULLIF(?, ''), logo) WHERE mint = ?", t.usdPrice, now, t.icon ?? "", q.mint);
  }
  return true;
}

export const quoteRow = (mint: string) => one<QuoteRow>("SELECT * FROM quote WHERE mint = ?", mint);
export const solUsd = () => quoteRow(NATIVE_MINT)?.usd || config.solUsdFallback;
/** SOL per whole unit of a quote. */
export const solPerUnit = (mint: string) => (mint === NATIVE_MINT ? 1 : (quoteRow(mint)?.usd ?? 0) / solUsd());

export const toUnits = (raw: bigint | string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
export const fromUnits = (units: number, decimals: number) => BigInt(Math.floor(units * 10 ** decimals));

type ConfigRow = {
  address: string;
  quote: string;
  quote_usd: number;
  threshold: string;
  created_at: number;
  start_mcap_usd: number;
  grad_mcap_usd: number;
};

/** The config new coins on a quote launch from: the newest active one, if its price band is still current. */
export function activeConfig(mint: string): ConfigRow | undefined {
  return one<ConfigRow>("SELECT * FROM config WHERE quote = ? AND active = 1 ORDER BY created_at DESC LIMIT 1", mint);
}

/** True for a config built for today's start and graduation market caps; an older one is replaced at the next launch. */
export const currentTargets = (c: ConfigRow) => c.start_mcap_usd === START_MCAP_USD && c.grad_mcap_usd === GRADUATION_MCAP_USD;

/** The curve a config's coins trade on, from the market caps it was built for. */
export const configCurve = (c: Pick<ConfigRow, "quote_usd" | "start_mcap_usd" | "grad_mcap_usd">) =>
  curveFor(c.start_mcap_usd / c.quote_usd, c.grad_mcap_usd / c.quote_usd);

export function toQuoteAsset(q: QuoteRow): QuoteAsset {
  const cfg = activeConfig(q.mint);
  return {
    address: q.mint,
    symbol: q.symbol,
    name: q.name,
    category: q.category as QuoteCategory,
    logo: q.logo,
    decimals: q.decimals,
    solPerUnit: solPerUnit(q.mint),
    usdPerUnit: q.usd,
    startMcapUsd: START_MCAP_USD,
    graduationMcapUsd: GRADUATION_MCAP_USD,
    config: cfg?.address ?? null,
    graduationThreshold: cfg ? toUnits(cfg.threshold, q.decimals) : 0,
    available: q.available === 1,
  };
}
