import type { Balances, LaunchRequest, LaunchResponse, SolToQuote, SwapQuote, SwapRequest, SwapResponse, SwapSide, TxEnvelope } from "@gantry/shared";
import type { Role } from "./config";
import type { CoinRow, OtcQuoteRow } from "./db";

/**
 * Everything that touches money goes through an Engine. `chain/engine.ts` does it on Solana with Raydium's pools
 * (a LaunchLab curve, then CPMM) and the backend-controlled wallets; `demo/engine.ts` simulates the same moves in the
 * database. The API, the fee router, Fleet entries, OTC and protection only ever talk to this interface.
 */
/** Periodic background work. Only the server holding the lease runs it (see lease.ts). */
export type Job = { name: string; ms: number; run: () => Promise<unknown> | unknown };

export interface Engine {
  readonly demo: boolean;
  /** Public keys of the backend-controlled wallets. */
  readonly wallets: Record<Role, string>;

  start(): Promise<void>;
  /** The engine's own background work (chain indexing, finding graduated pools, holder reconciliation). */
  jobs(): Job[];

  // ---- reads
  solBalance(owner: string): Promise<number>;
  balances(owner: string): Promise<Balances>;

  // ---- user transactions (built here, signed by the user's wallet)
  swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number, wallet?: string): Promise<SwapQuote>;
  swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse>;
  /**
   * Creates the coin and its curve, with the creator's first buy, in one transaction.
   * `entry`: a copy's Fleet entry in raw quote, bought with the first buy for the fee wallet, and the leader it goes to.
   */
  launch(req: LaunchRequest, metadataUri: string, entry?: { raw: bigint; to: string }): Promise<LaunchResponse>;
  /**
   * Brings what is known about a quote up to date before a coin is launched on it: its price, and whether its fees
   * could be turned into SOL. With hundreds of quotes these are otherwise looked at in turn, minutes apart.
   */
  checkQuote(mint: string): Promise<void>;
  /** Jupiter swap from SOL into a quote, for a first buy paid in SOL. Demo mode settles it immediately. */
  solToQuote(wallet: string, quote: string, lamports: bigint): Promise<SolToQuote>;
  /** OTC trade as one transaction co-signed by the OTC wallet. Demo mode settles it immediately. */
  otcTx(q: OtcQuoteRow, c: CoinRow): Promise<TxEnvelope>;
  /** True once `signature` landed successfully and carries `memo` signed by the given backend wallet. */
  verify(signature: string, memo: string, signer: Role): Promise<"ok" | "pending" | "failed">;
  /** Index one transaction right away (the UI calls this after sending). */
  ingest(signature: string): Promise<void>;

  // ---- treasury moves (fee wallet and friends)
  /**
   * Brings the platform fees a coin's curve trades left in the platform's vault into the fee wallet. Returns the raw
   * quote the coin had waiting there.
   */
  claimFees(c: CoinRow): Promise<bigint>;
  /**
   * After graduation: collects what the coin's CPMM pool owes the fee wallet (the locked LP's fees and the creator
   * fee) and burns the part that arrives in the coin itself. Returns the raw quote received and the coins burned.
   */
  harvestFees(c: CoinRow): Promise<{ quote: bigint; burned: bigint; sig: string }>;
  /** Burns up to `amount` of a coin a backend wallet holds; returns what it actually burned. */
  burnHeld(from: Role, c: CoinRow, amount: bigint): Promise<{ burned: bigint; sig: string }>;
  /** Swaps inside the fee wallet (Jupiter on mainnet). Wrapped-SOL mint means native SOL. */
  convert(fromMint: string, toMint: string, raw: bigint): Promise<{ out: bigint; sig: string }>;
  sendSol(from: Role, to: string, lamports: bigint): Promise<string>;
  /** Batched SPL (or SOL, for the wrapped-SOL mint) transfers out of a backend wallet. */
  sendTokens(from: Role, mint: string, items: { to: string; amount: bigint }[]): Promise<{ to: string; sig: string }[]>;
}

export class UserError extends Error {}

export const memoFor = (kind: "otc", id: string) => `gantry:${kind}:${id}`;
