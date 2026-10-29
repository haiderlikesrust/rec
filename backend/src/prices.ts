import { GRADUATION_MCAP_USD, NATIVE_MINT, START_MCAP_USD, quoteCatalog, type QuoteAsset, type QuoteCategory } from "@cook/shared";
import { config, log } from "./config";
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

type JupToken = { id: string; usdPrice?: number; icon?: string; decimals?: number };

/** Live USD prices (and logos) for every quote from Jupiter's token API. Keeps the last good price on failure. */
export async function refreshPrices() {
  const quotes = all<QuoteRow>("SELECT * FROM quote");
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
      const res = await fetch(`${config.jupiterApi}/tokens/v2/search?query=${ids.slice(i, i + 40).join(",")}`, {
        headers: config.jupiterKey ? { "x-api-key": config.jupiterKey } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(String(res.status));
      for (const t of (await res.json()) as JupToken[]) got.set(t.id, t);
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

type ConfigRow = { address: string; quote: string; quote_usd: number; threshold: string; created_at: number };

/** The config new coins on a quote launch from: the newest active one, if its price band is still current. */
export function activeConfig(mint: string): ConfigRow | undefined {
  return one<ConfigRow>("SELECT * FROM config WHERE quote = ? AND active = 1 ORDER BY created_at DESC LIMIT 1", mint);
}

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
