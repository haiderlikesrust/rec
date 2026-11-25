import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ENTRY_RENT_LAMPORTS,
  LAUNCH_RENT_SOL,
  NATIVE_MINT,
  feeBreakdown,
  type Balances,
  type LaunchRequest,
  type LaunchResponse,
  type SolToQuote,
  type SwapQuote,
  type SwapRequest,
  type SwapResponse,
  type SwapSide,
  type TxEnvelope,
  type Venue,
} from "@gantry/shared";
import { storeMetadata } from "../api";
import { launchParams } from "../chain/params";
import { recordEntry } from "../fleet";
import { config, type Role } from "../config";
import { all, big, one, run, tx, type CoinRow, type OtcQuoteRow } from "../db";
import { UserError, type Engine } from "../engine";
import { SUPPLY_RAW, cpmmBuy, cpmmFees, cpmmRates, cpmmSell, curveBuy, curveRates, curveReserves, curveSell, priceOf, type CurveState, type Reserves, afterTransferFee, beforeTransferFee } from "../curve";
import { SYSTEM, getCoin, quoteDecimals, recordLaunch, recordTrade } from "../ledger";
import { quoteRow, solPerUnit, toUnits, quoteFee } from "../prices";
import { now } from "../services";

const SOL = "SOL";
const LAMPORTS = 1_000_000_000n;
/** New demo wallets start with this much of SOL and of every quote asset they touch. */
const FAUCET_USD = 10_000;

export const fakeSig = () => bs58.encode(randomBytes(64));
export const fakeKey = () => Keypair.generate().publicKey.toBase58();

type Fill = {
  side: SwapSide;
  venue: Venue;
  /** what leaves the wallet: quote, fees included, on a buy (less than was offered when it completes the curve); coins on a sell */
  amountIn: bigint;
  /** what reaches the wallet */
  amountOut: bigint;
  /** the quote side of the swap as the trader saw it, before the launchpad's fee came off */
  gross: bigint;
  /** what the quote's own transfer fee kept back (zero on most pairs) */
  transferFee: bigint;
  tax: bigint;
  protocol: bigint;
  claimable: bigint;
  harvestable: bigint;
  price: number;
  impact: number;
  curve?: { sold: bigint; raised: bigint; complete: boolean };
  pool?: Reserves;
};

/** Everything a real deployment does on Solana, simulated in the database. */
export class DemoEngine implements Engine {
  readonly demo = true;
  readonly wallets: Record<Role, string>;
  /** While seeding history, the simulated clock. */
  simNow: number | null = null;
  private at = () => this.simNow ?? now();

  constructor(keys: Record<Role, Keypair>) {
    this.wallets = Object.fromEntries(Object.entries(keys).map(([r, k]) => [r, k.publicKey.toBase58()])) as Record<Role, string>;
  }

  async start() {}

  jobs() {
    return [];
  }

  // ---------------------------------------------------------------- balances

  private key = (mint: string) => (mint === NATIVE_MINT ? SOL : mint);

  bal(wallet: string, mint: string): bigint {
    const k = this.key(mint);
    const row = one<{ amount: string }>("SELECT amount FROM balance WHERE wallet = ? AND mint = ?", wallet, k);
    if (row) return big(row.amount);
    // first touch of a quote asset by a user wallet: hand out demo funds
    const q = k === SOL ? quoteRow(NATIVE_MINT) : quoteRow(k);
    if (!q || q.usd <= 0 || SYSTEM.has(wallet)) return 0n;
    const amount = BigInt(Math.floor((FAUCET_USD / q.usd) * 10 ** q.decimals));
    this.setBal(wallet, mint, amount);
    return amount;
  }

  private setBal(wallet: string, mint: string, amount: bigint) {
    run(
      "INSERT INTO balance (wallet, mint, amount) VALUES (?, ?, ?) ON CONFLICT(wallet, mint) DO UPDATE SET amount = excluded.amount",
      wallet,
      this.key(mint),
      amount.toString(),
    );
  }

  add(wallet: string, mint: string, delta: bigint, what = "balance") {
    const cur = this.bal(wallet, mint);
    if (cur + delta < 0n) throw new UserError(`Not enough ${what}.`);
    this.setBal(wallet, mint, cur + delta);
  }

  async solBalance(owner: string) {
    return Number(this.bal(owner, NATIVE_MINT)) / 1e9;
  }

  async balances(owner: string): Promise<Balances> {
    this.bal(owner, NATIVE_MINT);
    const rows = all<{ mint: string; amount: string }>("SELECT mint, amount FROM balance WHERE wallet = ?", owner);
    const tokens: Record<string, string> = {};
    for (const r of rows) if (r.mint !== SOL) tokens[r.mint] = r.amount;
    // quote assets show their faucet balance even before first use
    for (const q of all<{ mint: string }>("SELECT mint FROM quote WHERE mint != ? AND available = 1 AND usd > 0", NATIVE_MINT))
      tokens[q.mint] ??= this.bal(owner, q.mint).toString();
    return { sol: this.bal(owner, NATIVE_MINT).toString(), tokens };
  }

