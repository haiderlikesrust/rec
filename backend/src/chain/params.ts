import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { GRADUATION_MCAP_USD, LAUNCH_FEE_SOL, SNIPE, START_MCAP_USD, TAX_BPS } from "@cook/shared";
import { SUPPLY } from "../curve";

/**
 * The Meteora DBC config every Recur coin on a quote launches from, priced so the coin starts at $2.5k and
 * graduates at $30k at the quote's current USD price:
 *  - 1B supply, 6 decimals, immutable metadata, no vesting, no leftover.
 *  - 3% fee on the quote side of every swap, all of it to the partner (Recur's fee wallet), 0% to the creator;
 *    an exponential scheduler starts it at 99% and decays to 3% over the first 6 seconds (anti-snipe).
 *  - Graduates to a DAMM v2 pool with the same 3% (quote-side), with 100% of the LP permanently locked to the
 *    fee wallet, so post-graduation trading fees keep flowing to the buckets.
 *  - A 0.01 SOL pool creation fee that funds the platform buyback.
 *
 * Quotes with a Token-2022 transfer fee (PreStocks, Tessera) must graduate to a Compounding DAMM v2 pool. With
 * compoundingFeeBps 0 it works like QuoteToken for us: every fee is charged in the quote and all of it is claimable.
 */
export function configParams(quoteUsd: number, quoteDecimals: number, quoteHasTransferFee = false) {
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quoteDecimals,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: SUPPLY,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: {
          startingFeeBps: SNIPE.startBps,
          endingFeeBps: TAX_BPS,
          numberOfPeriod: SNIPE.periods,
          totalDuration: SNIPE.seconds,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: LAUNCH_FEE_SOL,
      enableFirstSwapWithMinFee: true,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: quoteHasTransferFee ? MigratedCollectFeeMode.Compounding : MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: TAX_BPS,
        compoundingFeeBps: 0,
      },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: START_MCAP_USD / quoteUsd,
    migrationMarketCap: GRADUATION_MCAP_USD / quoteUsd,
  });
}
