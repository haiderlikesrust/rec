import type { LaunchpadConfigInfo } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { RAYDIUM_PLATFORM_FEE_CAP_BPS, TAX_BPS } from "@gantry/shared";
import { COIN_DECIMALS, launchCurve, ppm, type LaunchCurve } from "../curve";
import { UserError } from "../engine";

const RATE = 1_000_000n;
const big = (v: BN) => BigInt(v.toString());

/**
 * The limits a quote's LaunchLab global config puts on a launch (rates are parts per million of the supply): the
 * least it may raise, the least of the supply it may sell on the curve and move to the CPMM pool, the smallest supply
 * (whole coins), and the flat fee Raydium takes out of the raise at migration.
 */
export type LaunchLimits = { minRaise: bigint; minSellRate: bigint; minMigrateRate: bigint; minSupply: bigint; migrateFee: bigint };

export const launchLimits = (cfg: LaunchpadConfigInfo): LaunchLimits => ({
  minRaise: big(cfg.minFundRaisingB),
  minSellRate: big(cfg.minSellRateA),
  minMigrateRate: big(cfg.minMigrateRateA),
  minSupply: big(cfg.minSupplyA),
  migrateFee: big(cfg.migrateFee),
});

/**
 * Why this launchpad's curve can't be opened under a config whatever the quote's price, or null: the share of the
 * supply it sells and the share it moves to the pool are the same on every quote, so only the floor on the raise
 * depends on the price.
 */
export function shapeTrouble(symbol: string, limits: LaunchLimits): string | null {
  const c = launchCurve(1, 6);
  const fits = c.supply >= limits.minSupply * 10n ** BigInt(COIN_DECIMALS) && c.sell * RATE >= c.supply * limits.minSellRate && (c.supply - c.sell) * RATE >= c.supply * limits.minMigrateRate;
  return fits ? null : `Raydium's limits on ${symbol} curves don't fit this launchpad's curve.`;
}

/**
 * The curve a coin launched now on this quote gets: 1B supply, 6 decimals, from START_MCAP_USD to
 * GRADUATION_MCAP_USD at the quote's live USD price, nothing locked or vested. LaunchLab takes three numbers (supply,
 * coins to sell, quote to raise) and derives the virtual reserves itself. Throws a UserError when the quote's config
 * doesn't allow that curve: in practice when the raise, about $6k, is below the config's floor in the quote.
 */
export function launchParams(q: { symbol: string; usd: number; decimals: number }, limits: LaunchLimits): LaunchCurve {
  if (!(q.usd > 0)) throw new UserError(`No live USD price for ${q.symbol} yet, so its curve can't be priced. Try another pair.`);
  const curve = launchCurve(q.usd, q.decimals, limits.migrateFee);
  const units = (raw: bigint) => (Number(raw) / 10 ** q.decimals).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (curve.raise < limits.minRaise)
    throw new UserError(
      `Raydium only opens ${q.symbol} curves that raise at least ${units(limits.minRaise)} ${q.symbol}. At today's price a curve here raises ${units(curve.raise)} ${q.symbol}, so launches on ${q.symbol} are paused. Pick another pair.`,
    );
  const fits =
    curve.supply >= limits.minSupply * 10n ** BigInt(COIN_DECIMALS) &&
    curve.sell * RATE >= curve.supply * limits.minSellRate &&
    (curve.supply - curve.sell) * RATE >= curve.supply * limits.minMigrateRate &&
    curve.raise > limits.migrateFee;
  if (!fits) throw new UserError(`Raydium's limits on ${q.symbol} curves don't allow this launchpad's curve right now. Pick another pair.`);
  return curve;
}

/**
 * The platform fee that tops Raydium's own protocol fee up to TAX_BPS, in parts per million, held to LaunchLab's cap
 * on platform fees. `protocolRate`: the global config's trade_fee_rate.
 */
export function platformFeeRate(protocolRate: bigint) {
  const want = ppm(TAX_BPS) - protocolRate;
  const cap = ppm(RAYDIUM_PLATFORM_FEE_CAP_BPS);
  return want < 0n ? 0n : want > cap ? cap : want;
}

/**
 * What goes on the platform config (one per platform admin, here the fee wallet):
 *  - `feeRate` on every curve trade, nothing for the coin's creator;
 *  - at graduation the whole LP of the new CPMM pool is locked for the platform (none for the creator, none burned),
 *    and its Fee Key NFT goes to the fee wallet.
 * Who the CPMM pool records as its creator, and so who collects its creator fee, is set by a second instruction.
 */
export const platformParams = (feeRate: bigint) => ({
  migrateCpLockNftScale: { platformScale: new BN(1_000_000), creatorScale: new BN(0), burnScale: new BN(0) },
  feeRate: new BN(feeRate.toString()),
  creatorFeeRate: new BN(0),
  platformVestingScale: new BN(0),
});