  // ---------------------------------------------------------------- the two pools

  private curve(c: CoinRow): CurveState {
    return { virtualBase: big(c.virtual_base), virtualQuote: big(c.virtual_quote), sold: big(c.base_sold), raised: big(c.quote_reserve), sell: big(c.curve_sell) };
  }

  /**
   * What a swap does: on the coin's curve until it has sold out, in its CPMM pool after. `amount` is what the trader
   * sends. On a quote with a transfer fee the pool trades on what arrives of a buyer's quote, and a seller keeps
   * what's left of the pool's payout, as on the chain.
   */
  fill(c: CoinRow, side: SwapSide, amount: bigint): Fill {
    const qDec = quoteDecimals(c.quote);
    const impact = (after: number) => (c.price > 0 ? Math.abs(after - c.price) / c.price : 0);
    const tf = quoteFee(c.quote);
    const landed = side === "buy" ? afterTransferFee(amount, tf) : amount;
    if (c.graduated === 1) {
      const rates = cpmmRates(config.cluster);
      const f = side === "buy" ? cpmmBuy({ base: big(c.pool_base), quote: big(c.pool_quote) }, landed, rates) : cpmmSell({ base: big(c.pool_base), quote: big(c.pool_quote) }, amount, rates);
      // a sale's trade fee is charged in the coin: it is valued in the quote at this fill's price
      const tradeFee = side === "buy" ? f.tradeFee : (f.tradeFee * f.quoteGross) / (amount || 1n);
      const price = priceOf(f.pool, qDec);
      const out = side === "buy" ? f.amountOut : afterTransferFee(f.amountOut, tf);
      const kept = side === "buy" ? amount - landed : f.amountOut - out;
      return {
        side,
        venue: "cpmm",
        amountIn: amount,
        amountOut: out,
        gross: side === "buy" ? f.quoteGross + kept : f.quoteGross - kept,
        transferFee: kept,
        ...cpmmFees(tradeFee, f.creatorFee, rates),
        claimable: 0n,
        price,
        impact: impact(price),
        pool: f.pool,
      };
    }
    const s = this.curve(c);
    if (side === "sell" && amount > s.sold) throw new UserError("That's more than the curve has sold.");
    const f = side === "buy" ? curveBuy(s, landed, curveRates) : curveSell(s, amount, curveRates);
    const price = priceOf(curveReserves({ ...s, sold: f.sold, raised: f.raised }), qDec);
    // a buy that completes the curve takes only what the last coins cost, and the transfer fee to get it there
    const sent = side === "buy" ? (f.amountIn < landed ? beforeTransferFee(f.amountIn, tf) : amount) : amount;
    const out = side === "buy" ? f.amountOut : afterTransferFee(f.amountOut, tf);
    const kept = side === "buy" ? sent - f.amountIn : f.amountOut - out;
    return {
      side,
      venue: "curve",
      amountIn: sent,
      amountOut: out,
      gross: side === "buy" ? sent : out + f.fee,
      transferFee: kept,
      tax: f.fee,
      protocol: f.protocolFee,
      // the platform fee reaches the platform's vault less the quote's transfer fee
      claimable: afterTransferFee(f.platformFee, tf),
      harvestable: 0n,
      price,
      impact: impact(price),
      curve: { sold: f.sold, raised: f.raised, complete: f.complete },
    };
  }

  /** Executes a swap for `trader` and books it like the indexer would. */
  trade(c: CoinRow, trader: string, side: SwapSide, amount: bigint, at: number) {
    return tx(() => {
      const f = this.fill(c, side, amount);
      if (f.amountOut <= 0n) throw new UserError("Amount too small.");
      if (side === "buy") {
        this.add(trader, c.quote, -f.amountIn, quoteRow(c.quote)?.symbol ?? "quote");
        this.add(trader, c.mint, f.amountOut);
      } else {
        this.add(trader, c.mint, -f.amountIn, c.symbol);
        this.add(trader, c.quote, f.amountOut);
      }
      const sig = fakeSig();
      recordTrade({
        id: `${sig}:0`,
        coin: c.mint,
        trader,
        isBuy: side === "buy",
        quoteAmount: f.gross,
        tokenAmount: side === "buy" ? f.amountOut : f.amountIn,
        tax: f.tax,
        protocol: f.protocol,
        claimable: f.claimable,
        harvestable: f.harvestable,
        price: f.price,
        curve: f.curve,
        pool: f.pool,
        ts: at,
        tx: sig,
        kind: "trade",
      });
      if (f.curve?.complete) this.migrate(getCoin(c.mint)!);
      return { fill: f, sig };
    });
  }

