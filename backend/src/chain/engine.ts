import { CpAmm, SwapMode as DammSwapMode, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import {
  ActivationType,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  SwapMode,
  deriveDbcPoolAddress,
  getCurrentPoint,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
  type Mint,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  GRADUATION_MCAP_USD,
  NATIVE_MINT,
  START_MCAP_USD,
  type Balances,
  type LaunchRequest,
  type LaunchResponse,
  type SwapQuote,
  type SwapRequest,
  type SwapResponse,
  type SwapSide,
  type TxEnvelope,
} from "@cook/shared";
import { storeMetadata } from "../api";
import { config, log, type Role } from "../config";
import { COIN_DECIMALS, SUPPLY_RAW, curveFor } from "../curve";
import { all, big, kvGet, kvSet, one, run, type ClaimRow, type CoinRow, type OtcQuoteRow } from "../db";
import { UserError, memoFor, type Engine } from "../engine";
import { SYSTEM, coinByPool, getCoin, quoteDecimals, recordLaunch, recordTrade, recordTransfer } from "../ledger";
import { activeConfig, quoteRow } from "../prices";
import { LOW_SOL, QUOTE_REJECTED } from "./errors";
import { accountKeys, asBig, asKey, decodeEvents, field, sqrtFromQ64, swapsOf } from "./events";
import { jupQuote, jupSwapTx } from "./jupiter";
import { configParams } from "./params";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
// network and priority fees on top of a config's rent
const CONFIG_FEE_MARGIN_LAMPORTS = 1_000_000;
// a Token-2022 quote whose issuer charges (or can start charging) a transfer fee: PreStocks, Tessera
const hasTransferFee = (mint: Mint) => {
  const fee = getTransferFeeConfig(mint);
  return (
    !!fee &&
    (!fee.transferFeeConfigAuthority.equals(PublicKey.default) ||
      fee.olderTransferFee.transferFeeBasisPoints > 0 ||
      fee.newerTransferFee.transferFeeBasisPoints > 0)
  );
};
const lowFeeWallet = (symbol: string) =>
  new UserError(`Launches on the ${symbol} pair open once the platform's fee wallet is topped up with SOL. Try again shortly.`);
// polls in a row a transaction may fail to index before the indexer moves past it
const MAX_INGEST_TRIES = 5;
// burns and airdrops send many small transactions, so the default priority fee stays low
const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS ?? 5_000);

/**
 * Recur on Solana. Pools are Meteora DBC pools (DAMM v2 after graduation); the five fee buckets are plain wallets
 * the backend holds the keys to. No custom on-chain program: user-facing transactions are built here and signed
 * by the user's wallet, with the OTC or protection wallet co-signing when it moves funds.
 */
export class ChainEngine implements Engine {
  readonly demo = false;
  readonly wallets: Record<Role, string>;
  private conn: Connection;
  private dbc: DynamicBondingCurveClient;
  private damm: CpAmm;
  private tokenPrograms = new Map<string, PublicKey>();
  private quoteMints = new Map<string, { at: number; state: { mint: Mint; currentEpoch: number } }>();
  private configInFlight = new Map<string, Promise<{ address: string; threshold: string; quote_usd: number }>>();

