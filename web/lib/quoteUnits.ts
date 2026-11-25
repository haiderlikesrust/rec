import { formatRaw, toRaw, tokens } from "./format";

/*
 * Amounts and prices of a pair token, the way a wallet shows them.
 *
 * The API counts every amount and price in whole units of the raw on-chain amount. A wallet multiplies a balance by
 * the token's display multiplier first (`QuoteAsset.uiMultiplier`: 1 for SOL, the stablecoins and most stocks; a
 * stock's issuer moves it for splits and dividends). To match the wallet:
 *
 *   shown amount = raw amount × multiplier
 *   shown price  = price per raw unit ÷ multiplier
 *   amount sent  = typed amount ÷ multiplier
 *
 * A value in dollars is the same either way, so only token amounts and per-token prices pass through here. With a
 * multiplier of 1 every function returns exactly what format.ts does.
 */

/** The two fields of a quote asset the conversions read. */
export type QuoteUnit = { decimals: number; uiMultiplier?: number | null };

/** Multipliers are applied as integers of this many decimal places, so amounts never pass through a float. */
const SCALE_DIGITS = 12;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

/** The display multiplier, or 1 when the asset has none (or a value no wallet could use). */
export function multiplierOf(q?: QuoteUnit | null): number {
  const m = q?.uiMultiplier;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
}

const scaled = (m: number) => BigInt(Math.round(m * 10 ** SCALE_DIGITS));
const big = (raw: bigint | string | null | undefined) => {
  if (typeof raw === "bigint") return raw;
  try {
    return BigInt(raw || "0");
  } catch {
    return 0n;
  }
};

/** Raw base units → the base units a wallet shows, rounded down as wallets do. */
export function shownBase(raw: bigint | string | null | undefined, q: QuoteUnit): bigint {
  const v = big(raw);
  const m = multiplierOf(q);
  return m === 1 ? v : (v * scaled(m)) / SCALE;
}

/**
 * A typed amount → raw base units to send: the smallest raw amount a wallet shows as at least what was typed. So an
 * amount no larger than the shown balance never asks for more than the wallet holds.
 */
export function typedToRaw(input: string, q: QuoteUnit): bigint {
  const shown = toRaw(input, q.decimals);
  const m = multiplierOf(q);
  if (m === 1) return shown;
  const k = scaled(m);
  return (shown * SCALE + k - 1n) / k;
}

/** Raw base units → the exact text for an amount field. With a multiplier of 1 or more, `typedToRaw` reads it back as the same raw amount. */
export const rawToTyped = (raw: bigint | string, q: QuoteUnit) => formatRaw(shownBase(raw, q), q.decimals);

/** Raw base units → a display string like `tokens`: "137.1", "1.2K SNDK". */
export const quoteTokens = (raw: bigint | string | null | undefined, q: QuoteUnit, symbol?: string) =>
  tokens(shownBase(raw, q), q.decimals, symbol);

/** A number of whole raw units (an API amount such as `graduationThreshold`) → the number of tokens a wallet shows. */
export const shownUnits = (wholeRawUnits: number, q: QuoteUnit) => wholeRawUnits * multiplierOf(q);

/** A price per whole raw unit (`usdPerUnit`, `solPerUnit`) → the price of one token as a wallet counts them. */
export const shownPrice = (perRawUnit: number, q: QuoteUnit) => perRawUnit / multiplierOf(q);