  /**
   * What Raydium's crank does seconds after a curve sells out: the coins the curve didn't sell and all it raised open
   * a CPMM pool at the price the curve ended on, with its LP locked for the fee wallet.
   */
  private migrate(c: CoinRow) {
    if (c.cpmm_pool) return;
    run(
      "UPDATE coin SET cpmm_pool = ?, fee_key = ?, pool_base = ?, pool_quote = ? WHERE mint = ?",
      fakeKey(),
      fakeKey(),
      (SUPPLY_RAW - big(c.curve_sell)).toString(),
      c.quote_reserve,
      c.mint,
    );
  }

  private toQuote(f: Fill, slippageBps: number): SwapQuote {
    return {
      side: f.side,
      amountIn: f.amountIn.toString(),
      amountOut: f.amountOut.toString(),
      minOut: ((f.amountOut * BigInt(10_000 - slippageBps)) / 10_000n).toString(),
      fee: f.tax.toString(),
      transferFee: f.transferFee.toString(),
      feeBps: f.gross > 0n ? Number((f.tax * 10_000n) / f.gross) : 0,
      priceImpact: f.impact,
      venue: "demo",
    };
  }

  async swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number): Promise<SwapQuote> {
    return this.toQuote(this.fill(c, side, amount), slippageBps);
  }

  async swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse> {
    const { fill, sig } = this.trade(c, req.wallet, req.side, big(req.amount), this.at());
    return { tx: null, demo: true, signature: sig, quote: this.toQuote(fill, req.slippageBps) };
  }

  /** Creates a coin and its curve like LaunchLab's initialize would, plus the creator's bundled first buy. */
  createCoin(req: LaunchRequest, uriBase: string, at: number, entry?: { raw: bigint; to: string }) {
    const q = quoteRow(req.quote);
    if (!q || !q.available) throw new UserError("That quote asset isn't available.");
    // priced at the quote's live USD, and held to LaunchLab's floor on the raise like a real launch
    const curve = launchParams(q, { minRaise: big(q.min_raise), minSellRate: 0n, minMigrateRate: 0n, minSupply: 0n, migrateFee: 0n });
    const mint = fakeKey();
    const pool = fakeKey();
    return tx(() => {
      // LaunchLab charges nothing to create a pool: the launcher pays rent for the coin's accounts
      this.add(req.wallet, NATIVE_MINT, -lamportsOf(LAUNCH_RENT_SOL), "SOL for the coin's accounts");
      storeMetadata(mint, req);
      recordLaunch({
        mint,
        pool,
        quote: req.quote,
        name: req.name,
        symbol: req.symbol,
        image: req.image,
        description: req.description,
        website: req.website,
        twitter: req.twitter,
        telegram: req.telegram,
        uri: `${uriBase}${mint}.json`,
        creator: req.wallet,
        createdAt: at,
        curve,
      });
      if (entry) {
        // a copy's Fleet entry: the first buy, for the fee wallet, plus rent for the accounts it's sent to
        this.add(req.wallet, req.quote, -entry.raw, q.symbol);
        this.add(this.wallets.fees, req.quote, entry.raw);
        this.add(req.wallet, NATIVE_MINT, -BigInt(ENTRY_RENT_LAMPORTS), "SOL for the Fleet entry");
        this.add(this.wallets.fees, NATIVE_MINT, BigInt(ENTRY_RENT_LAMPORTS));
        const { fill } = this.trade(getCoin(mint)!, this.wallets.fees, "buy", entry.raw, at);
        recordEntry(mint, fill.amountOut, entry.raw, entry.to, true, at);
      }
      const initial = big(req.initialBuy);
      if (initial > 0n) this.trade(getCoin(mint)!, req.wallet, "buy", initial, at);
      return { mint, pool };
    });
  }

  async launch(req: LaunchRequest, uriBase: string, entry?: { raw: bigint; to: string }): Promise<LaunchResponse> {
    const { mint, pool } = this.createCoin(req, uriBase, this.at(), entry);
    return { tx: null, demo: true, signature: fakeSig(), mint, pool };
  }

  async checkQuote() {}

  // swaps at the live USD prices, with no fee or slippage but the quote's own transfer fee
  async solToQuote(wallet: string, quote: string, lamports: bigint): Promise<SolToQuote> {
    const q = quoteRow(quote);
    if (!q || q.usd <= 0) throw new UserError("No live price for that token yet.");
    const out = afterTransferFee(BigInt(Math.floor((toUnits(lamports, 9) / solPerUnit(quote)) * 10 ** q.decimals)), quoteFee(quote));
    tx(() => {
      this.add(wallet, NATIVE_MINT, -lamports, "SOL");
      this.add(wallet, quote, out);
    });
    const amount = out.toString();
    return { tx: null, demo: true, signature: fakeSig(), quote, lamports: lamports.toString(), outAmount: amount, minOut: amount };
  }

  // ---------------------------------------------------------------- OTC settles instantly

  async otcTx(q: OtcQuoteRow, c: CoinRow): Promise<TxEnvelope> {
    if (q.side !== "sell") throw new UserError("The OTC reserve only buys coins.");
    tx(() => {
      const tax = big(q.tax);
      // the coins leave the seller and are burned in the same step; the reserve never holds them
      this.add(q.wallet, c.mint, -big(q.amount_in), c.symbol);
      this.add(this.wallets.otc, NATIVE_MINT, -(big(q.amount_out) + tax), "SOL in the reserve");
      this.add(q.wallet, NATIVE_MINT, big(q.amount_out));
      this.add(this.wallets.fees, NATIVE_MINT, tax);
    });
    return { tx: null, demo: true, signature: fakeSig() };
  }

  async verify() {
    return "ok" as const;
  }

  async ingest() {}

  // ---------------------------------------------------------------- treasury

  async claimFees(c: CoinRow) {
    // out of the platform's vault, less the quote's transfer fee
    const amount = afterTransferFee(big(c.claimable_quote), quoteFee(c.quote));
    if (amount > 0n) this.add(this.wallets.fees, c.quote, amount);
    return amount;
  }

  /**
   * Pays out what the pool's swaps set aside for the fee wallet. The LP fees leave the pool as LP tokens would: equal
   * value from both sides, so the price doesn't move. Their quote and the creator fee go to the fee wallet; their
   * coins are burned.
   */
  async harvestFees(c: CoinRow) {
    const quote = big(c.harvest_quote);
    if (!c.cpmm_pool || quote <= 0n) return { quote: 0n, burned: 0n, sig: "" };
    const share = feeBreakdown("cpmm", config.cluster);
    const lpQuote = (quote * BigInt(Math.round(share.burnedBps * 1000))) / BigInt(Math.round(share.bucketsBps * 1000));
    const burned = (lpQuote * big(c.pool_base)) / big(c.pool_quote);
    // what the pool pays out reaches the fee wallet less the quote's transfer fee
    const got = afterTransferFee(quote, quoteFee(c.quote));
    tx(() => {
      run("UPDATE coin SET pool_base = ?, pool_quote = ? WHERE mint = ?", (big(c.pool_base) - burned).toString(), (big(c.pool_quote) - lpQuote).toString(), c.mint);
      this.add(this.wallets.fees, c.quote, got);
    });
    return { quote: got, burned, sig: fakeSig() };
  }

  async burnHeld(from: Role, c: CoinRow, amount: bigint) {
    const held = this.bal(this.wallets[from], c.mint);
    const burned = held < amount ? held : amount;
    if (burned <= 0n) return { burned: 0n, sig: "" };
    this.add(this.wallets[from], c.mint, -burned);
    return { burned, sig: fakeSig() };
  }

  async convert(fromMint: string, toMint: string, raw: bigint) {
    if (fromMint === toMint || raw === 0n) return { out: raw, sig: "" };
    const from = quoteRow(fromMint)!;
    const to = quoteRow(toMint)!;
    // aggregator route at a 0.3% all-in cost, on what arrives of a token with a transfer fee
    const value = toUnits(afterTransferFee(raw, quoteFee(fromMint)), from.decimals) * solPerUnit(fromMint) * 0.997;
    const out = BigInt(Math.floor((value / solPerUnit(toMint)) * 10 ** to.decimals));
    this.add(this.wallets.fees, fromMint, -raw, `${from.symbol} in the fee wallet`);
    this.add(this.wallets.fees, toMint, out);
    return { out, sig: fakeSig() };
  }

  async sendSol(from: Role, to: string, lamports: bigint) {
    this.add(this.wallets[from], NATIVE_MINT, -lamports, `SOL in the ${from} wallet`);
    this.add(to, NATIVE_MINT, lamports);
    return fakeSig();
  }

  async sendTokens(from: Role, mint: string, items: { to: string; amount: bigint }[]) {
    const sig = fakeSig();
    tx(() => {
      for (const i of items) {
        this.add(this.wallets[from], mint, -i.amount, `tokens in the ${from} wallet`);
        this.add(i.to, mint, i.amount);
      }
    });
    return items.map((i) => ({ to: i.to, sig }));
  }
}

export const lamportsOf = (sol: number) => (BigInt(Math.round(sol * 1e6)) * LAMPORTS) / 1_000_000n;
