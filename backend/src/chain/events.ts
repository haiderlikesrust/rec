import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import { CpAmmIdl } from "@meteora-ag/cp-amm-sdk";
import { DynamicBondingCurveIdl } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import bs58 from "bs58";
import BN from "bn.js";
import { DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID } from "@cook/shared";

/**
 * Meteora's programs emit Anchor events through a self-CPI (`emit_cpi!`): an inner instruction to the program
 * itself whose data is the event-ix tag, then the event discriminator and Borsh fields. Some versions also log them
 * as `Program data:` lines; both are read here.
 */
const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");
const coders = {
  dbc: new BorshCoder(DynamicBondingCurveIdl as unknown as Idl),
  damm: new BorshCoder(CpAmmIdl as unknown as Idl),
};
const programs: Record<string, keyof typeof coders> = { [DBC_PROGRAM_ID]: "dbc", [DAMM_V2_PROGRAM_ID]: "damm" };

export type DecodedEvent = { program: "dbc" | "damm"; name: string; data: Record<string, unknown> };

export function decodeEvents(tx: VersionedTransactionResponse): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  const keys = accountKeys(tx);
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      const program = programs[keys[ix.programIdIndex] ?? ""];
      if (!program) continue;
      const data = Buffer.from(bs58.decode(ix.data));
      if (data.length < 16 || !data.subarray(0, 8).equals(EVENT_IX_TAG)) continue;
      const ev = coders[program].events.decode(data.subarray(8).toString("base64"));
      if (ev) out.push({ program, name: ev.name, data: ev.data as Record<string, unknown> });
    }
  }
  if (out.length === 0) {
    let stack: string[] = [];
    for (const line of tx.meta?.logMessages ?? []) {
      const invoke = /^Program (\w+) invoke/.exec(line);
      if (invoke) stack.push(invoke[1]!);
      else if (/^Program \w+ (success|failed)/.test(line)) stack = stack.slice(0, -1);
      const program = programs[stack[stack.length - 1] ?? ""];
      if (program && line.startsWith("Program data: ")) {
        const ev = coders[program].events.decode(line.slice("Program data: ".length));
        if (ev) out.push({ program, name: ev.name, data: ev.data as Record<string, unknown> });
      }
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

/** Field access that works whether the coder kept the IDL's snake_case names or camelCased them. */
export function field<T = unknown>(obj: unknown, name: string): T {
  const o = obj as Record<string, unknown>;
  if (name in o) return o[name] as T;
  const camel = name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return o[camel] as T;
}

export const asBig = (v: unknown): bigint => {
  if (v === undefined || v === null) return 0n;
  if (BN.isBN(v)) return BigInt((v as BN).toString());
  if (typeof v === "bigint") return v;
  return BigInt(String(v));
};
export const asKey = (v: unknown) => (v instanceof PublicKey ? v.toBase58() : String(v));

/** A Q64.64 sqrt price (raw base/quote units) as a sqrt price in whole units. */
export const sqrtFromQ64 = (q64: bigint, baseDecimals: number, quoteDecimals: number) =>
  (Number(q64) / 2 ** 64) * Math.sqrt(10 ** (baseDecimals - quoteDecimals));

export type SwapFacts = {
  pool: string;
  isBuy: boolean;
  quoteAmount: bigint; // gross
  tokenAmount: bigint;
  tax: bigint;
  meteora: bigint; // protocol fee kept by Meteora
  referral: bigint;
  claimable: bigint; // fee accrued for the partner / LP position
  sqrtQ64: bigint;
  quoteReserve?: bigint;
};

/**
 * Each DBC swap emits EvtSwap, EvtSwap2 and EvtSwap3 (older program versions only the first one or two), so a
 * transaction's swaps are read from its newest event kind only.
 */
export function swapsOf(events: DecodedEvent[]): { ev: DecodedEvent; facts: SwapFacts }[] {
  const dbc = events.filter((e) => e.program === "dbc");
  const newest = ["EvtSwap3", "EvtSwap2", "EvtSwap"].find((n) => dbc.some((e) => e.name === n));
  const out: { ev: DecodedEvent; facts: SwapFacts }[] = [];
  for (const ev of events) {
    if (ev.program === "dbc" && ev.name !== newest) continue;
    const facts = swapFacts(ev);
    if (facts) out.push({ ev, facts });
  }
  return out;
}

/** Normalizes the DBC (EvtSwap, EvtSwap2, EvtSwap3) and DAMM v2 (EvtSwap2) swap events. */
export function swapFacts(ev: DecodedEvent): SwapFacts | null {
  const d = ev.data;
  const pool = asKey(field(d, "pool"));
  if (ev.program === "dbc") {
    const isBuy = Number(field(d, "trade_direction")) === 1; // QuoteToBase
    if (ev.name === "EvtSwap3") {
      const tradingFee = asBig(field(d, "trading_fee"));
      const protocolFee = asBig(field(d, "protocol_fee"));
      const referralFee = asBig(field(d, "referral_fee"));
      const fee = tradingFee + protocolFee + referralFee;
      const amountIn = asBig(field(d, "excluded_transfer_fee_amount_in"));
      const amountOut = asBig(field(d, "included_transfer_fee_amount_out"));
      if (field<boolean>(d, "fee_on_base_token")) {
        // OutputToken fee mode (not used by Recur configs): fees are in the coin; express them in quote at this fill's price
        const quote = isBuy ? amountIn : amountOut;
        const tokens = isBuy ? amountOut + fee : amountIn;
        const toQuote = (x: bigint) => (tokens > 0n ? (x * quote) / tokens : 0n);
        return {
          pool,
          isBuy,
          quoteAmount: quote,
          tokenAmount: isBuy ? amountOut : amountIn,
          tax: toQuote(fee),
          meteora: toQuote(protocolFee),
          referral: toQuote(referralFee),
          claimable: toQuote(tradingFee),
          sqrtQ64: asBig(field(d, "next_sqrt_price")),
          quoteReserve: asBig(field(d, "quote_reserve")),
        };
      }
      return {
        pool,
        isBuy,
        quoteAmount: isBuy ? amountIn : amountOut + fee,
        tokenAmount: isBuy ? amountOut : amountIn,
        tax: fee,
        meteora: protocolFee,
        referral: referralFee,
        claimable: tradingFee,
        sqrtQ64: asBig(field(d, "next_sqrt_price")),
        quoteReserve: asBig(field(d, "quote_reserve")),
      };
    }
    if (ev.name === "EvtSwap" || ev.name === "EvtSwap2") {
      const r = field<Record<string, unknown>>(d, "swap_result");
      const tradingFee = asBig(field(r, "trading_fee"));
      const protocolFee = asBig(field(r, "protocol_fee"));
      const referralFee = asBig(field(r, "referral_fee"));
      const fee = tradingFee + protocolFee + referralFee;
      const input = ev.name === "EvtSwap2" ? asBig(field(r, "included_fee_input_amount")) : asBig(field(r, "actual_input_amount"));
      const output = asBig(field(r, "output_amount"));
      return {
        pool,
        isBuy,
        quoteAmount: isBuy ? input : output + fee,
        tokenAmount: isBuy ? output : input,
        tax: fee,
        meteora: protocolFee,
        referral: referralFee,
        claimable: tradingFee,
        sqrtQ64: asBig(field(r, "next_sqrt_price")),
        quoteReserve: ev.name === "EvtSwap2" ? asBig(field(d, "quote_reserve_amount")) : undefined,
      };
    }
    return null;
  }
  if (ev.name !== "EvtSwap2") return null;
  // DAMM v2: token A is the coin, token B the quote; fees are collected in the quote (OnlyB)
  const isBuy = Number(field(d, "trade_direction")) === 1; // BtoA
  const r = field<Record<string, unknown>>(d, "swap_result");
  const claiming = asBig(field(r, "claiming_fee"));
  const compounding = asBig(field(r, "compounding_fee"));
  const protocolFee = asBig(field(r, "protocol_fee"));
  const referralFee = asBig(field(r, "referral_fee"));
  const fee = claiming + compounding + protocolFee + referralFee;
  const input = asBig(field(r, "included_fee_input_amount"));
  const output = asBig(field(r, "output_amount"));
  return {
    pool,
    isBuy,
    quoteAmount: isBuy ? input : output + fee,
    tokenAmount: isBuy ? output : input,
    tax: fee,
    meteora: protocolFee,
    referral: referralFee,
    claimable: claiming + compounding,
    sqrtQ64: asBig(field(r, "next_sqrt_price")),
  };
}
