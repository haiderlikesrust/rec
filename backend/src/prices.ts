import { GRADUATION_MCAP_USD, NATIVE_MINT, START_MCAP_USD, quoteCatalog, quoteGroups, type QuoteAsset, type QuoteCategory, type QuoteGroup, type QuoteGroupInfo, type StockIssuer } from "@gantry/shared";
import { config, log } from "./config";
import { launchCurve, type TransferFee } from "./curve";
import { all, big, one, run, type QuoteRow } from "./db";

export const toUnits = (raw: bigint | string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
export const fromUnits = (units: number, decimals: number) => BigInt(Math.floor(units * 10 ** decimals));

/**
 * Seeds the quote table from the shared catalog (keeps live prices and availability already stored). What the
 * catalog copied from the chain and from Jupiter (the floor on a curve's raise, the display multiplier, the transfer
 * fee, liquidity, why a quote was off) is where a new row starts; the chain engine and the price refresh replace it
 * with what they read. The demo, which reads no chain, keeps the copies.
 */
export function syncQuotes() {
  for (const q of quoteCatalog[config.cluster]) {
    run(
      `INSERT INTO quote (mint, symbol, name, category, grp, issuer, logo, decimals, usd, ui_scale, fee_bps, fee_max, liquidity, min_raise, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mint) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, category = excluded.category, grp = excluded.grp,
         issuer = excluded.issuer, min_raise = excluded.min_raise, logo = CASE WHEN quote.logo = '' THEN excluded.logo ELSE quote.logo END`,
      q.mint,
      q.symbol,
      q.name,
      q.category,
      q.group,
      q.issuer ?? "",
      q.logo,
      q.decimals,
      q.refUsd,
      q.uiMultiplier ?? 1,
      q.transferFeeBps ?? 0,
      q.transferFeeMax ?? "",
      q.liquidityUsd ?? 0,
      // the floors are whole raw units written as decimals: rounding undoes the float
      BigInt(Math.round(q.minRaise * 10 ** q.decimals)).toString(),
      q.blocked ?? null,
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
  stats24h?: { priceChange?: number };
};

/** The most mints Jupiter's token API answers for in one request; it drops the rest without saying so. */
const JUP_BATCH = 100;
/** Between two requests of one refresh: the keyless host turns away bursts. */
const JUP_PAUSE_MS = 2000;
/** A live quote's price may be this old before coins stop being launched on it. */
const PRICE_MAX_AGE = 30 * 60;
/** At a launch, the answer on a live quote's route to SOL may be this old (the launch asks again well before). */
const ROUTE_MAX_AGE = 45 * 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jupiter's token records for up to JUP_BATCH mints. Throws when Jupiter is unreachable. */
export async function jupTokens(ids: string[]): Promise<JupToken[]> {
  const res = await fetch(`${config.jupiterApi}/tokens/v2/search?query=${ids.join(",")}`, {
    headers: config.jupiterKey ? { "x-api-key": config.jupiterKey } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as JupToken[]).filter((t) => ids.includes(t.id));
}

/**
 * Live USD prices, logos and DEX liquidity from Jupiter's token API, a batch of mints per request. With hundreds of
 * quotes a pass refreshes the ones in use (SOL, the stablecoins and every quote a coin trades against) and the batch
 * of the others that has waited longest, so each pass is two or three requests and every quote comes round within a
 * few minutes; `everything` refreshes them all (start-up, a handful of requests). A launch refreshes its own quote
 * first (refreshPrice). A batch that fails leaves its quotes on their last good price.
 *
 * Jupiter prices a token as wallets show it, so a mint that scales its displayed amounts is priced per displayed
 * token: times its multiplier, that is the price of a whole unit of the raw amount, which is what everything here
 * counts in.
 */
export async function refreshPrices(everything = false) {
  const quotes = all<QuoteRow & { used: number }>(
    `SELECT q.*, (q.category IN ('solana', 'currency') OR EXISTS (SELECT 1 FROM coin c WHERE c.quote = q.mint)) AS used FROM quote q ORDER BY used DESC, q.price_at, q.rowid`,
  );
  const hot = quotes.filter((q) => q.used);
  const cold = quotes.filter((q) => !q.used);
  const due = everything ? quotes : [...hot, ...cold.slice(0, JUP_BATCH)];
  let failed = "";
  for (let i = 0; i < due.length; i += JUP_BATCH) {
    if (i) await sleep(JUP_PAUSE_MS);
    failed = (await priceBatch(due.slice(i, i + JUP_BATCH))) ?? failed;
  }
  if (failed) log(`prices: Jupiter unavailable (${failed}); keeping the last prices`);
  return !failed;
}

/** One quote's price, right now. */
export const refreshPrice = async (mint: string) => {
  const q = quoteRow(mint);
  if (q) await priceBatch([q]);
};

async function priceBatch(quotes: QuoteRow[]) {
  // devnet mints have no market; price them like their mainnet twins
  const twin = (q: QuoteRow) => (config.cluster === "devnet" && q.symbol === "USDC" ? quoteCatalog["mainnet-beta"].find((x) => x.symbol === "USDC")!.mint : q.mint);
  let got: Map<string, JupToken> | null = null;
  for (let attempt = 0; !got; attempt++) {
    try {
      got = new Map((await jupTokens([...new Set(quotes.map(twin))])).map((t) => [t.id, t]));
    } catch (e) {
      // turned away for asking too fast: wait it out twice before giving the batch up for this pass
      if ((e as Error).message !== "429" || attempt >= 2) return (e as Error).message;
      await sleep(JUP_PAUSE_MS * 2 * (attempt + 1));
    }
  }
  const now = Math.floor(Date.now() / 1000);
  for (const q of quotes) {
    const t = got.get(twin(q));
    if (!t?.usdPrice) continue;
    run(
      "UPDATE quote SET usd = ?, price_at = ?, liquidity = ?, logo = COALESCE(NULLIF(?, ''), logo) WHERE mint = ?",
      t.usdPrice * q.ui_scale,
      now,
      t.liquidity ?? 0,
      t.icon ?? "",
      q.mint,
    );
  }
  return null;
}

export const quoteRow = (mint: string) => one<QuoteRow>("SELECT * FROM quote WHERE mint = ?", mint);
export const solUsd = () => quoteRow(NATIVE_MINT)?.usd || config.solUsdFallback;
/** SOL per whole unit of a quote. */
export const solPerUnit = (mint: string) => (mint === NATIVE_MINT ? 1 : (quoteRow(mint)?.usd ?? 0) / solUsd());
/** A quote's own transfer fee, or null (see curve.ts). */
export const transferFeeOf = (q: Pick<QuoteRow, "fee_bps" | "fee_max"> | undefined): TransferFee =>
  q && q.fee_bps > 0 ? { bps: BigInt(q.fee_bps), max: q.fee_max ? BigInt(q.fee_max) : 2n ** 64n - 1n } : null;
export const quoteFee = (mint: string) => transferFeeOf(quoteRow(mint));

/** What a curve launched on this quote now raises before it graduates, raw. */
export const graduationRaise = (q: Pick<QuoteRow, "usd" | "decimals">) => (q.usd > 0 ? launchCurve(q.usd, q.decimals).raise : 0n);

/**
 * Why a coin can't be launched on this quote right now, in a sentence for the launcher, or null when it can. A quote
 * needs a LaunchLab config, a price (it sets what the curve sells for and raises), a mint in a state pools can
 * trade, enough of a market for the fees it earns to be turned into SOL, and a raise that clears the config's floor.
 *
 * `live`: on a real cluster nothing is taken from the catalog's copies. A quote the chain engine hasn't read yet
 * takes no launches, and neither does one whose price Jupiter hasn't confirmed lately.
 *
 * `launching`: the list of quotes goes by liquidity until a quote's route to SOL has been asked for, which takes the
 * first hour a backend runs. A launch doesn't: it asks (Engine.checkQuote) and is refused while there is no recent
 * answer, so no coin is ever launched on a quote whose route nobody looked at.
 */
export function unavailableReason(q: QuoteRow, live = !config.demo, now = Math.floor(Date.now() / 1000), launching = false): string | null {
  if (!q.available) return "That quote asset isn't available.";
  if (live && !q.checked_at) return `${q.symbol} is still being checked. Try again in a minute.`;
  if (!(q.usd > 0) || (live && now - q.price_at > PRICE_MAX_AGE)) return `No live USD price for ${q.symbol} right now, so its curve can't be priced.`;
  if (q.error) return q.error;
  if (q.route_error) return q.route_error;
  // (a liquidity of zero is Jupiter not having said: the route to SOL, asked for before any launch, settles those)
  if (q.liquidity > 0 && q.liquidity < config.minLiquidityUsd) return `${q.symbol} is too thinly traded right now for its fees to be turned into SOL.`;
  if (graduationRaise(q) < big(q.min_raise))
    return `Launches on ${q.symbol} are paused: at today's price a curve here raises less ${q.symbol} than Raydium asks for.`;
  if (live && launching && q.mint !== NATIVE_MINT && now - q.route_at > ROUTE_MAX_AGE) return `${q.symbol}'s market couldn't be checked just now. Try again in a minute.`;
  return null;
}
export const launchable = (q: QuoteRow) => unavailableReason(q) === null;

export function toQuoteAsset(q: QuoteRow): QuoteAsset {
  const why = unavailableReason(q);
  return {
    address: q.mint,
    symbol: q.symbol,
    name: q.name,
    category: q.category as QuoteCategory,
    group: q.grp as QuoteGroup,
    issuer: (q.issuer || null) as StockIssuer | null,
    logo: q.logo,
    decimals: q.decimals,
    uiMultiplier: q.ui_scale,
    transferFeeBps: q.fee_bps,
    transferFeeMax: q.fee_bps > 0 && q.fee_max ? q.fee_max : null,
    solPerUnit: solPerUnit(q.mint),
    usdPerUnit: q.usd,
    startMcapUsd: START_MCAP_USD,
    graduationMcapUsd: GRADUATION_MCAP_USD,
    graduationThreshold: toUnits(graduationRaise(q), q.decimals),
    available: why === null,
    unavailableReason: why,
  };
}

/** The quotes the API lists: the ones LaunchLab has a config for, in the catalog's order. */
export const listedQuotes = () => all<QuoteRow>("SELECT * FROM quote WHERE available = 1 ORDER BY rowid");

/** The picker's groups that have quotes, in their order, with their counts. */
export function quoteGroupInfo(quotes = listedQuotes()): QuoteGroupInfo[] {
  return quoteGroups
    .map((g) => {
      const mine = quotes.filter((q) => q.grp === g.key);
      return { ...g, count: mine.length, available: mine.filter(launchable).length };
    })
    .filter((g) => g.count > 0);
}