  constructor(private keys: Record<Role, Keypair>) {
    this.wallets = Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey.toBase58()])) as Record<Role, string>;
    this.conn = new Connection(config.rpc, "confirmed");
    this.dbc = new DynamicBondingCurveClient(this.conn, "confirmed");
    this.damm = new CpAmm(this.conn);
  }

  async start() {
    // earlier versions disabled a quote on any failed config (a low fee wallet included); bring those back
    for (const q of all<{ mint: string; symbol: string; error: string }>("SELECT mint, symbol, error FROM quote WHERE available = 0 AND error IS NOT NULL")) {
      if (QUOTE_REJECTED.test(q.error)) continue;
      run("UPDATE quote SET available = 1, error = NULL WHERE mint = ?", q.mint);
      log(`re-enabled ${q.symbol}: its config failed for a reason other than Meteora rejecting the mint`);
    }
    const fees = await this.solBalance(this.wallets.fees);
    if (fees < 0.05) log(`warning: the fee wallet holds ${fees} SOL; fund it so it can pay for configs, claims and transfers`);
  }

  jobs() {
    return [
      { name: "index", ms: config.pollMs, run: () => this.poll() },
      { name: "migrate", ms: 60_000, run: () => this.migrateCompleted() },
      { name: "holders", ms: 10 * 60_000, run: () => this.reconcileHolders() },
    ];
  }

  // ---------------------------------------------------------------- plumbing

  private pk = (s: string) => new PublicKey(s);

  private async tokenProgram(mint: string): Promise<PublicKey> {
    if (mint === NATIVE_MINT) return TOKEN_PROGRAM_ID;
    let p = this.tokenPrograms.get(mint);
    if (!p) {
      const info = await this.conn.getAccountInfo(this.pk(mint));
      if (!info) throw new Error(`mint ${mint} not found`);
      p = info.owner;
      this.tokenPrograms.set(mint, p);
    }
    return p;
  }

  /**
   * A Token-2022 quote's mint and the current epoch, which Meteora's quote math needs to apply its transfer fee
   * (and refuses to quote without). Null for classic SPL quotes. Cached for a few minutes.
   */
  private async quoteMintState(quote: string) {
    const program = await this.tokenProgram(quote);
    if (program.equals(TOKEN_PROGRAM_ID)) return null;
    const hit = this.quoteMints.get(quote);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.state;
    const [mint, { epoch }] = await Promise.all([getMint(this.conn, this.pk(quote), "confirmed", program), this.conn.getEpochInfo("confirmed")]);
    const state = { mint, currentEpoch: epoch };
    this.quoteMints.set(quote, { at: Date.now(), state });
    return state;
  }

  /** What actually lands when `amount` of the quote moves, after any Token-2022 transfer fee. */
  private async afterTransferFee(quote: string, amount: bigint) {
    const q = await this.quoteMintState(quote);
    const fee = q && getTransferFeeConfig(q.mint);
    return fee ? amount - calculateEpochFee(fee, BigInt(q.currentEpoch), amount) : amount;
  }

  private ata(owner: string | PublicKey, mint: string, program: PublicKey) {
    return getAssociatedTokenAddressSync(this.pk(mint), typeof owner === "string" ? this.pk(owner) : owner, true, program, ASSOCIATED_TOKEN_PROGRAM_ID);
  }

  /** Signs with backend keys and sends; waits for confirmation. */
  private async send(tx: Transaction | VersionedTransaction, signers: Keypair[]): Promise<string> {
    const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
    let raw: Buffer | Uint8Array;
    if (tx instanceof VersionedTransaction) {
      tx.sign(signers);
      raw = tx.serialize();
    } else {
      if (!tx.instructions.some((i) => i.programId.equals(ComputeBudgetProgram.programId)))
        tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }));
      tx.feePayer = signers[0]!.publicKey;
      tx.recentBlockhash = blockhash;
      tx.sign(...signers);
      raw = tx.serialize();
    }
    const sig = await this.conn.sendRawTransaction(raw, { maxRetries: 3 });
    const res = await this.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(res.value.err)}`);
    return sig;
  }

  /** A transaction for the user's wallet to sign and send, partially signed by any backend keys it needs. */
  private async forUser(tx: Transaction, user: string, cosigners: Keypair[] = []): Promise<TxEnvelope> {
    const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
    if (!tx.instructions.some((i) => i.programId.equals(ComputeBudgetProgram.programId)))
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }));
    tx.feePayer = this.pk(user);
    tx.recentBlockhash = blockhash;
    if (cosigners.length) tx.partialSign(...cosigners);
    const b64 = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    return { tx: b64, demo: false, lastValidBlockHeight };
  }

  private memo(text: string, signer: PublicKey) {
    return new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
      data: Buffer.from(text, "utf8"),
    });
  }

  /** The fee wallet's quote ATA, used as the referral account so Meteora's referral rebate comes back to Recur. */
  private async referral(quoteMint: string): Promise<PublicKey | null> {
    const program = await this.tokenProgram(quoteMint);
    const ata = this.ata(this.wallets.fees, quoteMint, program);
    if (await this.conn.getAccountInfo(ata)) return ata;
    // create it for next time; this swap goes without
    const ix = createAssociatedTokenAccountIdempotentInstruction(this.keys.fees.publicKey, ata, this.keys.fees.publicKey, this.pk(quoteMint), program);
    this.send(new Transaction().add(ix), [this.keys.fees]).catch((e) => log(`referral ATA ${quoteMint}: ${e.message}`));
    return null;
  }

  // ---------------------------------------------------------------- reads

  async solBalance(owner: string) {
    return (await this.conn.getBalance(this.pk(owner))) / 1e9;
  }

  async balances(owner: string): Promise<Balances> {
    const pk = this.pk(owner);
    const [sol, a, b] = await Promise.all([
      this.conn.getBalance(pk),
      this.conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }),
      this.conn.getParsedTokenAccountsByOwner(pk, { programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") }),
    ]);
    const tokens: Record<string, string> = {};
    for (const acc of [...a.value, ...b.value]) {
      const info = acc.account.data.parsed.info as { mint: string; tokenAmount: { amount: string } };
      tokens[info.mint] = (big(tokens[info.mint]) + big(info.tokenAmount.amount)).toString();
    }
    // wrapped SOL counts as SOL for SOL-quoted coins
    return { sol: (BigInt(sol) + big(tokens[NATIVE_MINT])).toString(), tokens };
  }

  // ---------------------------------------------------------------- configs

  /** The live DBC config for a quote, creating one when none exists or the quote's USD price drifted. */
  async ensureConfig(quoteMint: string) {
    const q = quoteRow(quoteMint);
    if (!q || !q.available) throw new UserError("That quote asset isn't available.");
    const cfg = activeConfig(quoteMint);
    if (cfg && Math.abs(q.usd - cfg.quote_usd) / cfg.quote_usd < config.configDriftBps / 10_000) return cfg;
    let p = this.configInFlight.get(quoteMint);
    if (!p) {
      p = this.createConfig(quoteMint, q.usd).finally(() => this.configInFlight.delete(quoteMint));
      this.configInFlight.set(quoteMint, p);
    }
    return p;
  }

  private async createConfig(quoteMint: string, usd: number) {
    const symbol = quoteRow(quoteMint)?.symbol ?? quoteMint;
    // the fee wallet pays the config's rent: check up front so a launch says why instead of failing mid-way
    const rent = await this.conn.getMinimumBalanceForRentExemption(this.dbc.program.account.poolConfig.size);
    const balance = await this.conn.getBalance(this.keys.fees.publicKey, "confirmed");
    if (balance < rent + CONFIG_FEE_MARGIN_LAMPORTS) {
      log(`fee wallet too low for a ${symbol} config: holds ${balance / 1e9} SOL, needs ${(rent + CONFIG_FEE_MARGIN_LAMPORTS) / 1e9}`);
      throw lowFeeWallet(symbol);
    }
    const program = await this.tokenProgram(quoteMint);
    const mint = await getMint(this.conn, this.pk(quoteMint), "confirmed", program);
    const params = configParams(usd, mint.decimals, hasTransferFee(mint));
    const kp = Keypair.generate();
    const tx = await this.dbc.partner.createConfig2({
      ...params,
      config: kp.publicKey,
      feeClaimer: this.keys.fees.publicKey,
      leftoverReceiver: this.keys.fees.publicKey,
      quoteMint: this.pk(quoteMint),
      payer: this.keys.fees.publicKey,
      transferFeeParameters: null,
    });
    try {
      const sig = await this.send(tx, [this.keys.fees, kp]);
      log(`config ${kp.publicKey.toBase58()} for ${quoteRow(quoteMint)?.symbol} at $${usd} (${sig})`);
    } catch (e) {
      const msg = (e as Error).message;
      // only Meteora turning the mint down (e.g. a Token-2022 quote without a token badge) makes the quote
      // unavailable; low SOL or RPC trouble fails this launch and the next one tries again
      if (QUOTE_REJECTED.test(msg)) {
        run("UPDATE quote SET available = 0, error = ? WHERE mint = ?", msg.slice(0, 300), quoteMint);
        throw new UserError("Meteora doesn't accept this quote asset yet.");
      }
      if (LOW_SOL.test(msg)) throw lowFeeWallet(symbol);
      throw e;
    }
    run("UPDATE config SET active = 0 WHERE quote = ?", quoteMint);
    run(
      "INSERT INTO config (address, quote, quote_usd, threshold, created_at) VALUES (?, ?, ?, ?, ?)",
      kp.publicKey.toBase58(),
      quoteMint,
      usd,
      params.migrationQuoteThreshold.toString(),
      Math.floor(Date.now() / 1000),
    );
    run("UPDATE quote SET decimals = ? WHERE mint = ?", mint.decimals, quoteMint);
    return activeConfig(quoteMint)!;
  }

  // ---------------------------------------------------------------- launch

  async launch(req: LaunchRequest, uriBase: string): Promise<LaunchResponse> {
    const cfg = await this.ensureConfig(req.quote);
    const mint = Keypair.generate();
    const mintAddr = mint.publicKey.toBase58();
    storeMetadata(mintAddr, req);
    const uri = (await pinJson(mintAddr)) ?? `${uriBase}${mintAddr}.json`;
    kvSet(`launch:${mintAddr}`, JSON.stringify({ ...req, uri }));
    const user = this.pk(req.wallet);
    const initial = big(req.initialBuy);
    const tx = await this.dbc.creator.createPoolWithFirstBuy({
      createPoolParam: {
        name: req.name,
        symbol: req.symbol,
        uri,
        payer: user,
        poolCreator: user,
        config: this.pk(cfg.address),
        baseMint: mint.publicKey,
      },
      firstBuyParam:
        initial > 0n
          ? { buyer: user, buyAmount: new BN(initial.toString()), minimumAmountOut: new BN(0), referralTokenAccount: await this.referral(req.quote) }
          : undefined,
    });
    const pool = deriveDbcPoolAddress(this.pk(req.quote), mint.publicKey, this.pk(cfg.address)).toBase58();
    return { ...(await this.forUser(tx, req.wallet, [mint])), mint: mintAddr, pool };
  }

  // ---------------------------------------------------------------- trading

  async swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number): Promise<SwapQuote> {
    if (c.damm_pool) {
      const poolState = await this.damm.fetchPoolState(this.pk(c.damm_pool));
      const slot = await this.conn.getSlot();
      const time = await this.conn.getBlockTime(slot);
      const quoteMint = await this.quoteMintState(c.quote);
      const q = this.damm.getQuote2({
        inputTokenMint: side === "buy" ? this.pk(c.quote) : this.pk(c.mint),
        ...(quoteMint && (side === "buy" ? { inputTokenInfo: quoteMint } : { outputTokenInfo: quoteMint })),
        slippage: slippageBps / 100,
        currentPoint: new BN(time ?? Math.floor(Date.now() / 1000)),
        poolState,
        tokenADecimal: COIN_DECIMALS,
        tokenBDecimal: quoteDecimals(c.quote),
        hasReferral: true,
        swapMode: DammSwapMode.ExactIn,
        amountIn: new BN(amount.toString()),
      });
      const fee = asBig(q.claimingFee) + asBig(q.protocolFee) + asBig(q.compoundingFee) + asBig(q.referralFee);
      const out = asBig(q.outputAmount);
      return {
        side,
        amountIn: amount.toString(),
        amountOut: out.toString(),
        minOut: asBig(q.minimumAmountOut ?? (out * BigInt(10_000 - slippageBps)) / 10_000n).toString(),
        fee: fee.toString(),
        feeBps: 300,
        priceImpact: Number(q.priceImpact.toString()) / 100,
        venue: "damm",
      };
    }
    const [virtualPool, poolConfig] = await Promise.all([this.dbc.state.getPool(c.pool), this.dbc.state.getPoolConfig(c.config)]);
    if (!virtualPool || !poolConfig) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
    const [currentPoint, quoteMint] = await Promise.all([
      getCurrentPoint(this.conn, poolConfig.activationType as ActivationType),
      this.quoteMintState(c.quote),
    ]);
    const q = this.dbc.pool.swapQuote2({
      ...(quoteMint && { quoteMint: quoteMint.mint, currentEpoch: quoteMint.currentEpoch }),
      virtualPool,
      config: poolConfig,
      swapBaseForQuote: side === "sell",
      hasReferral: true,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint,
      slippageBps,
      swapMode: SwapMode.ExactIn,
      amountIn: new BN(amount.toString()),
    });
    const fee = asBig(q.tradingFee) + asBig(q.protocolFee) + asBig(q.referralFee);
    const out = asBig(q.outputAmount);
    const gross = side === "buy" ? amount : out + fee;
    const before = Number(asBig(virtualPool.poolState.sqrtPrice)) ** 2;
    const after = Number(asBig(q.nextSqrtPrice)) ** 2;
    return {
      side,
      amountIn: amount.toString(),
      amountOut: out.toString(),
      minOut: asBig(q.minimumAmountOut ?? (out * BigInt(10_000 - slippageBps)) / 10_000n).toString(),
      fee: fee.toString(),
      feeBps: gross > 0n ? Number((fee * 10_000n) / gross) : 300,
      priceImpact: before > 0 ? Math.abs(after - before) / before : 0,
      venue: "dbc",
    };
  }

  async swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse> {
    const amount = big(req.amount);
    const quote = await this.swapQuote(c, req.side, amount, req.slippageBps);
    const tx = await this.swapTx(c, req.wallet, req.side, amount, big(quote.minOut), true);
    return { ...(await this.forUser(tx, req.wallet)), quote };
  }

  private async swapTx(c: CoinRow, owner: string, side: SwapSide, amount: bigint, minOut: bigint, withReferral: boolean) {
    const referralTokenAccount = withReferral ? await this.referral(c.quote) : null;
    if (c.damm_pool) {
      const poolState = await this.damm.fetchPoolState(this.pk(c.damm_pool));
      return this.damm.swap2({
        payer: this.pk(owner),
        pool: this.pk(c.damm_pool),
        inputTokenMint: side === "buy" ? poolState.tokenBMint : poolState.tokenAMint,
        outputTokenMint: side === "buy" ? poolState.tokenAMint : poolState.tokenBMint,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: await this.tokenProgram(poolState.tokenAMint.toBase58()),
        tokenBProgram: await this.tokenProgram(poolState.tokenBMint.toBase58()),
        referralTokenAccount,
        poolState,
        swapMode: DammSwapMode.ExactIn,
        amountIn: new BN(amount.toString()),
        minimumAmountOut: new BN(minOut.toString()),
      });
    }
    return this.dbc.pool.swap2({
      owner: this.pk(owner),
      pool: this.pk(c.pool),
      swapBaseForQuote: side === "sell",
      referralTokenAccount,
      swapMode: SwapMode.ExactIn,
      amountIn: new BN(amount.toString()),
      minimumAmountOut: new BN(minOut.toString()),
    });
  }

  // ---------------------------------------------------------------- OTC and protection (co-signed)

  async otcTx(q: OtcQuoteRow, c: CoinRow): Promise<TxEnvelope> {
    const user = this.pk(q.wallet);
    const otc = this.keys.otc.publicKey;
    const fees = this.keys.fees.publicKey;
    const program = await this.tokenProgram(c.mint);
    const userAta = this.ata(user, c.mint, program);
    const otcAta = this.ata(otc, c.mint, program);
    const mint = this.pk(c.mint);
    if (q.side !== "sell") throw new UserError("The OTC reserve only buys coins.");
    const coins = BigInt(q.amount_in);
    // one transaction: the coins reach the reserve, the seller and the fee wallet are paid, and the reserve burns
    // exactly those coins, so it settles completely or not at all and the reserve never holds any
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(user, otcAta, otc, mint, program),
      createTransferCheckedInstruction(userAta, mint, otcAta, user, coins, c.decimals, [], program),
      SystemProgram.transfer({ fromPubkey: otc, toPubkey: user, lamports: BigInt(q.amount_out) }),
      SystemProgram.transfer({ fromPubkey: otc, toPubkey: fees, lamports: BigInt(q.tax) }),
      createBurnCheckedInstruction(otcAta, mint, otc, coins, c.decimals, [], program),
      this.memo(memoFor("otc", q.id), otc),
    );
    return this.forUser(tx, q.wallet, [this.keys.otc]);
  }

  async claimTx(claim: ClaimRow): Promise<TxEnvelope> {
    const protection = this.keys.protection.publicKey;
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: protection, toPubkey: this.pk(claim.wallet), lamports: BigInt(claim.amount) }),
      this.memo(memoFor("claim", claim.id), protection),
    );
    return this.forUser(tx, claim.wallet, [this.keys.protection]);
  }

  async verify(signature: string, memo: string, signer: Role) {
    const tx = await this.conn.getTransaction(signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
    if (!tx) return "pending" as const;
    if (tx.meta?.err) return "failed" as const;
    const keys = accountKeys(tx);
    const signers = keys.slice(0, tx.transaction.message.header.numRequiredSignatures);
    const memoLogged = (tx.meta?.logMessages ?? []).some((l) => l.includes("Memo") && l.includes(memo));
    return memoLogged && signers.includes(this.wallets[signer]) ? ("ok" as const) : ("failed" as const);
  }

  // ---------------------------------------------------------------- treasury

  async claimFees(c: CoinRow): Promise<bigint> {
    const fees = this.keys.fees.publicKey;
    if (!c.damm_pool) {
      const metrics = await this.dbc.state.getPoolFeeMetrics(c.pool);
      const amount = asBig(metrics.current.partnerQuoteFee);
      if (amount === 0n) return 0n;
      const tx = await this.dbc.partner.claimPartnerTradingFee({
        feeClaimer: fees,
        payer: fees,
        pool: this.pk(c.pool),
        maxBaseAmount: new BN(0),
        maxQuoteAmount: new BN(amount.toString()),
        receiver: fees,
      });
      await this.send(tx, [this.keys.fees]);
      await this.claimCreationFee(c);
      return this.afterTransferFee(c.quote, amount);
    }
    // graduated: the fee wallet owns the permanently locked LP position(s)
    const pool = this.pk(c.damm_pool);
    const poolState = await this.damm.fetchPoolState(pool);
    let total = 0n;
    for (const p of await this.damm.getUserPositionByPool(pool, fees)) {
      const pending = asBig(getUnClaimLpFee(poolState, p.positionState).feeTokenB);
      if (pending === 0n) continue;
      const tx = await this.damm.claimPositionFee2({
        owner: fees,
        position: p.position,
        pool,
        positionNftAccount: p.positionNftAccount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: await this.tokenProgram(poolState.tokenAMint.toBase58()),
        tokenBProgram: await this.tokenProgram(poolState.tokenBMint.toBase58()),
        receiver: fees,
        feePayer: fees,
      });
      await this.send(tx, [this.keys.fees]);
      total += await this.afterTransferFee(c.quote, pending);
    }
    return total;
  }

  /** The pool creation fee (90% after Meteora's cut) funds the platform buyback. Claimed once per pool. */
  private async claimCreationFee(c: CoinRow) {
    if (kvGet(`creation_fee:${c.mint}`)) return;
    try {
      const before = await this.conn.getBalance(this.keys.fees.publicKey);
      const tx = await this.dbc.partner.claimPartnerPoolCreationFee({
        pool: this.pk(c.pool),
        feeClaimer: this.keys.fees.publicKey,
        feeReceiver: this.keys.fees.publicKey,
      } as Parameters<DynamicBondingCurveClient["partner"]["claimPartnerPoolCreationFee"]>[0]);
      await this.send(tx, [this.keys.fees]);
      const gained = BigInt(Math.max(0, (await this.conn.getBalance(this.keys.fees.publicKey)) - before));
      kvSet(`creation_fee:${c.mint}`, gained);
      kvSet("main_pending_lamports", big(kvGet("main_pending_lamports")) + gained);
    } catch (e) {
      log(`creation fee ${c.symbol}: ${(e as Error).message}`);
    }
  }

  async buybackAndBurn(c: CoinRow, quoteRaw: bigint) {
    const program = await this.tokenProgram(c.mint);
    const ata = this.ata(this.keys.fees.publicKey, c.mint, program);
    const balance = async () => {
      try {
        return BigInt((await this.conn.getTokenAccountBalance(ata, "confirmed")).value.amount);
      } catch {
        return 0n;
      }
    };
    const before = await balance();
    const q = await this.swapQuote(c, "buy", quoteRaw, 300);
    const tx = await this.swapTx(c, this.wallets.fees, "buy", quoteRaw, big(q.minOut), false);
    const sig = await this.send(tx, [this.keys.fees]);
    const burned = (await balance()) - before;
    if (burned > 0n) {
      const burnTx = new Transaction().add(createBurnCheckedInstruction(ata, this.pk(c.mint), this.keys.fees.publicKey, burned, c.decimals, [], program));
      await this.send(burnTx, [this.keys.fees]);
    }
    return { burned, sig };
  }

  async burnHeld(from: Role, c: CoinRow, amount: bigint) {
    const program = await this.tokenProgram(c.mint);
    const owner = this.keys[from].publicKey;
    const ata = this.ata(owner, c.mint, program);
    const held = await this.conn
      .getTokenAccountBalance(ata, "confirmed")
      .then((b) => BigInt(b.value.amount))
      .catch(() => 0n);
    const burned = held < amount ? held : amount;
    if (burned <= 0n) return { burned: 0n, sig: "" };
    const tx = new Transaction().add(createBurnCheckedInstruction(ata, this.pk(c.mint), owner, burned, c.decimals, [], program));
    return { burned, sig: await this.send(tx, [this.keys[from]]) };
  }

  async convert(fromMint: string, toMint: string, raw: bigint) {
    if (fromMint === toMint || raw === 0n) return { out: raw, sig: "" };
    const quote = await jupQuote(fromMint, toMint, raw, 100);
    const tx = await jupSwapTx(quote, this.keys.fees.publicKey);
    const sig = await this.send(tx, [this.keys.fees]);
    // the guaranteed minimum; anything above it stays in the fee wallet for the next batch
    return { out: BigInt(quote.otherAmountThreshold), sig };
  }

  async sendSol(from: Role, to: string, lamports: bigint) {
    if (lamports <= 0n) return "";
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: this.keys[from].publicKey, toPubkey: this.pk(to), lamports }));
    return this.send(tx, [this.keys[from]]);
  }

  async sendTokens(from: Role, mint: string, items: { to: string; amount: bigint }[]) {
    const key = this.keys[from];
    const out: { to: string; sig: string }[] = [];
    const native = mint === NATIVE_MINT;
    const program = native ? TOKEN_PROGRAM_ID : await this.tokenProgram(mint);
    const decimals = native ? 9 : quoteDecimals(mint);
    const source = native ? null : this.ata(key.publicKey, mint, program);
    const perTx = native ? 18 : 6;
    for (let i = 0; i < items.length; i += perTx) {
      const batch = items.slice(i, i + perTx).filter((x) => x.amount > 0n);
      if (!batch.length) continue;
      const tx = new Transaction();
      for (const it of batch) {
        if (native) {
          tx.add(SystemProgram.transfer({ fromPubkey: key.publicKey, toPubkey: this.pk(it.to), lamports: it.amount }));
        } else {
          const dest = this.ata(it.to, mint, program);
          tx.add(
            createAssociatedTokenAccountIdempotentInstruction(key.publicKey, dest, this.pk(it.to), this.pk(mint), program),
            createTransferCheckedInstruction(source!, this.pk(mint), dest, key.publicKey, it.amount, decimals, [], program),
          );
        }
      }
      try {
        const sig = await this.send(tx, [key]);
        for (const it of batch) out.push({ to: it.to, sig });
      } catch (e) {
        log(`transfer batch from ${from}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- indexing

  /** Walks new signatures of every Recur config (launches and curve swaps) and graduated pool (DAMM swaps). */
  private async poll() {
    const addresses = [
      ...all<{ address: string }>("SELECT address FROM config").map((r) => r.address),
      ...all<{ damm_pool: string }>("SELECT damm_pool FROM coin WHERE damm_pool IS NOT NULL").map((r) => r.damm_pool),
    ];
    for (const address of addresses) {
      const cursor = kvGet(`cursor:${address}`);
      const sigs = await this.conn.getSignaturesForAddress(this.pk(address), { until: cursor, limit: 500 }, "confirmed");
      // oldest first, moving the cursor past each one handled, so a transaction that can't be read is retried a few
      // times and then skipped instead of holding back everything after it
      for (const s of [...sigs].reverse()) {
        if (!s.err) {
          try {
            await this.ingest(s.signature);
          } catch (e) {
            const tries = Number(kvGet(`fail:${s.signature}`) ?? 0) + 1;
            kvSet(`fail:${s.signature}`, tries);
            log(`index ${s.signature}: ${(e as Error).message}${tries >= MAX_INGEST_TRIES ? " (skipped)" : ""}`);
            if (tries < MAX_INGEST_TRIES) break;
          }
        }
        kvSet(`cursor:${address}`, s.signature);
      }
    }
  }

  async ingest(signature: string) {
    if (one("SELECT 1 FROM kv WHERE k = ?", `seen:${signature}`)) return;
    const tx = await this.conn.getTransaction(signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
    if (!tx || tx.meta?.err) return;
    await this.handle(tx, signature);
    kvSet(`seen:${signature}`, 1);
  }

  private async handle(tx: VersionedTransactionResponse, signature: string) {
    const ts = tx.blockTime ?? Math.floor(Date.now() / 1000);
    const keys = accountKeys(tx);
    const feePayer = keys[0]!;
    const events = decodeEvents(tx);
    for (const ev of events) {
      if (ev.program === "dbc" && ev.name === "EvtInitializePool") {
        await this.onLaunch(asKey(field(ev.data, "pool")), asKey(field(ev.data, "config")), asKey(field(ev.data, "creator")), asKey(field(ev.data, "base_mint")), ts);
        continue;
      }
      if (ev.program === "dbc" && ev.name === "EvtCurveComplete") {
        const c = coinByPool(asKey(field(ev.data, "pool")));
        if (c) run("UPDATE coin SET graduated = 1, graduated_at = COALESCE(graduated_at, ?) WHERE mint = ?", ts, c.mint);
      }
    }
    let swapIndex = 0;
    for (const { ev, facts: f } of swapsOf(events)) {
      const c = coinByPool(f.pool);
      if (!c) continue;
      const qDec = quoteDecimals(c.quote);
      // the referral rebate is ours only when the referral account was the fee wallet's
      const ours = keys.includes(this.ata(this.wallets.fees, c.quote, await this.tokenProgram(c.quote)).toBase58());
      recordTrade({
        id: `${signature}:${swapIndex++}`,
        coin: c.mint,
        trader: feePayer,
        isBuy: f.isBuy,
        quoteAmount: f.quoteAmount,
        tokenAmount: f.tokenAmount,
        tax: f.tax,
        meteora: ours ? f.meteora : f.meteora + f.referral,
        claimable: f.claimable,
        referral: ours ? f.referral : 0n,
        sqrtPrice: sqrtFromQ64(f.sqrtQ64, COIN_DECIMALS, qDec),
        quoteReserve: ev.program === "dbc" ? f.quoteReserve : undefined,
        ts,
        tx: signature,
        kind: feePayer === this.wallets.fees ? "buyback" : "trade",
      });
    }
  }

  private async onLaunch(pool: string, cfgAddress: string, creator: string, mint: string, ts: number) {
    if (getCoin(mint)) return;
    const cfg = one<{ quote: string; quote_usd: number; threshold: string }>("SELECT quote, quote_usd, threshold FROM config WHERE address = ?", cfgAddress);
    if (!cfg) return; // not one of ours
    const saved = kvGet(`launch:${mint}`);
    const meta: Partial<LaunchRequest> & { uri?: string } = saved ? JSON.parse(saved) : await this.readMetadata(mint);
    const curve = curveFor(START_MCAP_USD / cfg.quote_usd, GRADUATION_MCAP_USD / cfg.quote_usd);
    recordLaunch({
      mint,
      pool,
      config: cfgAddress,
      quote: cfg.quote,
      name: meta.name ?? "Unknown",
      symbol: meta.symbol ?? "???",
      image: meta.image ?? "",
      description: meta.description ?? "",
      website: meta.website ?? "",
      twitter: meta.twitter ?? "",
      telegram: meta.telegram ?? "",
      uri: meta.uri ?? "",
      creator,
      createdAt: ts,
      isMain: config.mainToken === mint,
      sqrtStart: curve.sqrtStart,
      sqrtMig: curve.sqrtMig,
      liquidity: curve.liquidity,
      threshold: big(cfg.threshold),
      totalSupply: SUPPLY_RAW,
    });
    log(`launch ${meta.symbol} ${mint}`);
  }

  /** Name, symbol and image from the Metaplex metadata account and its JSON, for pools created outside the UI. */
  private async readMetadata(mint: string): Promise<Partial<LaunchRequest> & { uri?: string }> {
    const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX.toBuffer(), this.pk(mint).toBuffer()], METAPLEX);
    const info = await this.conn.getAccountInfo(pda);
    if (!info) return {};
    const d = info.data;
    let o = 1 + 32 + 32;
    const str = () => {
      const len = d.readUInt32LE(o);
      o += 4;
      const s = d.subarray(o, o + len).toString("utf8").replace(/\0/g, "").trim();
      o += len;
      return s;
    };
    const name = str();
    const symbol = str();
    const uri = str();
    let json: { image?: string; description?: string; extensions?: Record<string, string> } = {};
    try {
      json = (await (await fetch(uri, { signal: AbortSignal.timeout(5000) })).json()) as typeof json;
    } catch {
      // metadata host down; keep what's on-chain
    }
    return {
      name,
      symbol,
      uri,
      image: json.image ?? "",
      description: json.description ?? "",
      website: json.extensions?.website ?? "",
      twitter: json.extensions?.twitter ?? "",
      telegram: json.extensions?.telegram ?? "",
    };
  }

  /** Finds the DAMM v2 pool of graduated coins, and migrates completed curves Meteora's keepers haven't picked up. */
  private async migrateCompleted() {
    for (const c of all<CoinRow>("SELECT * FROM coin WHERE graduated = 1 AND damm_pool IS NULL")) {
      const pool = await this.dbc.state.getPool(c.pool);
      if (!pool) continue;
      if (Number(pool.poolState.isMigrated) === 1) {
        const found = (await this.damm.fetchPoolStatesByTokenAMint(this.pk(c.mint))).find((p) => p.account.tokenBMint.toBase58() === c.quote);
        if (found) {
          run("UPDATE coin SET damm_pool = ? WHERE mint = ?", found.publicKey.toBase58(), c.mint);
          log(`${c.symbol} graduated to DAMM v2 ${found.publicKey.toBase58()}`);
        }
        continue;
      }
      if (Date.now() / 1000 - (c.graduated_at ?? 0) < 120) continue;
      try {
        const res = await this.dbc.migration.migrateToDammV2({
          payer: this.keys.fees.publicKey,
          virtualPool: this.pk(c.pool),
          dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]!,
        } as unknown as Parameters<DynamicBondingCurveClient["migration"]["migrateToDammV2"]>[0]);
        await this.send(res.transaction, [this.keys.fees, res.firstPositionNftKeypair, res.secondPositionNftKeypair]);
        log(`migrated ${c.symbol} to DAMM v2`);
      } catch (e) {
        log(`migrate ${c.symbol}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Wallet-to-wallet transfers don't go through a pool, so holder balances are reconciled against the chain:
   * coins that arrived without a trade carry zero cost basis (no fake high entries for airdrops).
   */
  private async reconcileHolders() {
    const since = Math.floor(Date.now() / 1000) - 86_400;
    for (const c of all<CoinRow>("SELECT * FROM coin WHERE last_trade_at >= ?", since)) {
      const accounts = await this.conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: c.mint } }],
      });
      const chain = new Map<string, bigint>();
      for (const a of accounts) {
        const info = (a.account.data as { parsed: { info: { owner: string; tokenAmount: { amount: string } } } }).parsed.info;
        chain.set(info.owner, (chain.get(info.owner) ?? 0n) + big(info.tokenAmount.amount));
      }
      const db = new Map(all<{ wallet: string; balance: string }>("SELECT wallet, balance FROM holder WHERE coin = ?", c.mint).map((h) => [h.wallet, big(h.balance)]));
      for (const wallet of new Set([...chain.keys(), ...db.keys()])) {
        if (SYSTEM.has(wallet)) continue;
        const delta = (chain.get(wallet) ?? 0n) - (db.get(wallet) ?? 0n);
        // pool vaults and other program-owned accounts sit off the ed25519 curve
        if (delta !== 0n && PublicKey.isOnCurve(this.pk(wallet).toBytes())) recordTransfer(c.mint, wallet, delta);
      }
    }
  }
}

/** Pins token metadata JSON to IPFS when PINATA_JWT is set; otherwise the backend serves it. */
async function pinJson(mint: string): Promise<string | null> {
  if (!config.pinataJwt) return null;
  const meta = kvGet(`meta:${mint}`);
  if (!meta) return null;
  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.pinataJwt}` },
      body: JSON.stringify({ pinataContent: JSON.parse(meta), pinataMetadata: { name: `${mint}.json` } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const { IpfsHash } = (await res.json()) as { IpfsHash: string };
    return `https://ipfs.io/ipfs/${IpfsHash}`;
  } catch {
    return null;
  }
}

