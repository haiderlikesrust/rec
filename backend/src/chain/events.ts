import { PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import bs58 from "bs58";
import { CPMM_PROGRAM_ID, LAUNCHLAB_PROGRAM_ID, type Cluster, type Venue } from "@gantry/shared";
import { COIN_DECIMALS, cpmmFees, lpShare, type CpmmRates, afterTransferFee, beforeTransferFee, type TransferFee } from "../curve";

/**
 * What Raydium's programs did in a confirmed transaction.
 *
 * LaunchLab emits Anchor events through a self-CPI (`emit_cpi!`): an inner instruction to the program itself whose
 * data is the event-ix tag, the event's discriminator and its Borsh fields. Every curve trade is a TradeEvent. A new
 * pool's PoolCreateEvent names neither its mint nor its platform, so launches are read off the initialize
 * instruction's accounts instead. CPMM logs its SwapEvent as a `Program data:` line (`emit!`), which Solana drops
 * when a transaction's log passes 10 KB; a swap lost that way is missed here, and the holder reconciliation is what
 * catches its balances up.
 *
 * The layouts are Raydium's published IDLs (github.com/raydium-io/raydium-idl, and LaunchLab's on-chain IDL account),
 * checked field by field against mainnet transactions: see events.test.ts and its fixtures.
 */
const EVENT_IX_TAG = "e445a52e51cb9a1d";
const TRADE_EVENT = "bddb7fd34ee661ee";
const SWAP_EVENT = "40c6cde8260871e2";
/** initialize_v2 and initialize_with_token_2022: both list payer, creator, config, platform, authority, pool, mints first */
const INITIALIZE = new Set(["4399af27da102620", "25be7ede2c9aab11"]);

export type LaunchEvent = { kind: "launch"; pool: string; mint: string; quote: string; creator: string; platform: string };
export type CurveTrade = {
  kind: "curve";
  pool: string;
  isBuy: boolean;
  /** quote paid, fees included, on a buy; coins on a sell */
  amountIn: bigint;
  /** coins on a buy; quote received, after fees, on a sell */
  amountOut: bigint;
  protocolFee: bigint;
  platformFee: bigint;
  /** paid to the coin's creator and to a referrer named by whoever built the swap: both zero on swaps built here */
  creatorFee: bigint;
  shareFee: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
  /** coins sold and quote raised after the trade */
  sold: bigint;
  raised: bigint;
  /** the curve sold out with this trade and waits for (or has had) its migration */
  complete: boolean;
};
export type CpmmSwap = {
  kind: "cpmm";
  pool: string;
  inputMint: string;
  outputMint: string;
  /** the pool's two sides before the swap, without the fees it holds for Raydium and the creator */
  inputVaultBefore: bigint;
  outputVaultBefore: bigint;
  /** what reached the pool, fees included, and what left it for the trader */
  inputAmount: bigint;
  outputAmount: bigint;
  /** what each mint's own transfer fee kept back on top: of what the trader sent, and out of what the trader was sent */
  inputTransferFee: bigint;
  outputTransferFee: bigint;
  /** in the input token */
  tradeFee: bigint;
  /** in the input token when `creatorFeeOnInput`, else in the output token */
  creatorFee: bigint;
  creatorFeeOnInput: boolean;
};
export type RaydiumEvent = LaunchEvent | CurveTrade | CpmmSwap;

const key = (b: Buffer, o: number) => new PublicKey(b.subarray(o, o + 32)).toBase58();
const u64 = (b: Buffer, o: number) => b.readBigUInt64LE(o);

function tradeEvent(b: Buffer): CurveTrade {
  // pool_state, total_base_sell, virtual_base, virtual_quote, real_base_before, real_quote_before, real_base_after,
  // real_quote_after, amount_in, amount_out, protocol_fee, platform_fee, creator_fee, share_fee, trade_direction,
  // pool_status, exact_in
  return {
    kind: "curve",
    pool: key(b, 0),
    virtualBase: u64(b, 40),
    virtualQuote: u64(b, 48),
    sold: u64(b, 72),
    raised: u64(b, 80),
    amountIn: u64(b, 88),
    amountOut: u64(b, 96),
    protocolFee: u64(b, 104),
    platformFee: u64(b, 112),
    creatorFee: u64(b, 120),
    shareFee: u64(b, 128),
    isBuy: b[136] === 0,
    // Fund, Migrate, Trade
    complete: b[137] !== 0,
  };
}

function swapEvent(b: Buffer): CpmmSwap {
  // pool_id, input_vault_before, output_vault_before, input_amount, output_amount, input_transfer_fee,
  // output_transfer_fee, base_input, input_mint, output_mint, trade_fee, creator_fee, creator_fee_on_input
  return {
    kind: "cpmm",
    pool: key(b, 0),
    inputVaultBefore: u64(b, 32),
    outputVaultBefore: u64(b, 40),
    inputAmount: u64(b, 48),
    outputAmount: u64(b, 56),
    inputTransferFee: u64(b, 64),
    outputTransferFee: u64(b, 72),
    inputMint: key(b, 81),
    outputMint: key(b, 113),
    tradeFee: u64(b, 145),
    creatorFee: u64(b, 153),
    creatorFeeOnInput: b[161] === 1,
  };
}

export function decodeEvents(tx: VersionedTransactionResponse, cluster: Cluster): RaydiumEvent[] {
  const out: RaydiumEvent[] = [];
  const keys = accountKeys(tx);
  const launchLab = LAUNCHLAB_PROGRAM_ID[cluster];
  const cpmm = CPMM_PROGRAM_ID[cluster];
  const see = (program: string | undefined, accounts: number[], data: Buffer) => {
    if (program !== launchLab || data.length < 8) return;
    const head = data.subarray(0, 8).toString("hex");
    if (head === EVENT_IX_TAG) {
      if (data.length >= 16 + 139 && data.subarray(8, 16).toString("hex") === TRADE_EVENT) out.push(tradeEvent(data.subarray(16)));
    } else if (INITIALIZE.has(head) && accounts.length >= 8) {
      const at = (i: number) => keys[accounts[i]!]!;
      out.push({ kind: "launch", creator: at(1), platform: at(3), pool: at(5), mint: at(6), quote: at(7) });
    }
  };
  tx.transaction.message.compiledInstructions.forEach((ix, i) => {
    see(keys[ix.programIdIndex], ix.accountKeyIndexes, Buffer.from(ix.data));
    for (const group of tx.meta?.innerInstructions ?? [])
      if (group.index === i) for (const inner of group.instructions) see(keys[inner.programIdIndex], inner.accounts, Buffer.from(bs58.decode(inner.data)));
  });

  let stack: string[] = [];
  for (const line of tx.meta?.logMessages ?? []) {
    const invoke = /^Program (\w+) invoke/.exec(line);
    if (invoke) stack.push(invoke[1]!);
    else if (/^Program \w+ (success|failed)/.test(line)) stack = stack.slice(0, -1);
    else if (stack[stack.length - 1] === cpmm && line.startsWith("Program data: ")) {
      const data = Buffer.from(line.slice("Program data: ".length), "base64");
      if (data.length >= 8 + 162 && data.subarray(0, 8).toString("hex") === SWAP_EVENT) out.push(swapEvent(data.subarray(8)));
    }
  }
  return out;
}

export function accountKeys(tx: VersionedTransactionResponse): string[] {
  const m = tx.transaction.message;
  const statics = m.staticAccountKeys.map((k) => k.toBase58());
  const loaded = tx.meta?.loadedAddresses;
  return [...statics, ...(loaded?.writable ?? []).map(String), ...(loaded?.readonly ?? []).map(String)];
}

/**
 * A swap on either pool, the way the ledger books it. Every amount is raw; fees are in the quote. On a quote with a
 * transfer fee the quote side is the trader's own: what a buyer sent and what a seller was left with (plus the
 * launchpad's fee), so cost and proceeds are what the wallet saw.
 */
export type SwapFacts = {
  pool: string;
  venue: Venue;
  isBuy: boolean;
  quoteAmount: bigint; // gross of the launchpad's fee
  tokenAmount: bigint;
  tax: bigint;
  protocol: bigint; // Raydium's share of the fee
  claimable: bigint; // the platform fee, waiting in the platform's LaunchLab vault
  harvestable: bigint; // an estimate of the quote the fee wallet will harvest from the CPMM pool
  price: number; // quote per coin after the swap, whole units
  curve?: { sold: bigint; raised: bigint; complete: boolean };
  reserves?: { base: bigint; quote: bigint };
};

const wholePrice = (quote: bigint, base: bigint, quoteDecimals: number) => (Number(quote) / Number(base)) * 10 ** (COIN_DECIMALS - quoteDecimals);

/**
 * `fee`: the quote's transfer fee. LaunchLab's event counts what reached the curve's vault on a buy and what left it
 * for the seller on a sale; the platform fee it names reaches the platform's vault less the transfer fee.
 */
export function curveFacts(ev: CurveTrade, quoteDecimals: number, fee: TransferFee = null): SwapFacts {
  const tax = ev.protocolFee + ev.platformFee + ev.creatorFee + ev.shareFee;
  return {
    pool: ev.pool,
    venue: "curve",
    isBuy: ev.isBuy,
    quoteAmount: ev.isBuy ? beforeTransferFee(ev.amountIn, fee) : afterTransferFee(ev.amountOut, fee) + tax,
    tokenAmount: ev.isBuy ? ev.amountOut : ev.amountIn,
    tax,
    protocol: ev.protocolFee,
    claimable: afterTransferFee(ev.platformFee, fee),
    harvestable: 0n,
    price: wholePrice(ev.virtualQuote + ev.raised, ev.virtualBase - ev.sold, quoteDecimals),
    curve: { sold: ev.sold, raised: ev.raised, complete: ev.complete },
  };
}

/** Null when the swap isn't between `coin` and its quote. `rates`: the pool's fee tier. */
export function cpmmFacts(ev: CpmmSwap, coin: string, quote: string, quoteDecimals: number, rates: CpmmRates): SwapFacts | null {
  const isBuy = ev.outputMint === coin && ev.inputMint === quote;
  if (!isBuy && !(ev.inputMint === coin && ev.outputMint === quote)) return null;
  const feeOnInput = ev.creatorFeeOnInput ? ev.creatorFee : 0n;
  const feeOnOutput = ev.creatorFeeOnInput ? 0n : ev.creatorFee;
  // the pool's two sides after the swap: of the trade fee only the LPs' share stays in them
  const input = ev.inputVaultBefore + ev.inputAmount - ev.tradeFee - feeOnInput + lpShare(ev.tradeFee, rates);
  const output = ev.outputVaultBefore - ev.outputAmount - feeOnOutput;
  const quoteAmount = isBuy ? ev.inputAmount : ev.outputAmount + feeOnOutput;
  const tokenAmount = isBuy ? ev.outputAmount + feeOnOutput : ev.inputAmount;
  // fees charged in the coin (a sale's trade fee) are valued in the quote at this fill's price
  const inQuote = (coins: bigint) => (tokenAmount > 0n ? (coins * quoteAmount) / tokenAmount : 0n);
  const tradeFee = isBuy ? ev.tradeFee : inQuote(ev.tradeFee);
  const creatorFee = isBuy === ev.creatorFeeOnInput ? ev.creatorFee : inQuote(ev.creatorFee);
  const reserves = isBuy ? { base: output, quote: input } : { base: input, quote: output };
  return {
    pool: ev.pool,
    venue: "cpmm",
    isBuy,
    // the trader's side of it: a transfer fee on the quote is paid on top of a buy and out of a sale's proceeds
    quoteAmount: isBuy ? quoteAmount + ev.inputTransferFee : quoteAmount - ev.outputTransferFee,
    tokenAmount: isBuy ? ev.outputAmount : ev.inputAmount,
    ...cpmmFees(tradeFee, creatorFee, rates),
    claimable: 0n,
    price: wholePrice(reserves.quote, reserves.base, quoteDecimals),
    reserves,
  };
}
