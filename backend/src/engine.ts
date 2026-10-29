import type {
  Balances,
  LaunchRequest,
  LaunchResponse,
  SwapQuote,
  SwapRequest,
  SwapResponse,
  SwapSide,
  TxEnvelope,
} from "@cook/shared";
import type { Role } from "./config";
import type { ClaimRow, CoinRow, OtcQuoteRow } from "./db";

/**
 * Everything that touches money goes through an Engine. `chain/engine.ts` does it on Solana with Meteora pools and
 * the backend-controlled wallets; `demo/engine.ts` simulates the same moves in the database. The API, the fee
 * router, airdrops, OTC and protection only ever talk to this interface.
 */
export interface Engine {
  readonly demo: boolean;
  /** Public keys of the backend-controlled wallets. */
  readonly wallets: Record<Role, string>;

  start(): Promise<void>;

  // ---- reads
  solBalance(owner: string): Promise<number>;
  balances(owner: string): Promise<Balances>;

  // ---- user transactions (built here, signed by the user's wallet)
  swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number, wallet?: string): Promise<SwapQuote>;
  swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse>;
  launch(req: LaunchRequest, metadataUri: string): Promise<LaunchResponse>;
  /** OTC trade as one transaction co-signed by the OTC wallet. Demo mode settles it immediately. */
  otcTx(q: OtcQuoteRow, c: CoinRow): Promise<TxEnvelope>;
  /** Protection payout as one transaction co-signed by the protection wallet. Demo mode pays immediately. */
  claimTx(claim: ClaimRow): Promise<TxEnvelope>;
  /** True once `signature` landed successfully and carries `memo` signed by the given backend wallet. */
  verify(signature: string, memo: string, signer: Role): Promise<"ok" | "pending" | "failed">;
  /** Index one transaction right away (the UI calls this after sending). */
  ingest(signature: string): Promise<void>;

  // ---- treasury moves (fee wallet and friends)
  /** Claims the fee wallet's accrued trading fees on a coin's pool. Returns the raw quote received. */
  claimFees(c: CoinRow): Promise<bigint>;
  /** Fee wallet buys the coin in its own pool with `quoteRaw` and burns everything it receives. */
  buybackAndBurn(c: CoinRow, quoteRaw: bigint): Promise<{ burned: bigint; sig: string }>;
  /** Swaps inside the fee wallet (Jupiter on mainnet). Wrapped-SOL mint means native SOL. */
  convert(fromMint: string, toMint: string, raw: bigint): Promise<{ out: bigint; sig: string }>;
  sendSol(from: Role, to: string, lamports: bigint): Promise<string>;
  /** Batched SPL (or SOL, for the wrapped-SOL mint) transfers out of a backend wallet. */
  sendTokens(from: Role, mint: string, items: { to: string; amount: bigint }[]): Promise<{ to: string; sig: string }[]>;
}

export class UserError extends Error {}

export const memoFor = (kind: "otc" | "claim", id: string) => `recur:${kind}:${id}`;
