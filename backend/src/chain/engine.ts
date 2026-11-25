import {
  CpmmConfigInfoLayout,
  CpmmCreatorFeeOn,
  CpmmCreatorFeeShareLayout,
  CpmmPoolInfoLayout,
  Curve,
  CurveCalculator,
  DEVNET_PROGRAM_ID,
  FeeOn,
  LOCK_CPMM_AUTH,
  LaunchpadConfig,
  LaunchpadPool,
  PlatformConfig,
  buyExactInInstruction,
  claimPlatformFeeFromVault,
  collectCpFeeInstruction,
  createPlatformConfig,
  getCpLockPda,
  getCpmmPdaPoolId,
  getCreatorFeeSharePda,
  getPdaCpiEvent,
  getPdaCreatorVault,
  getPdaLaunchpadAuth,
  getPdaLaunchpadConfigId,
  getPdaLaunchpadPoolId,
  getPdaLaunchpadVaultId,
  getPdaMetadataKey,
  getPdaObservationId,
  getPdaPlatformFeeVaultAuth,
  getPdaPlatformId,
  getPdaPlatformVault,
  getPdaPoolAuthority,
  initializeV2,
  makeCollectCreatorFeeInstruction,
  makeSwapCpmmBaseInInstruction,
  sellExactInInstruction,
  updatePlatformConfig,
  type LaunchpadConfigInfo,
  type LaunchpadPlatformInfo,
} from "@raydium-io/raydium-sdk-v2";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createInitializeAccount3Instruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type TokenBalance,
  type VersionedTransactionResponse,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  CPMM_PROGRAM_ID,
  CPMM_TIER,
  CURVE_SOLD_SHARE,
  ENTRY_RENT_LAMPORTS,
  LAUNCHLAB_PROGRAM_ID,
  LP_LOCK_PROGRAM_ID,
  NATIVE_MINT,
  brand,
  type Balances,
  type LaunchRequest,
  type LaunchResponse,
  type SolToQuote,
  type SwapQuote,
  type SwapRequest,
  type SwapResponse,
  type SwapSide,
  type TxEnvelope,
} from "@gantry/shared";
import { coinPage, storeMetadata } from "../api";
import { recordEntry } from "../fleet";
import { config, log, type Role } from "../config";
import { COIN_DECIMALS, SUPPLY_RAW, afterTransferFee, beforeTransferFee, cpmmFees, type CpmmRates, type LaunchCurve } from "../curve";
import { all, big, kvGet, kvSet, one, run, type CoinRow, type OtcQuoteRow, type QuoteRow } from "../db";
import { UserError, memoFor, type Engine } from "../engine";
import { SYSTEM, coinByPool, getCoin, quoteDecimals, recordLaunch, recordTrade, recordTransfer } from "../ledger";
import { quoteFee, quoteRow, refreshPrice, transferFeeOf } from "../prices";
import { LOW_SOL, TOO_LITTLE_TO_COLLECT } from "./errors";
import { accountKeys, cpmmFacts, curveFacts, decodeEvents, type SwapFacts } from "./events";
import { jupQuote, jupSwapTx } from "./jupiter";
import { inspectMint } from "./mint";
import { launchLimits, launchParams, platformFeeRate, platformParams, shapeTrouble } from "./params";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const WSOL = new PublicKey(NATIVE_MINT);
const ZERO = new BN(0);
const U64_MAX = new BN("18446744073709551615");
const TOKEN_ACCOUNT_SIZE = 165;
// a legacy or v0 transaction has to fit in one packet
const MAX_TX_BYTES = 1232;
// creating the coin and its curve and buying on it in the same transaction, with room to spare
const LAUNCH_COMPUTE_UNITS = 400_000;
// LaunchLab's pool status: funding, sold out and waiting for Raydium to migrate it, migrated to CPMM
const MIGRATED = 2;
// network and priority fees on top of the rent of the platform's accounts
const SETUP_FEE_MARGIN_LAMPORTS = 2_000_000;
// polls in a row a transaction may fail to index before the indexer moves past it
const MAX_INGEST_TRIES = 5;
// how long configs read from the chain are trusted before they're read again
const CONFIG_TTL_MS = 10 * 60_000;
// accounts one getMultipleAccounts call may ask for
const ACCOUNTS_PER_CALL = 100;
// addresses one transaction can add to a lookup table
const TABLE_ADDS_PER_TX = 24;
// how many slots back a lookup table's slot is taken from: old enough for any RPC node to have seen, far short of the 512 kept
const SETTLED_SLOTS = 64;
// quotes whose route to SOL is asked for per pass (three passes a minute), a moment apart
const ROUTES_PER_PASS = 3;
// at a launch, the quote's price may be this old and its route to SOL have been asked for this long ago (seconds)
const LAUNCH_PRICE_AGE = 60;
const LAUNCH_ROUTE_AGE = 30 * 60;
// fee splits and entry airdrops send many small transactions, so the default priority fee stays low
const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS ?? 5_000);

const bn = (v: bigint) => new BN(v.toString());
const int = (v: BN) => BigInt(v.toString());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lowFeeWallet = () => new UserError("Launches open once the platform's fee wallet is topped up with SOL. Try again shortly.");
const migrating = () => new UserError("This coin's curve just sold out and Raydium is moving it to its pool. Trading resumes in a few seconds.");

type LaunchConfig = { id: PublicKey; info: LaunchpadConfigInfo };
/** The parts of a CPMM pool that never change. A and B are its two mints in the order CPMM keeps them: either can be the coin. */
type CpmmPool = {
  id: PublicKey;
  config: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  programA: PublicKey;
  programB: PublicKey;
  mintLp: PublicKey;
  creator: PublicKey;
  feeOn: number;
  creatorFee: boolean;
};
type TierRates = { trade: BN; creator: BN; protocol: BN; fund: BN; rates: CpmmRates };

/**
 * The launchpad on Solana. A coin starts on a Raydium LaunchLab bonding curve, created under one platform config the
 * fee wallet owns, and moves to a Raydium CPMM pool when the curve sells out (Raydium's own crank does the move). The
 * fee buckets are plain wallets the backend holds the keys to. No custom on-chain program: user-facing transactions
 * are built here and signed by the user's wallet, with the OTC or protection wallet co-signing when it moves funds.
 *
 * Assumed throughout: coins are plain SPL tokens (LaunchLab's initialize_v2). A quote is a classic SPL token or a
 * Token-2022 one, which may charge a transfer fee: what a trader sends, what arrives, and what the fee wallet ends
 * up with are told apart wherever the quote moves (see TransferFee in curve.ts). A quote whose mint is in a state
 * pools can't trade takes no launches (see mint.ts).
 */
export class ChainEngine implements Engine {
  readonly demo = false;
  readonly wallets: Record<Role, string>;
  private conn: Connection;
  private launchLab: PublicKey;
  private launchAuth: PublicKey;
  private cpmm: PublicKey;
  private cpmmAuth: PublicKey;
  private lock: PublicKey;
  private lockAuth: PublicKey;
  /** The LaunchLab platform config every coin launches under: a PDA of the fee wallet. */
  readonly platform: PublicKey;
  private tokenPrograms = new Map<string, PublicKey>();
  private cache = new Map<string, { at: number; value: unknown }>();
  private pools = new Map<string, CpmmPool>();
  private tokenRent = 0;
  private setup: Promise<AddressLookupTableAccount> | null = null;
  private ready: { at: number; table: AddressLookupTableAccount } | null = null;

