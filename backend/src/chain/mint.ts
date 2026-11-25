import {
  AccountState,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getDefaultAccountState,
  getExtensionTypes,
  getPausableConfig,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";
import { PublicKey, type AccountInfo } from "@solana/web3.js";

/** The extensions Raydium's CPMM takes on a Token-2022 mint that isn't in its registry of accepted mints. */
const CPMM_EXTENSIONS = new Set([
  ExtensionType.TransferFeeConfig,
  ExtensionType.MetadataPointer,
  ExtensionType.TokenMetadata,
  ExtensionType.InterestBearingConfig,
  ExtensionType.ScaledUiAmountConfig,
]);

/** The highest transfer fee a quote may charge and still take launches: every hop of it is paid by traders and by the fee buckets. */
export const MAX_TRANSFER_FEE_BPS = 500;

/** A Token-2022 transfer fee: `bps` of every transfer, at most `max` raw units, kept back by the mint. */
export type MintFee = { bps: number; max: bigint };

/**
 * What a quote's mint says about itself.
 *
 * `scale`: what wallets multiply an amount of it by before showing it (Token-2022's scaled UI amount; 1 without it).
 *
 * `fee`: the transfer fee in force in `epoch`, or null. LaunchLab and CPMM price it in, and so do the quotes, Fleet
 * entries and fee bookkeeping here (see curve.ts), so it doesn't hold a quote back while it is MAX_TRANSFER_FEE_BPS
 * or less, now and in the change already scheduled.
 *
 * `trouble`: why coins can't be launched on it right now, as a sentence for the launcher, or null. LaunchLab takes
 * any mint Raydium made a config for, so this is where a quote is held to what the rest of the launchpad assumes:
 *  - transfers work: not paused by the issuer, no program of the issuer's run on each one, and new token accounts
 *    (a new curve's vault is one) don't start frozen;
 *  - the curve can graduate: CPMM refuses to open a pool on a Token-2022 mint that carries an extension outside its
 *    short list unless Raydium has put the mint in CPMM's registry (`registered`).
 *
 * What it can't rule out: an issuer with a freeze authority or a permanent delegate (every tokenized stock has both)
 * can freeze or empty any account of its token, a pool's vault included, and a fee authority can raise the fee two
 * epochs ahead. Those are the issuer's standing powers over its own token, not a state to wait out.
 */
export function inspectMint(symbol: string, address: PublicKey, info: AccountInfo<Buffer>, registered: boolean, epoch: number, now = Date.now() / 1000) {
  const none: { scale: number; fee: MintFee | null; trouble: string | null } = { scale: 1, fee: null, trouble: null };
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return none;
  if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) return { ...none, trouble: `${symbol} isn't an SPL token.` };
  const mint = unpackMint(address, info, info.owner);
  const scaled = getScaledUiAmountConfig(mint);
  const scale = scaled ? (now >= Number(scaled.newMultiplierEffectiveTimestamp) ? scaled.newMultiplier : scaled.multiplier) : 1;
  const config = getTransferFeeConfig(mint);
  const active = config ? (BigInt(epoch) >= config.newerTransferFee.epoch ? config.newerTransferFee : config.olderTransferFee) : null;
  const fee = active && active.transferFeeBasisPoints > 0 ? { bps: active.transferFeeBasisPoints, max: active.maximumFee } : null;
  const highest = config ? Math.max(config.olderTransferFee.transferFeeBasisPoints, config.newerTransferFee.transferFeeBasisPoints) : 0;
  const hook = getTransferHook(mint);
  const fresh = getDefaultAccountState(mint);
  let trouble: string | null = null;
  if (getPausableConfig(mint)?.paused) trouble = `${symbol}'s issuer has paused its transfers.`;
  else if (hook && !hook.programId.equals(PublicKey.default)) trouble = `${symbol} runs its issuer's program on every transfer.`;
  else if (fresh && fresh.state !== AccountState.Initialized) trouble = `New ${symbol} accounts start frozen.`;
  else if (highest > MAX_TRANSFER_FEE_BPS) trouble = `${symbol} takes ${highest / 100}% of every transfer, more than pairs here allow.`;
  else if (!registered && getExtensionTypes(mint.tlvData).some((e) => !CPMM_EXTENSIONS.has(e)))
    trouble = `Raydium's pools don't take ${symbol}, so a curve on it could never graduate.`;
  return { scale: scale > 0 ? scale : 1, fee, trouble };
}
