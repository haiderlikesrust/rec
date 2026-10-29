import { deployments, NATIVE } from "@cook/shared";
import type { Address } from "viem";

export const chainId = Number(process.env.CHAIN_ID ?? 31337);
const d = (deployments as Record<number, Record<string, unknown>>)[chainId]!;
export const addr = (k: string) => (d[k] as string).toLowerCase() as Address;

export const POOL_MANAGER = addr("poolManager");
export const LAUNCHPAD = addr("launchpad");
export const HOOK = addr("hook");
export const FEE_ROUTER = addr("feeRouter");
export const OTC_RESERVE = addr("otcReserve");
export const PROTECTION_FUND = addr("protectionFund");
export const HOLDER_AIRDROP = addr("holderAirdrop");
export const ROUTER = addr("router");
export const ZERO = NATIVE;
export const SUPPLY = 10n ** 27n;
export const Q96 = 2n ** 96n;

/** Addresses that hold coins for the protocol and never count as holders. */
export const SYSTEM = new Set<string>([
  ZERO,
  POOL_MANAGER,
  LAUNCHPAD,
  HOOK,
  FEE_ROUTER,
  OTC_RESERVE,
  HOLDER_AIRDROP,
  ROUTER,
  "0x000000000000000000000000000000000000dead",
]);

/** Whole quote units per whole coin from a v4 sqrt price. */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIsCurrency0: boolean, quoteDecimals: number): number {
  const s = Number(sqrtPriceX96) / 2 ** 96;
  const p = s * s; // currency1 per currency0, raw units
  const quotePerTokenRaw = tokenIsCurrency0 ? p : 1 / p;
  return (quotePerTokenRaw * 1e18) / 10 ** quoteDecimals;
}

/** Quote sitting in a launch pool's locked position (mirrors CookHook._quoteInPool). */
export function quoteInPool(sqrtP: bigint, sqrtStart: bigint, liquidity: bigint, tokenIsCurrency0: boolean): bigint {
  if (!tokenIsCurrency0) {
    // quote is currency0, liquidity below the start price
    if (sqrtP >= sqrtStart) return 0n;
    return (liquidity * Q96 * (sqrtStart - sqrtP)) / sqrtStart / sqrtP;
  }
  if (sqrtP <= sqrtStart) return 0n;
  return (liquidity * (sqrtP - sqrtStart)) / Q96;
}

export type QuoteRow = { address: string; decimals: number; ethPerQuoteWad: bigint };

/** ETH (whole) per one whole unit of the quote. */
export function ethPerUnit(q: QuoteRow): number {
  if (q.address === ZERO) return 1;
  return (Number(q.ethPerQuoteWad) * 10 ** q.decimals) / 1e36;
}

export const toUnits = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;
export const toEth = (raw: bigint, q: QuoteRow) => toUnits(raw, q.decimals) * ethPerUnit(q);
