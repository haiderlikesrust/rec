import { quoteCategories, quoteGroups } from "@gantry/shared";

const groupLabels: Record<string, string> = Object.fromEntries(quoteGroups.map((g) => [g.key, g.label]));

/*
 * What the pages need to know about a pair's token beyond its price: which group it is listed under, whether it is
 * one of the main pairs every picker offers up front, and the fee its issuer takes on transfers.
 *
 * The catalog of pairs is growing, and the API is growing two fields with it: `group` (the heading a pair is listed
 * under) and `transferFeeBps` (a fee the token's issuer charges on every transfer). Both are read here when they are
 * present, so the pages switch over the day the API sends them.
 */

/** The fields of a quote asset (API or shared catalog) these helpers read. */
export type ListedPair = { symbol: string; category: string; issuer?: string | null };

/** The heading a pair is listed under: the API's own group when it names one, else the token's issuer, else its category. */
export function groupOf(q: ListedPair): string {
  const group = (q as { group?: unknown }).group;
  if (typeof group === "string" && group.trim()) return groupLabels[group.trim()] ?? group.trim();
  return q.issuer || (quoteCategories as Record<string, string>)[q.category] || "Other";
}

/** The distinct groups of a list of pairs, in the order the list first names them, each with its pairs. */
export function groupPairs<T extends ListedPair>(quotes: readonly T[]): { name: string; items: T[] }[] {
  const out = new Map<string, T[]>();
  for (const q of quotes) {
    const name = groupOf(q);
    const items = out.get(name);
    if (items) items.push(q);
    else out.set(name, [q]);
  }
  return [...out].map(([name, items]) => ({ name, items }));
}

/** SOL and the main stablecoins, in the order they are offered. */
const MAIN = ["SOL", "USDC", "USDT", "USD1"];

/** True for SOL and the main stablecoins themselves, not for another issuer's token that carries one of their tickers. */
export const isMainPair = (q: ListedPair) => MAIN.includes(q.symbol) && !q.issuer;

/** The main pairs of a list, in their fixed order: the first pair listed under each of their tickers. */
export function mainPairs<T extends ListedPair>(quotes: readonly T[]): T[] {
  return MAIN.flatMap((symbol) => {
    const q = quotes.find((x) => x.symbol === symbol && isMainPair(x));
    return q ? [q] : [];
  });
}

/** The fee a token's issuer charges on every transfer of it, in basis points. 0 for a token without one. */
export function transferFeeBps(q: object): number {
  const fee = (q as { transferFeeBps?: unknown }).transferFeeBps;
  return typeof fee === "number" && Number.isFinite(fee) && fee > 0 ? fee : 0;
}