  constructor(private keys: Record<Role, Keypair>) {
    this.wallets = Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey.toBase58()])) as Record<Role, string>;
    this.conn = new Connection(config.rpc, "confirmed");
    this.launchLab = new PublicKey(LAUNCHLAB_PROGRAM_ID[config.cluster]);
    this.cpmm = new PublicKey(CPMM_PROGRAM_ID[config.cluster]);
    this.lock = new PublicKey(LP_LOCK_PROGRAM_ID[config.cluster]);
    this.launchAuth = getPdaLaunchpadAuth(this.launchLab).publicKey;
    this.cpmmAuth = getPdaPoolAuthority(this.cpmm).publicKey;
    this.lockAuth = config.cluster === "devnet" ? DEVNET_PROGRAM_ID.LOCK_CPMM_AUTH : LOCK_CPMM_AUTH;
    this.platform = getPdaPlatformId(this.launchLab, keys.fees.publicKey).publicKey;
  }

  async start() {
    await this.syncQuoteConfigs().catch((e) => log(`quotes: can't read LaunchLab's configs (${(e as Error).message}); keeping the catalog's limits`));
    const fees = await this.solBalance(this.wallets.fees);
    if (fees < 0.05) log(`warning: the fee wallet holds ${fees} SOL; fund it so it can pay for the platform's accounts, claims and transfers`);
    if (!(await this.conn.getAccountInfo(this.platform).catch(() => null)))
      log(`no LaunchLab platform config at ${this.platform.toBase58()} yet: run \`pnpm --filter @gantry/backend setup:platform\`, or the first launch creates it`);
  }

  jobs() {
    return [
      { name: "index", ms: config.pollMs, run: () => this.poll() },
      { name: "graduations", ms: 20_000, run: () => this.findGraduated() },
      { name: "quotes", ms: CONFIG_TTL_MS, run: () => this.syncQuoteConfigs() },
      { name: "routes", ms: 20_000, run: () => this.checkRoutes() },
      { name: "holders", ms: 10 * 60_000, run: () => this.reconcileHolders() },
    ];
  }

  // ---------------------------------------------------------------- plumbing

  private pk = (s: string) => new PublicKey(s);

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** getMultipleAccounts for any number of addresses. */
  private async accounts(keys: PublicKey[]) {
    const out: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
    for (let i = 0; i < keys.length; i += ACCOUNTS_PER_CALL) {
      // a dozen calls in a row for the whole catalog: spaced out, a public RPC doesn't mind
      if (i) await sleep(150);
      out.push(...(await this.conn.getMultipleAccountsInfo(keys.slice(i, i + ACCOUNTS_PER_CALL))));
    }
    return out;
  }

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

  private ata(owner: string | PublicKey, mint: string | PublicKey, program: PublicKey) {
    const key = (v: string | PublicKey) => (typeof v === "string" ? this.pk(v) : v);
    return getAssociatedTokenAddressSync(key(mint), key(owner), true, program, ASSOCIATED_TOKEN_PROGRAM_ID);
  }

  /**
   * A token account that lives for one transaction, at an address derived from its owner and a seed so it needs no
   * signature of its own. With wrapped SOL it turns `lamports` of the owner's SOL into the quote a pool takes, and
   * closing it gives back whatever SOL is left in it.
   */
  private async seeded(owner: PublicKey, mint: PublicKey, lamports = 0n, seed = Keypair.generate().publicKey.toBase58().slice(0, 12)) {
    const account = await PublicKey.createWithSeed(owner, seed, TOKEN_PROGRAM_ID);
    this.tokenRent ||= await this.conn.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
    return {
      account,
      open: [
        SystemProgram.createAccountWithSeed({
          fromPubkey: owner,
          basePubkey: owner,
          seed,
          newAccountPubkey: account,
          lamports: Number(BigInt(this.tokenRent) + lamports),
          space: TOKEN_ACCOUNT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(account, mint, owner),
      ],
      close: createCloseAccountInstruction(account, owner, owner),
    };
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

  // ---------------------------------------------------------------- reads

  async solBalance(owner: string) {
    return (await this.conn.getBalance(this.pk(owner))) / 1e9;
  }

  async balances(owner: string): Promise<Balances> {
    const pk = this.pk(owner);
    const [sol, a, b] = await Promise.all([
      this.conn.getBalance(pk),
      this.conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }),
      this.conn.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const tokens: Record<string, string> = {};
    for (const acc of [...a.value, ...b.value]) {
      const info = acc.account.data.parsed.info as { mint: string; tokenAmount: { amount: string } };
      tokens[info.mint] = (big(tokens[info.mint]) + big(info.tokenAmount.amount)).toString();
    }
    // wrapped SOL counts as SOL for SOL-quoted coins
    return { sol: (BigInt(sol) + big(tokens[NATIVE_MINT])).toString(), tokens };
  }

  // ---------------------------------------------------------------- LaunchLab's configs and our platform

  /**
   * The quote's LaunchLab global config (constant-product curve, index 0): Raydium's protocol fee and the limits a
   * launch on that quote has to keep. Raydium creates these, one per quote mint; null when it has none for this one.
   */
  private launchConfig(quoteMint: string): Promise<LaunchConfig | null> {
    return this.cached(`launch-config:${quoteMint}`, async () => {
      const id = this.configId(quoteMint);
      const info = await this.conn.getAccountInfo(id);
      return info?.owner.equals(this.launchLab) ? { id, info: LaunchpadConfig.decode(info.data) } : null;
    });
  }

  private configId = (quoteMint: string) => getPdaLaunchpadConfigId(this.launchLab, this.pk(quoteMint), 0, 0).publicKey;

  /**
   * Reads every quote's LaunchLab config, its mint, and CPMM's registry entry for the mint (a dozen calls for the
   * whole catalog) and stores what they say: whether LaunchLab has a config, its floor on what a curve must raise,
   * the mint's display multiplier and transfer fee, and why coins can't be launched on it for now when its mint is in
   * a state pools can't trade or the config has no room for this launchpad's curve (see mint.ts, params.ts). A quote
   * is launchable only once this has read it. A multiplier that moved reprices the quote at once: its market price is
   * per displayed token, and a curve launched on the old one would be off by the size of the move.
   */
  private async syncQuoteConfigs() {
    const quotes = all<QuoteRow>("SELECT * FROM quote");
    const keys = quotes.flatMap((q) => [this.configId(q.mint), this.pk(q.mint), PublicKey.findProgramAddressSync([Buffer.from("support_mint"), this.pk(q.mint).toBuffer()], this.cpmm)[0]]);
    const [infos, { epoch }] = await Promise.all([this.accounts(keys), this.conn.getEpochInfo()]);
    const now = Math.floor(Date.now() / 1000);
    for (const [i, q] of quotes.entries()) {
      const [config, mint, registry] = infos.slice(i * 3, i * 3 + 3);
      const cfg = config?.owner.equals(this.launchLab) ? { id: keys[i * 3]!, info: LaunchpadConfig.decode(config.data) } : null;
      this.cache.set(`launch-config:${q.mint}`, { at: Date.now(), value: cfg });
      if (!cfg || !mint) {
        run("UPDATE quote SET available = 0, error = ?, checked_at = ? WHERE mint = ?", "LaunchLab has no global config for this mint", now, q.mint);
        if (q.available) log(`${q.symbol} is unavailable: LaunchLab has no global config for it`);
        continue;
      }
      this.tokenPrograms.set(q.mint, mint.owner);
      const state = inspectMint(q.symbol, this.pk(q.mint), mint, !!registry?.owner.equals(this.cpmm), epoch);
      const trouble = state.trouble ?? shapeTrouble(q.symbol, launchLimits(cfg.info));
      if (q.checked_at && trouble !== q.error) log(trouble ? `${q.symbol} takes no launches: ${trouble}` : `${q.symbol} takes launches again`);
      if (Math.abs(state.scale / q.ui_scale - 1) > 1e-6) log(`${q.symbol}: display multiplier ${q.ui_scale} → ${state.scale}`);
      if (q.checked_at && (state.fee?.bps ?? 0) !== q.fee_bps) log(`${q.symbol}: transfer fee ${q.fee_bps / 100}% → ${(state.fee?.bps ?? 0) / 100}%`);
      run(
        "UPDATE quote SET available = 1, error = ?, min_raise = ?, usd = usd * ? / ui_scale, ui_scale = ?, fee_bps = ?, fee_max = ?, checked_at = ? WHERE mint = ?",
        trouble,
        cfg.info.minFundRaisingB.toString(),
        state.scale,
        state.scale,
        state.fee?.bps ?? 0,
        // a cap at the largest amount there is, is no cap
        state.fee && state.fee.max < 2n ** 63n ? state.fee.max.toString() : "",
        now,
        q.mint,
      );
    }
  }

  /**
   * The fee wallet turns every quote it earns into SOL through Jupiter, and a first buy paid in SOL goes the other
   * way. A quote with no route to SOL, or one so thin that a typical amount moves its price too far, takes no
   * launches until that changes. When Jupiter can't be reached the last answer stands.
   */
  private async probeRoute(q: QuoteRow) {
    let trouble = q.route_error;
    try {
      const route = await jupQuote(q.mint, NATIVE_MINT, BigInt(Math.floor((config.routeProbeUsd / q.usd) * 10 ** q.decimals)), 100);
      trouble = Number(route.priceImpactPct) * 10_000 > config.routeMaxImpactBps ? `${q.symbol} is too thinly traded right now for its fees to be turned into SOL.` : null;
    } catch (e) {
      // a 400 is Jupiter answering that there is no route; anything else is Jupiter being out of reach
      if (/Jupiter quote 400/.test((e as Error).message)) trouble = `There's no market route from ${q.symbol} to SOL right now, so its fees couldn't be paid out.`;
      else return;
    }
    if (trouble !== q.route_error) log(trouble ? `${q.symbol} takes no launches: ${trouble}` : `${q.symbol} has a route to SOL again`);
    run("UPDATE quote SET route_error = ?, route_at = ? WHERE mint = ?", trouble, Math.floor(Date.now() / 1000), q.mint);
  }

  /**
   * Keeps the routes current without asking Jupiter about hundreds of quotes at once: each pass asks about the few
   * that have waited longest (of the ones never asked about, the quotes coins already trade against first). A launch asks about its own quote when
   * the answer on file is old (checkQuote), so no coin is launched on a quote this hasn't reached yet.
   */
  private async checkRoutes() {
    const due = all<QuoteRow>(
      `SELECT q.* FROM quote q WHERE q.available = 1 AND q.usd > 0 AND q.error IS NULL AND q.mint != ?
       ORDER BY q.route_at > 0, CASE WHEN q.route_at = 0 THEN NOT EXISTS (SELECT 1 FROM coin c WHERE c.quote = q.mint) ELSE 0 END, q.route_at, q.liquidity DESC LIMIT ?`,
      NATIVE_MINT,
      ROUTES_PER_PASS,
    );
    for (const [i, q] of due.entries()) {
      if (i) await sleep(1500);
      await this.probeRoute(q);
    }
  }

  async checkQuote(mint: string) {
    const now = Math.floor(Date.now() / 1000);
    let q = quoteRow(mint);
    if (!q?.available || q.error) return;
    if (now - q.price_at > LAUNCH_PRICE_AGE) await refreshPrice(mint).catch(() => undefined);
    q = quoteRow(mint)!;
    if (mint !== NATIVE_MINT && q.usd > 0 && now - q.route_at > LAUNCH_ROUTE_AGE) await this.probeRoute(q);
  }

  private platformInfo(fresh = false): Promise<LaunchpadPlatformInfo | null> {
    if (fresh) this.cache.delete("platform");
    return this.cached("platform", async () => {
      const info = await this.conn.getAccountInfo(this.platform);
      return info ? PlatformConfig.decode(info.data) : null;
    });
  }

  /** What the platform config should say and doesn't, each with the update that fixes it. */
  private platformDrift(p: LaunchpadPlatformInfo, feeRate: bigint) {
    const fees = this.keys.fees.publicKey;
    const want = platformParams(feeRate);
    const tier = this.pk(CPMM_TIER[config.cluster].config);
    const scale = want.migrateCpLockNftScale;
    type Fix = Parameters<typeof updatePlatformConfig>[3];
    const out: { what: string; fix?: Fix }[] = [];
    if (!p.feeRate.eq(want.feeRate)) out.push({ what: `fee rate ${p.feeRate} (want ${want.feeRate})`, fix: { type: "updateFeeRate", value: want.feeRate } });
    if (!p.cpConfigId.equals(tier)) out.push({ what: `CPMM tier ${p.cpConfigId.toBase58()} (want ${tier.toBase58()})`, fix: { type: "updateCpConfigId", value: tier } });
    if (!p.platformScale.eq(scale.platformScale) || !p.creatorScale.eq(scale.creatorScale) || !p.burnScale.eq(scale.burnScale))
      out.push({ what: `LP split ${p.platformScale}/${p.creatorScale}/${p.burnScale}`, fix: { type: "migrateCpLockNftScale", value: scale } });
    if (!p.platformClaimFeeWallet.equals(fees)) out.push({ what: "fee claim wallet", fix: { type: "updateClaimFeeWallet", value: fees } });
    if (!p.platformLockNftWallet.equals(fees)) out.push({ what: "Fee Key wallet", fix: { type: "updateLockNftWallet", value: fees } });
    if (!p.platformCpCreator.equals(fees)) out.push({ what: "CPMM creator of record", fix: { type: "updatePlatformCpCreator", value: fees } });
    // only a rewrite of the whole config changes this one; it is created at zero
    if (!p.creatorFeeRate.isZero()) out.push({ what: `creator fee rate ${p.creatorFeeRate} (want 0)` });
    return out;
  }

  /**
   * Makes sure the platform exists on-chain: its LaunchLab platform config, and the address lookup table that lets
   * a launch fit in one transaction. Both are created by the fee wallet the first time (a setup script does it ahead
   * of the first launch). `fix` also brings a config that has drifted from the fee policy back in line. Checked
   * against the chain every few minutes, not on every launch.
   */
  ensurePlatform(fix = false): Promise<AddressLookupTableAccount> {
    if (!fix && this.ready && Date.now() - this.ready.at < CONFIG_TTL_MS) return Promise.resolve(this.ready.table);
    this.setup ??= this.setUpPlatform(fix)
      .then((table) => (this.ready = { at: Date.now(), table }).table)
      .finally(() => (this.setup = null));
    return this.setup;
  }

  private async setUpPlatform(fix: boolean) {
    const fees = this.keys.fees.publicKey;
    // Raydium's protocol fee is the same on every config; the first quote that has one tells it
    const listed = one<{ mint: string }>("SELECT mint FROM quote WHERE available = 1 ORDER BY rowid LIMIT 1");
    const anyConfig = listed ? await this.launchConfig(listed.mint) : null;
    if (!anyConfig) throw new Error("LaunchLab has a global config for none of the quotes");
    const feeRate = platformFeeRate(int(anyConfig.info.tradeFeeRate));
    let p = await this.platformInfo(true);
    if (!p) {
      const rent = await this.conn.getMinimumBalanceForRentExemption(PlatformConfig.span);
      const balance = await this.conn.getBalance(fees, "confirmed");
      if (balance < rent + SETUP_FEE_MARGIN_LAMPORTS) {
        log(`fee wallet too low to create the platform config: holds ${balance / 1e9} SOL, needs ${(rent + SETUP_FEE_MARGIN_LAMPORTS) / 1e9}`);
        throw lowFeeWallet();
      }
      const params = platformParams(feeRate);
      const tx = new Transaction().add(
        createPlatformConfig(
          this.launchLab,
          fees,
          fees, // claims the platform fee
          fees, // receives each graduated pool's Fee Key NFT
          fees, // vesting wallet: unused, nothing is vested
          this.platform,
          this.pk(CPMM_TIER[config.cluster].config),
          fees, // transfer-fee authority: unused, coins are plain SPL tokens
          params.migrateCpLockNftScale,
          params.feeRate,
          params.creatorFeeRate,
          brand.name,
          brand.url,
          `${brand.url}/icon.svg`,
          params.platformVestingScale,
        ),
        // without this the coin's creator would be the CPMM pool's creator of record and collect its creator fee
        updatePlatformConfig(this.launchLab, fees, this.platform, { type: "updatePlatformCpCreator", value: fees }),
      );
      const sig = await this.send(tx, [this.keys.fees]).catch((e: Error) => {
        if (LOW_SOL.test(e.message)) throw lowFeeWallet();
        throw e;
      });
      log(`platform config ${this.platform.toBase58()} created: ${Number(feeRate) / 10_000}% platform fee, CPMM tier ${CPMM_TIER[config.cluster].index} (${sig})`);
      p = await this.platformInfo(true);
    } else {
      const drift = this.platformDrift(p, feeRate);
      for (const d of drift) {
        if (!fix || !d.fix) {
          log(`warning: platform config has ${d.what}${d.fix ? "; run setup:platform to correct it" : ""}`);
          continue;
        }
        const sig = await this.send(new Transaction().add(updatePlatformConfig(this.launchLab, fees, this.platform, d.fix)), [this.keys.fees]);
        log(`platform config: corrected ${d.what} (${sig})`);
      }
      if (fix && drift.length) await this.platformInfo(true);
    }
    return this.lookupTable();
  }

  /**
   * Creating the coin, its curve and its metadata and buying on it in the same transaction names about two dozen
   * accounts, more than fit in one packet, so a launch is a v0 transaction that takes the ones every launch names
   * out of a lookup table the fee wallet owns (commonAddresses). A launch on SOL is the largest, because it also
   * wraps the SOL it spends: it only fits with SOL's own three addresses in the table too, and the stablecoins' are
   * there to keep theirs small. Every other quote's three ride in the transaction itself, which still fits (the
   * tests hold the largest of them to the limit), so the one small table serves a catalog of any size.
   */
  private async lookupTable(): Promise<AddressLookupTableAccount> {
    const fees = this.keys.fees.publicKey;
    const pinned = all<{ mint: string }>("SELECT mint FROM quote WHERE available = 1 AND category IN ('solana', 'currency') ORDER BY rowid").flatMap((q) => this.quoteAddresses(q.mint));
    const wanted = [...this.commonAddresses(), ...pinned];
    const has = (t: AddressLookupTableAccount | null, k: PublicKey) => !!t?.state.addresses.some((a) => a.equals(k));
    const missingFrom = (t: AddressLookupTableAccount | null) => wanted.filter((k) => !has(t, k));
    let table: AddressLookupTableAccount | null = null;
    for (const known of [config.lookupTable, kvGet("lookup_table")]) {
      if (!known || table) continue;
      const t = (await this.conn.getAddressLookupTable(this.pk(known))).value;
      if (t && missingFrom(t).length === 0) return t;
      // one left from another fee wallet can't be extended by this one: it is passed over
      if (t?.state.authority?.equals(fees)) table = t;
    }
    const missing = missingFrom(table);

    let address = table?.key;
    for (let i = 0; i < missing.length; i += TABLE_ADDS_PER_TX) {
      const ixs: TransactionInstruction[] = [];
      if (!address) {
        const [create, created] = AddressLookupTableProgram.createLookupTable({ authority: fees, payer: fees, recentSlot: await this.settledSlot() });
        ixs.push(create);
        address = created;
      }
      const addresses = missing.slice(i, i + TABLE_ADDS_PER_TX);
      ixs.push(AddressLookupTableProgram.extendLookupTable({ lookupTable: address, authority: fees, payer: fees, addresses }));
      const sig = await this.send(new Transaction().add(...ixs), [this.keys.fees]).catch((e: Error) => {
        if (LOW_SOL.test(e.message)) throw lowFeeWallet();
        throw e;
      });
      kvSet("lookup_table", address.toBase58());
      log(`lookup table ${address.toBase58()}: ${addresses.length} address(es) added (${sig})${config.lookupTable ? "" : "; set LOOKUP_TABLE to keep it across databases"}`);
    }
    // new entries can be used from the slot after the one they were added in
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      table = (await this.conn.getAddressLookupTable(address!)).value;
      if (table && wanted.every((k) => has(table, k)) && (await this.conn.getSlot("confirmed")) > table.state.lastExtendedSlot) return table;
    }
    throw new UserError("The platform's lookup table isn't ready yet. Try again in a few seconds.");
  }

  /**
   * A slot a lookup table can be created from. The program only takes one listed in the SlotHashes sysvar, as seen by
   * the node that runs the transaction, and that node may be a few slots behind the one that answered here. So this
   * reads the list itself (newest first: a count, then a slot and its hash per entry) and takes one well down it.
   */
  private async settledSlot() {
    const info = await this.conn.getAccountInfo(SYSVAR_SLOT_HASHES_PUBKEY, "confirmed");
    const count = info ? Number(info.data.readBigUInt64LE(0)) : 0;
    if (!info || count === 0) throw new Error("the SlotHashes sysvar can't be read");
    return Number(info.data.readBigUInt64LE(8 + Math.min(SETTLED_SLOTS, count - 1) * 40));
  }

  /** In the lookup table for every launch: the platform's own accounts, LaunchLab's, and the programs a launch touches without calling them itself. */
  private commonAddresses() {
    return [this.platform, this.launchAuth, getPdaCpiEvent(this.launchLab).publicKey, METADATA_PROGRAM_ID, SYSVAR_RENT_PUBKEY, this.keys.fees.publicKey, TOKEN_2022_PROGRAM_ID];
  }

  /** What a launch names for its quote: the mint, its LaunchLab config and the platform's fee vault for it. */
  private quoteAddresses(mint: string) {
    return [this.pk(mint), this.configId(mint), getPdaPlatformVault(this.launchLab, this.platform, this.pk(mint)).publicKey];
  }

  // ---------------------------------------------------------------- launch

  async launch(req: LaunchRequest, uriBase: string, entry?: { raw: bigint; to: string }): Promise<LaunchResponse> {
    const q = quoteRow(req.quote);
    const cfg = q && q.available ? await this.launchConfig(req.quote) : null;
    if (!q || !cfg) throw new UserError("That quote asset isn't available.");
    const curve = launchParams(q, launchLimits(cfg.info));
    const table = await this.ensurePlatform();
    const platform = (await this.platformInfo())!;

    const mint = Keypair.generate();
    const mintAddr = mint.publicKey.toBase58();
    storeMetadata(mintAddr, req);
    const uri = (await pinJson(mintAddr)) ?? `${uriBase}${mintAddr}.json`;
    kvSet(`launch:${mintAddr}`, JSON.stringify({ ...req, uri, entry: entry?.raw.toString(), entryFor: entry?.to }));

    const user = this.pk(req.wallet);
    const quote = this.pk(req.quote);
    const quoteProgram = await this.tokenProgram(req.quote);
    const pool = getPdaLaunchpadPoolId(this.launchLab, mint.publicKey, quote).publicKey;
    const vaultA = getPdaLaunchpadVaultId(this.launchLab, pool, mint.publicKey).publicKey;
    const vaultB = getPdaLaunchpadVaultId(this.launchLab, pool, quote).publicKey;
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: LAUNCH_COMPUTE_UNITS }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
      initializeV2(
        this.launchLab,
        user,
        user,
        cfg.id,
        this.platform,
        this.launchAuth,
        pool,
        mint.publicKey,
        quote,
        vaultA,
        vaultB,
        getPdaMetadataKey(mint.publicKey).publicKey,
        quoteProgram,
        COIN_DECIMALS,
        req.name,
        req.symbol,
        uri,
        { type: "ConstantCurve", migrateType: "cpmm", supply: bn(curve.supply), totalSellA: bn(curve.sell), totalFundRaisingB: bn(curve.raise) },
        ZERO, // nothing locked or vested
        ZERO,
        ZERO,
        // the CPMM pool's creator fee is charged in the quote only, never in the coin
        CpmmCreatorFeeOn.OnlyTokenB,
      ),
    ];

    // a copy's Fleet entry is bought together with the creator's own buy, as the first buy on the new curve. Both
    // are what the launcher sends: a quote with a transfer fee lands on the curve less that fee.
    const total = big(req.initialBuy) + (entry?.raw ?? 0n);
    if (total > 0n) {
      const userCoins = this.ata(user, mint.publicKey, TOKEN_PROGRAM_ID);
      const paying = req.quote === NATIVE_MINT ? await this.seeded(user, WSOL, total) : null;
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(user, userCoins, user, mint.publicKey, TOKEN_PROGRAM_ID),
        ...(paying?.open ?? []),
        buyExactInInstruction(
          this.launchLab,
          user,
          this.launchAuth,
          cfg.id,
          this.platform,
          pool,
          userCoins,
          paying?.account ?? this.ata(user, quote, quoteProgram),
          vaultA,
          vaultB,
          mint.publicKey,
          quote,
          TOKEN_PROGRAM_ID,
          quoteProgram,
          getPdaPlatformVault(this.launchLab, this.platform, quote).publicKey,
          getPdaCreatorVault(this.launchLab, user, quote).publicKey,
          bn(total),
          // nothing can trade on the curve before this buy, in the transaction that creates it
          ZERO,
          ZERO,
        ),
        ...(paying ? [paying.close] : []),
      );
      if (entry) {
        // the coins the entry's amount buys first move on to the fee wallet in the same transaction, plus rent for the
        // token accounts they're airdropped into
        // (what the entry's amount buys after the quote's transfer fee: never more than the whole buy brought in)
        const entryTokens = this.firstBuyOut(curve, afterTransferFee(entry.raw, transferFeeOf(q)), cfg.info, platform);
        const holder = this.keys.fees.publicKey;
        const to = this.ata(holder, mint.publicKey, TOKEN_PROGRAM_ID);
        ixs.push(
          createAssociatedTokenAccountIdempotentInstruction(user, to, holder, mint.publicKey, TOKEN_PROGRAM_ID),
          createTransferCheckedInstruction(userCoins, mint.publicKey, to, user, entryTokens, COIN_DECIMALS, [], TOKEN_PROGRAM_ID),
          SystemProgram.transfer({ fromPubkey: user, toPubkey: holder, lamports: ENTRY_RENT_LAMPORTS }),
        );
      }
    }

    const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message([table]));
    tx.sign([mint]);
    const raw = tx.serialize();
    if (raw.length > MAX_TX_BYTES) throw new UserError("This launch doesn't fit in one transaction. Shorten the name and try again.");
    return { tx: Buffer.from(raw).toString("base64"), demo: false, lastValidBlockHeight, mint: mintAddr, pool: pool.toBase58() };
  }

  /** Coins the first buy of `amount` on a new curve gets, computed the way the program will. */
  private firstBuyOut(curve: LaunchCurve, amount: bigint, cfg: LaunchpadConfigInfo, platform: LaunchpadPlatformInfo) {
    const fill = Curve.buyExactIn({
      poolInfo: { virtualA: bn(curve.virtualBase), virtualB: bn(curve.virtualQuote), realA: ZERO, realB: ZERO, totalSellA: bn(curve.sell), totalFundRaisingB: bn(curve.raise) },
      amountB: bn(amount),
      protocolFeeRate: cfg.tradeFeeRate,
      platformFeeRate: platform.feeRate,
      creatorFeeRate: platform.creatorFeeRate,
      shareFeeRate: ZERO,
      curveType: cfg.curveType,
      transferFeeConfigA: undefined,
      slot: 0,
    });
    return int(fill.amountA.amount);
  }

  async solToQuote(wallet: string, quote: string, lamports: bigint): Promise<SolToQuote> {
    const symbol = quoteRow(quote)?.symbol ?? "this token";
    const q = await jupQuote(NATIVE_MINT, quote, lamports, 100).catch((e: Error) => {
      log(`sol-to-quote ${symbol}: ${e.message}`);
      throw new UserError(`Jupiter has no SOL to ${symbol} route right now. Pay your first buy in ${symbol} instead, or try again.`);
    });
    // a thin market: the swap would move the quote's price against the launcher before the first buy is made
    const impact = Number(q.priceImpactPct) * 100;
    if (impact * 100 > config.routeMaxImpactBps)
      throw new UserError(`Swapping that much SOL into ${symbol} would move its price by ${impact.toFixed(1)}%. Make the first buy smaller, or pay it in ${symbol}.`);
    const { tx, lastValidBlockHeight } = await jupSwapTx(q, this.pk(wallet));
    return {
      tx: Buffer.from(tx.serialize()).toString("base64"),
      demo: false,
      lastValidBlockHeight,
      quote,
      lamports: lamports.toString(),
      outAmount: q.outAmount,
      minOut: q.otherAmountThreshold,
    };
  }

  // ---------------------------------------------------------------- trading

  /** The curve's live state, with the rates its trades pay. */
  private async curveState(c: CoinRow) {
    const info = await this.conn.getAccountInfo(this.pk(c.pool), "confirmed");
    if (!info) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
    const pool = LaunchpadPool.decode(info.data);
    if (pool.status !== 0) {
      // the indexer normally learns this from the trade that sold the curve out
      run("UPDATE coin SET graduated = 1, graduated_at = COALESCE(graduated_at, ?) WHERE mint = ?", Math.floor(Date.now() / 1000), c.mint);
      throw migrating();
    }
    const [cfg, platform] = await Promise.all([this.launchConfig(c.quote), this.platformInfo()]);
    if (!cfg || !platform) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
    return {
      pool,
      cfg,
      rates: { protocolFeeRate: cfg.info.tradeFeeRate, platformFeeRate: platform.feeRate, creatorFeeRate: platform.creatorFeeRate, shareFeeRate: ZERO, curveType: cfg.info.curveType, slot: 0 },
    };
  }

  /** A graduated coin's CPMM pool: the fields that never change. */
  private async cpmmPool(id: string): Promise<CpmmPool> {
    let p = this.pools.get(id);
    if (!p) {
      const info = await this.conn.getAccountInfo(this.pk(id), "confirmed");
      if (!info) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
      const d = CpmmPoolInfoLayout.decode(info.data);
      p = {
        id: this.pk(id),
        config: d.configId,
        mintA: d.mintA,
        mintB: d.mintB,
        vaultA: d.vaultA,
        vaultB: d.vaultB,
        programA: d.mintProgramA,
        programB: d.mintProgramB,
        mintLp: d.mintLp,
        creator: d.poolCreator,
        feeOn: d.feeOn,
        creatorFee: d.enableCreatorFee,
      };
      this.pools.set(id, p);
    }
    return p;
  }

  /**
   * A pool's fee tier, read from its config: the trade fee, the creator fee when the pool charges one, and Raydium's
   * shares of both. Its share of the creator fee can be set per creator, which overrides the tier's.
   */
  private tier(pool: CpmmPool): Promise<TierRates> {
    return this.cached(`tier:${pool.config.toBase58()}:${pool.creator.toBase58()}:${pool.creatorFee}`, async () => {
      const [cfg, own] = await this.conn.getMultipleAccountsInfo([pool.config, getCreatorFeeSharePda(this.cpmm, pool.creator, pool.config).publicKey]);
      if (!cfg) throw new Error(`CPMM config ${pool.config.toBase58()} not found`);
      const d = CpmmConfigInfoLayout.decode(cfg.data);
      const creator = pool.creatorFee ? d.creatorFeeRate : ZERO;
      const creatorShare = own?.owner.equals(this.cpmm) ? CpmmCreatorFeeShareLayout.decode(own.data).shareRate : d.creatorFeeShareRate;
      return {
        trade: d.tradeFeeRate,
        creator,
        protocol: d.protocolFeeRate,
        fund: d.fundFeeRate,
        rates: { trade: int(d.tradeFeeRate), creator: int(creator), protocolShare: int(d.protocolFeeRate), fundShare: int(d.fundFeeRate), creatorShare: int(creatorShare) },
      };
    });
  }

  /** What the pool trades on right now: its two vaults, less the fees they hold for Raydium and the pool's creator. */
  private async cpmmReserves(pool: CpmmPool) {
    const [state, a, b] = await this.conn.getMultipleAccountsInfo([pool.id, pool.vaultA, pool.vaultB], "confirmed");
    if (!state || !a || !b) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
    const d = CpmmPoolInfoLayout.decode(state.data);
    const held = (acc: { data: Buffer }) => new BN(AccountLayout.decode(acc.data).amount.toString());
    return {
      a: held(a).sub(d.protocolFeesMintA).sub(d.fundFeesMintA).sub(d.creatorFeesMintA),
      b: held(b).sub(d.protocolFeesMintB).sub(d.fundFeesMintB).sub(d.creatorFeesMintB),
      creatorFees: int(d.creatorFeesMintA) + int(d.creatorFeesMintB),
    };
  }

  async swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number): Promise<SwapQuote> {
    const keep = BigInt(10_000 - slippageBps);
    const qDec = quoteDecimals(c.quote);
    // the quote's own transfer fee: a buy is priced on what reaches the pool, a sale pays out before it is taken
    const tf = quoteFee(c.quote);
    const landed = side === "buy" ? afterTransferFee(amount, tf) : amount;
    const price = (quote: BN, base: BN) => (Number(int(quote)) / Number(int(base))) * 10 ** (COIN_DECIMALS - qDec);
    const impact = (before: number, after: number) => (before > 0 ? Math.abs(after - before) / before : 0);

    if (c.cpmm_pool) {
      const pool = await this.cpmmPool(c.cpmm_pool);
      const [tier, r] = await Promise.all([this.tier(pool), this.cpmmReserves(pool)]);
      const coinIsA = pool.mintA.toBase58() === c.mint;
      // input is mint A when the coin is A and it's being sold, or the quote is A and it's buying
      const aIn = coinIsA === (side === "sell");
      const [reserveIn, reserveOut] = aIn ? [r.a, r.b] : [r.b, r.a];
      const feeOnInput = pool.feeOn === FeeOn.BothToken || (pool.feeOn === FeeOn.OnlyTokenA && aIn) || (pool.feeOn === FeeOn.OnlyTokenB && !aIn);
      const s = CurveCalculator.swapBaseInput(bn(landed), reserveIn, reserveOut, tier.trade, tier.creator, tier.protocol, tier.fund, feeOnInput);
      const paid = int(s.outputAmount);
      const out = side === "buy" ? paid : afterTransferFee(paid, tf);
      const creatorFee = int(s.creatorFee);
      // the fee in the quote: a sale's trade fee is charged in the coin, so it is valued at this fill's price
      const quoteGross = side === "buy" ? landed : paid + (feeOnInput ? 0n : creatorFee);
      const tradeFee = side === "buy" ? int(s.tradeFee) : (int(s.tradeFee) * quoteGross) / amount;
      const fee = cpmmFees(tradeFee, creatorFee, tier.rates).tax;
      const [quoteBefore, baseBefore] = side === "buy" ? [reserveIn, reserveOut] : [reserveOut, reserveIn];
      const [quoteAfter, baseAfter] = side === "buy" ? [s.newInputVaultAmount, s.newOutputVaultAmount] : [s.newOutputVaultAmount, s.newInputVaultAmount];
      return {
        side,
        amountIn: amount.toString(),
        amountOut: out.toString(),
        minOut: ((out * keep) / 10_000n).toString(),
        fee: fee.toString(),
        transferFee: (side === "buy" ? amount - landed : paid - out).toString(),
        feeBps: quoteGross > 0n ? Number((fee * 10_000n) / quoteGross) : 0,
        priceImpact: impact(price(quoteBefore, baseBefore), price(quoteAfter, baseAfter)),
        venue: "cpmm",
      };
    }
    if (c.graduated) throw migrating();

    const { pool, rates } = await this.curveState(c);
    const before = price(pool.virtualB.add(pool.realB), pool.virtualA.sub(pool.realA));
    if (side === "buy") {
      const f = Curve.buyExactIn({ poolInfo: pool, amountB: bn(landed), ...rates, transferFeeConfigA: undefined });
      const out = int(f.amountA.amount);
      const used = int(f.amountB);
      const fee = int(f.splitFee.protocolFee) + int(f.splitFee.platformFee) + int(f.splitFee.creatorFee) + int(f.splitFee.shareFee);
      // a buy that completes the curve only takes what the last coins cost: that, and the transfer fee to get it there
      const sent = used < landed ? beforeTransferFee(used, tf) : amount;
      return {
        side,
        amountIn: sent.toString(),
        amountOut: out.toString(),
        minOut: ((out * keep) / 10_000n).toString(),
        fee: fee.toString(),
        transferFee: (sent - afterTransferFee(sent, tf)).toString(),
        feeBps: used > 0n ? Number((fee * 10_000n) / used) : 0,
        priceImpact: impact(before, price(pool.virtualB.add(pool.realB).add(bn(used - fee)), pool.virtualA.sub(pool.realA).sub(bn(out)))),
        venue: "curve",
      };
    }
    if (amount > int(pool.realA)) throw new UserError("That's more than the curve has sold.");
    const f = Curve.sellExactIn({ poolInfo: pool, amountA: bn(amount), ...rates, transferFeeConfigA: undefined });
    const paid = int(f.amountB);
    const out = afterTransferFee(paid, tf);
    const fee = int(f.splitFee.protocolFee) + int(f.splitFee.platformFee) + int(f.splitFee.creatorFee) + int(f.splitFee.shareFee);
    const gross = paid + fee;
    return {
      side,
      amountIn: amount.toString(),
      amountOut: out.toString(),
      minOut: ((out * keep) / 10_000n).toString(),
      fee: fee.toString(),
      transferFee: (paid - out).toString(),
      feeBps: gross > 0n ? Number((fee * 10_000n) / gross) : 0,
      priceImpact: impact(before, price(pool.virtualB.add(pool.realB).sub(bn(gross)), pool.virtualA.sub(pool.realA).add(bn(amount)))),
      venue: "curve",
    };
  }

  async swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse> {
    const amount = big(req.amount);
    const quote = await this.swapQuote(c, req.side, amount, req.slippageBps);
    // a buy that completes the curve pays only for the coins that were left
    const tx = await this.swapTx(c, req.wallet, req.side, req.side === "buy" ? big(quote.amountIn) : amount, big(quote.minOut));
    return { ...(await this.forUser(tx, req.wallet)), quote };
  }

  private async swapTx(c: CoinRow, owner: string, side: SwapSide, amount: bigint, minOut: bigint) {
    const user = this.pk(owner);
    const coin = this.pk(c.mint);
    const quote = this.pk(c.quote);
    const quoteProgram = await this.tokenProgram(c.quote);
    const userCoins = this.ata(user, coin, TOKEN_PROGRAM_ID);
    const tx = new Transaction();
    // SOL-quoted coins trade against wrapped SOL: wrap what a buy spends, unwrap what a sale earns
    const wrapped = c.quote === NATIVE_MINT ? await this.seeded(user, WSOL, side === "buy" ? amount : 0n) : null;
    const userQuote = wrapped?.account ?? this.ata(user, quote, quoteProgram);
    if (wrapped) tx.add(...wrapped.open);
    else if (side === "sell") tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userQuote, user, quote, quoteProgram));
    if (side === "buy") tx.add(createAssociatedTokenAccountIdempotentInstruction(user, userCoins, user, coin, TOKEN_PROGRAM_ID));

    if (c.cpmm_pool) {
      const pool = await this.cpmmPool(c.cpmm_pool);
      const coinIsA = pool.mintA.equals(coin);
      const [coinVault, quoteVault] = coinIsA ? [pool.vaultA, pool.vaultB] : [pool.vaultB, pool.vaultA];
      const buy = side === "buy";
      tx.add(
        makeSwapCpmmBaseInInstruction(
          this.cpmm,
          user,
          this.cpmmAuth,
          pool.config,
          pool.id,
          buy ? userQuote : userCoins,
          buy ? userCoins : userQuote,
          buy ? quoteVault : coinVault,
          buy ? coinVault : quoteVault,
          buy ? quoteProgram : TOKEN_PROGRAM_ID,
          buy ? TOKEN_PROGRAM_ID : quoteProgram,
          buy ? quote : coin,
          buy ? coin : quote,
          getPdaObservationId(this.cpmm, pool.id).publicKey,
          bn(amount),
          bn(minOut),
        ),
      );
    } else {
      const cfg = await this.launchConfig(c.quote);
      if (!cfg) throw new UserError("Pool not found on-chain yet. Try again in a few seconds.");
      const pool = this.pk(c.pool);
      const build = side === "buy" ? buyExactInInstruction : sellExactInInstruction;
      tx.add(
        build(
          this.launchLab,
          user,
          this.launchAuth,
          cfg.id,
          this.platform,
          pool,
          userCoins,
          userQuote,
          getPdaLaunchpadVaultId(this.launchLab, pool, coin).publicKey,
          getPdaLaunchpadVaultId(this.launchLab, pool, quote).publicKey,
          coin,
          quote,
          TOKEN_PROGRAM_ID,
          quoteProgram,
          getPdaPlatformVault(this.launchLab, this.platform, quote).publicKey,
          getPdaCreatorVault(this.launchLab, this.pk(c.creator), quote).publicKey,
          bn(amount),
          bn(minOut),
          ZERO, // no referral fee on swaps built here
        ),
      );
    }
    if (wrapped) tx.add(wrapped.close);
    return tx;
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

  /**
   * Every curve trade puts its platform fee in one vault per quote, shared by all the platform's coins. This sweeps
   * that vault into the fee wallet (wrapped SOL is unwrapped on the way) and returns what this coin's part of it
   * brings in: the platform fees of its trades indexed so far, less the quote's transfer fee on the way out of the
   * vault. (Taken coin by coin, the fee rounds up at least as much as on the one sweep, so the wallet never holds
   * less than was booked.)
   */
  async claimFees(c: CoinRow): Promise<bigint> {
    const fees = this.keys.fees.publicKey;
    const quote = this.pk(c.quote);
    const program = await this.tokenProgram(c.quote);
    const vault = getPdaPlatformVault(this.launchLab, this.platform, quote).publicKey;
    const held = await this.conn
      .getTokenAccountBalance(vault, "confirmed")
      .then((b) => BigInt(b.value.amount))
      .catch(() => 0n);
    if (held > 0n) {
      const to = this.ata(fees, quote, program);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(fees, to, fees, quote, program),
        claimPlatformFeeFromVault(this.launchLab, this.platform, fees, getPdaPlatformFeeVaultAuth(this.launchLab).publicKey, vault, to, quote, program),
      );
      if (c.quote === NATIVE_MINT) tx.add(createCloseAccountInstruction(to, fees, fees));
      await this.send(tx, [this.keys.fees]);
    }
    return afterTransferFee(big(c.claimable_quote), quoteFee(c.quote));
  }

  /**
   * A graduated pool pays the fee wallet two ways. Its whole LP is locked in Raydium's LP lock, and the Fee Key NFT
   * the fee wallet holds collects the fees that LP has earned: as LP tokens, so in both the coin and the quote. And
   * as the pool's creator of record the fee wallet collects its creator fee, charged in the quote only.
   *
   * The coins go to an account of their own, are burned in a second transaction and the account closed, so they
   * never mix with what the fee wallet holds for Fleet entries. The amounts are read from the first transaction,
   * and its signature is kept until the second has landed, so a crash in between finishes the job on the next run.
   */
  async harvestFees(c: CoinRow) {
    if (!c.cpmm_pool) return { quote: 0n, burned: 0n, sig: "" };
    const pending = kvGet(`harvest:${c.mint}`);
    if (pending) return this.settleHarvest(c, pending);

    const fees = this.keys.fees.publicKey;
    const pool = await this.cpmmPool(c.cpmm_pool);
    const feeKey = this.pk(c.fee_key ?? (await this.findFeeKey(c)));
    const coinIsA = pool.mintA.toBase58() === c.mint;
    const coin = this.pk(c.mint);
    const quote = this.pk(c.quote);
    const quoteProgram = await this.tokenProgram(c.quote);
    const coinsTo = await this.harvestAccount(c);
    const quoteTo = this.ata(fees, quote, quoteProgram);
    const tx = new Transaction();
    if (!(await this.conn.getAccountInfo(coinsTo.account))) tx.add(...coinsTo.open);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(fees, quoteTo, fees, quote, quoteProgram),
      collectCpFeeInstruction({
        programId: this.lock,
        nftOwner: fees,
        auth: this.lockAuth,
        nftMint: feeKey,
        nftAccount: this.ata(fees, feeKey, TOKEN_PROGRAM_ID),
        lockPda: getCpLockPda(this.lock, feeKey).publicKey,
        poolId: pool.id,
        mintLp: pool.mintLp,
        userVaultA: coinIsA ? coinsTo.account : quoteTo,
        userVaultB: coinIsA ? quoteTo : coinsTo.account,
        poolVaultA: pool.vaultA,
        poolVaultB: pool.vaultB,
        mintA: pool.mintA,
        mintB: pool.mintB,
        lockLpVault: this.ata(this.lockAuth, pool.mintLp, TOKEN_PROGRAM_ID),
        // the lock program reads this as "everything the position has earned": it is what Raydium's own claims pass
        lpFeeAmount: U64_MAX,
        cpmmProgram: this.cpmm,
        cpmmAuthProgram: this.cpmmAuth,
      }),
    );
    if (pool.creator.equals(fees) && (await this.cpmmReserves(pool)).creatorFees > 0n) {
      // the creator fee is paid to the creator's own token accounts, so the (empty) coin side goes to the fee wallet's
      const coinAta = this.ata(fees, coin, TOKEN_PROGRAM_ID);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(fees, coinAta, fees, coin, TOKEN_PROGRAM_ID),
        makeCollectCreatorFeeInstruction(
          this.cpmm,
          fees,
          this.cpmmAuth,
          pool.id,
          pool.config,
          pool.vaultA,
          pool.vaultB,
          pool.mintA,
          pool.mintB,
          coinIsA ? coinAta : quoteTo,
          coinIsA ? quoteTo : coinAta,
          pool.programA,
          pool.programB,
        ),
      );
    }
    const sig = await this.send(tx, [this.keys.fees]).catch((e: Error) => {
      // the position hasn't earned a whole unit of both tokens yet: nothing came in, and the fees wait in the pool
      // (the creator fee with them: it is collected in the same transaction)
      if (TOO_LITTLE_TO_COLLECT.test(e.message)) return "";
      throw e;
    });
    if (!sig) return { quote: 0n, burned: 0n, sig: "" };
    kvSet(`harvest:${c.mint}`, sig);
    return this.settleHarvest(c, sig);
  }

  /** The account a coin's harvested fees land in until they're burned: the fee wallet's, at an address of its own. */
  private harvestAccount(c: CoinRow) {
    return this.seeded(this.keys.fees.publicKey, this.pk(c.mint), 0n, c.mint.slice(0, 32));
  }

  private async settleHarvest(c: CoinRow, sig: string) {
    let tx: VersionedTransactionResponse | null = null;
    for (let i = 0; i < 6 && !tx; i++) {
      if (i) await sleep(1000);
      tx = await this.conn.getTransaction(sig, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
    }
    if (!tx) throw new Error(`harvest ${sig} isn't readable yet`);
    const fees = this.keys.fees.publicKey;
    const keys = accountKeys(tx);
    const gained = (account: PublicKey) => {
      const at = (list?: TokenBalance[] | null) => BigInt(list?.find((b) => keys[b.accountIndex] === account.toBase58())?.uiTokenAmount.amount ?? 0);
      return at(tx.meta?.postTokenBalances) - at(tx.meta?.preTokenBalances);
    };
    const coinsTo = await this.harvestAccount(c);
    const quoteTo = this.ata(fees, c.quote, await this.tokenProgram(c.quote));
    const result = { quote: gained(quoteTo), burned: gained(coinsTo.account), sig };

    const follow = new Transaction();
    const left = await this.conn
      .getTokenAccountBalance(coinsTo.account, "confirmed")
      .then((b) => BigInt(b.value.amount))
      .catch(() => null);
    if (left !== null) {
      if (left > 0n) follow.add(createBurnCheckedInstruction(coinsTo.account, this.pk(c.mint), fees, left, c.decimals, [], TOKEN_PROGRAM_ID));
      follow.add(coinsTo.close);
    }
    // the quote arrived as wrapped SOL: closing its account turns it into the SOL the buckets are paid in
    if (c.quote === NATIVE_MINT && (await this.conn.getAccountInfo(quoteTo))) follow.add(createCloseAccountInstruction(quoteTo, fees, fees));
    if (follow.instructions.length) await this.send(follow, [this.keys.fees]);
    run("DELETE FROM kv WHERE k = ?", `harvest:${c.mint}`);
    return result;
  }

  /**
   * The Fee Key NFT of a coin's locked LP: among the NFTs the fee wallet holds, the one whose lock record (a PDA of
   * the NFT's mint) names the coin's pool. Raydium mints it to the platform's wallet when it migrates the curve.
   */
  private async findFeeKey(c: CoinRow) {
    const fees = this.keys.fees.publicKey;
    const known = new Set(all<{ fee_key: string }>("SELECT fee_key FROM coin WHERE fee_key IS NOT NULL").map((r) => r.fee_key));
    const held = await this.conn.getParsedTokenAccountsByOwner(fees, { programId: TOKEN_PROGRAM_ID });
    const nfts = held.value
      .map((a) => a.account.data.parsed.info as { mint: string; tokenAmount: { amount: string; decimals: number } })
      .filter((t) => t.tokenAmount.amount === "1" && t.tokenAmount.decimals === 0 && !known.has(t.mint));
    for (let i = 0; i < nfts.length; i += 100) {
      const batch = nfts.slice(i, i + 100);
      const locks = await this.conn.getMultipleAccountsInfo(batch.map((t) => getCpLockPda(this.lock, this.pk(t.mint)).publicKey));
      for (const [j, lock] of locks.entries()) {
        // LockedCpLiquidityState: the pool's address follows the discriminator, four u64s, a u128 and another u64
        if (!lock?.owner.equals(this.lock) || lock.data.length < 96) continue;
        const pool = new PublicKey(lock.data.subarray(64, 96)).toBase58();
        const coin = pool === c.cpmm_pool ? c : coinByPool(pool);
        if (coin?.cpmm_pool === pool) run("UPDATE coin SET fee_key = ? WHERE mint = ? AND fee_key IS NULL", batch[j]!.mint, coin.mint);
      }
    }
    const found = getCoin(c.mint)?.fee_key;
    if (!found) throw new Error(`the fee wallet holds no Fee Key for ${c.symbol}'s pool ${c.cpmm_pool}`);
    return found;
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
    const { tx } = await jupSwapTx(quote, this.keys.fees.publicKey);
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
    // a coin (a Fleet entry) or a quote
    const decimals = native ? 9 : (getCoin(mint)?.decimals ?? quoteDecimals(mint));
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

  /**
   * Walks new signatures of two kinds of address. The platform config is named by every LaunchLab instruction on
   * one of our coins (create, buy, sell, migrate), so that one address covers every curve. A CPMM swap names only
   * its pool, so each graduated coin's pool is followed on its own.
   */
  private async poll() {
    const addresses = [this.platform.toBase58(), ...all<{ cpmm_pool: string }>("SELECT cpmm_pool FROM coin WHERE cpmm_pool IS NOT NULL").map((r) => r.cpmm_pool)];
    for (const address of addresses) {
      // oldest first, moving the cursor past each one handled, so a transaction that can't be read is retried a few
      // times and then skipped instead of holding back everything after it
      for (const s of await this.newSignatures(address)) {
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

  /** An address's signatures since its cursor, oldest first; pages back until it reaches the cursor. */
  private async newSignatures(address: string) {
    const until = kvGet(`cursor:${address}`);
    const out: { signature: string; err: unknown }[] = [];
    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const sigs = await this.conn.getSignaturesForAddress(this.pk(address), { until, before, limit: 1000 }, "confirmed");
      out.push(...sigs);
      if (sigs.length < 1000) break;
      before = sigs[sigs.length - 1]!.signature;
    }
    return out.reverse();
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
    const feePayer = accountKeys(tx)[0]!;
    const events = decodeEvents(tx, config.cluster);
    // a copy's Fleet entry: a buy in its launch whose coins went to the fee wallet (pool → coins bought)
    const entries = new Map<string, bigint>();
    const toFeeWallet = (mint: string) => {
      const sum = (b?: TokenBalance[] | null) =>
        (b ?? []).filter((x) => x.owner === this.wallets.fees && x.mint === mint).reduce((s, x) => s + BigInt(x.uiTokenAmount.amount), 0n);
      return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
    };
    for (const ev of events) {
      if (ev.kind !== "launch" || ev.platform !== this.platform.toBase58()) continue;
      const entry = toFeeWallet(ev.mint);
      if (entry > 0n) entries.set(ev.pool, entry);
      await this.onLaunch(ev.pool, ev.mint, ev.quote, ev.creator, ts, entry);
    }
    let swapIndex = 0;
    for (const ev of events) {
      if (ev.kind === "launch") continue;
      const c = coinByPool(ev.pool);
      if (!c) continue;
      const qDec = quoteDecimals(c.quote);
      let f: SwapFacts | null;
      if (ev.kind === "curve") f = c.pool === ev.pool ? curveFacts(ev, qDec, quoteFee(c.quote)) : null;
      else f = cpmmFacts(ev, c.mint, c.quote, qDec, (await this.tier(await this.cpmmPool(ev.pool))).rates);
      if (!f) continue;
      const id = `${signature}:${swapIndex++}`;
      const trade = {
        coin: c.mint,
        isBuy: f.isBuy,
        quoteAmount: f.quoteAmount,
        tokenAmount: f.tokenAmount,
        tax: f.tax,
        protocol: f.protocol,
        claimable: f.claimable,
        harvestable: f.harvestable,
        price: f.price,
        curve: f.curve,
        pool: f.reserves,
        ts,
        tx: signature,
      };
      // a copy's launch buy carries its Fleet entry: that part is the fee wallet's, at its share of the quote
      const entryTokens = f.isBuy ? entries.get(f.pool) : undefined;
      if (entryTokens !== undefined && entryTokens <= f.tokenAmount) {
        entries.delete(f.pool);
        const paid = big(JSON.parse(kvGet(`launch:${c.mint}`) ?? "{}").entry);
        const quoteE = paid > 0n && paid <= f.quoteAmount ? paid : (f.quoteAmount * entryTokens) / f.tokenAmount;
        const part = (x: bigint) => (x * quoteE) / (f.quoteAmount || 1n);
        const e = { quoteAmount: quoteE, tokenAmount: entryTokens, tax: part(trade.tax), protocol: part(trade.protocol), claimable: part(trade.claimable) };
        recordTrade({ ...trade, ...e, id: `${id}:entry`, trader: this.wallets.fees, kind: "trade" });
        if (f.tokenAmount === entryTokens) continue;
        for (const k of ["quoteAmount", "tokenAmount", "tax", "protocol", "claimable"] as const) trade[k] -= e[k];
      }
      recordTrade({ ...trade, id, trader: feePayer, kind: "trade" });
    }
  }

  private async onLaunch(pool: string, mint: string, quote: string, creator: string, ts: number, entryTokens = 0n) {
    if (getCoin(mint) || !quoteRow(quote)) return;
    const info = await this.conn.getAccountInfo(this.pk(pool), "confirmed");
    if (!info) throw new Error(`pool ${pool} not found`);
    // the curve as the program stored it: what it sells and raises never changes after creation
    const p = LaunchpadPool.decode(info.data);
    // LaunchLab lets anyone create a pool under a platform's config with numbers of their own. Only coins shaped like
    // the ones launched here are listed: 1B plain SPL supply, nothing locked, the $2.5k → $25k curve's share sold on
    // the curve, bound for CPMM with its creator fee in the quote. (The size of the raise isn't checked: it depends
    // on the quote's price at launch, which isn't known here.) Bit 0 of the program flag is the coin's token program,
    // bit 1 the quote's: only the coin's has to be the classic one.
    const soldShare = Number(int(p.totalSellA)) / Number(int(p.supply));
    const ours =
      int(p.supply) === SUPPLY_RAW &&
      p.mintDecimalsA === COIN_DECIMALS &&
      (p.mintProgramFlag & 1) === 0 &&
      p.vestingSchedule.totalLockedAmount.isZero() &&
      p.migrateType === 1 &&
      p.cpmmCreatorFeeOn === CpmmCreatorFeeOn.OnlyTokenB &&
      Math.abs(soldShare - CURVE_SOLD_SHARE) < 1e-4;
    if (!ours) return log(`ignored ${mint}: created under the platform config with a different curve or token setup`);
    const saved = kvGet(`launch:${mint}`);
    const meta: Partial<LaunchRequest> & { uri?: string; entryFor?: string } = saved ? JSON.parse(saved) : await this.readMetadata(mint);
    recordLaunch({
      mint,
      pool,
      quote,
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
      curve: { supply: int(p.supply), sell: int(p.totalSellA), raise: int(p.totalFundRaisingB), virtualBase: int(p.virtualA), virtualQuote: int(p.virtualB) },
    });
    recordEntry(mint, entryTokens, big(meta.entry), meta.entryFor ?? null, !!saved, ts);
    log(`launch ${meta.symbol} ${mint}`);
  }

  /** Name, symbol and image from the Metaplex metadata account and its JSON, for pools created outside the UI. */
  private async readMetadata(mint: string): Promise<Partial<LaunchRequest> & { uri?: string }> {
    const info = await this.conn.getAccountInfo(getPdaMetadataKey(this.pk(mint)).publicKey);
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
      // the coin's own page is what metadata says when the launcher gave no site
      website: json.extensions?.website === coinPage(mint) ? "" : (json.extensions?.website ?? ""),
      twitter: json.extensions?.twitter ?? "",
      telegram: json.extensions?.telegram ?? "",
    };
  }

  /**
   * Finds the CPMM pool of coins whose curve sold out. Raydium's crank migrates a curve seconds after it completes
   * (only its wallet can); the pool it creates sits at an address derived from the platform's fee tier and the pair.
   */
  private async findGraduated() {
    const waiting = all<CoinRow>("SELECT * FROM coin WHERE graduated = 1 AND cpmm_pool IS NULL");
    if (!waiting.length) return;
    const platform = await this.platformInfo();
    if (!platform) return;
    for (const c of waiting) {
      const info = await this.conn.getAccountInfo(this.pk(c.pool), "confirmed");
      if (!info || LaunchpadPool.decode(info.data).status !== MIGRATED) continue;
      // CPMM keeps a pool's two mints in byte order
      const [a, b] = [this.pk(c.mint), this.pk(c.quote)].sort((x, y) => Buffer.compare(x.toBuffer(), y.toBuffer()));
      const pool = getCpmmPdaPoolId(this.cpmm, platform.cpConfigId, a!, b!).publicKey;
      if (!(await this.conn.getAccountInfo(pool))) {
        log(`${c.symbol} migrated, but its pool isn't at ${pool.toBase58()}: was the platform's CPMM tier changed since?`);
        continue;
      }
      run("UPDATE coin SET cpmm_pool = ? WHERE mint = ?", pool.toBase58(), c.mint);
      log(`${c.symbol} graduated to CPMM pool ${pool.toBase58()}`);
    }
  }

  /**
   * Wallet-to-wallet transfers don't go through a pool, so holder balances are reconciled against the chain:
   * coins that arrived without a trade carry zero cost basis (no fake high entries for Fleet entry shares).
   */
  private async reconcileHolders() {
    const since = Math.floor(Date.now() / 1000) - 86_400;
    for (const c of all<CoinRow>("SELECT * FROM coin WHERE last_trade_at >= ?", since)) {
      const accounts = await this.conn.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [{ dataSize: TOKEN_ACCOUNT_SIZE }, { memcmp: { offset: 0, bytes: c.mint } }],
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
