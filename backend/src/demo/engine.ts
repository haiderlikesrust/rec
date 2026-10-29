import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  GRADUATION_MCAP_USD,
  LAUNCH_FEE_SOL,
  METEORA_PROTOCOL_SHARE_BPS,
  METEORA_REFERRAL_SHARE_BPS,
  NATIVE_MINT,
  START_MCAP_USD,
  TAX_BPS,
  buyTaxBpsAt,
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
import type { Role } from "../config";
import { all, big, kvGet, kvSet, one, run, tx, type ClaimRow, type CoinRow, type OtcQuoteRow } from "../db";
import { UserError, type Engine } from "../engine";
import { COIN_DECIMALS, SUPPLY_RAW, buy, curveFor, quoteReserve, sell, type CurveState } from "../curve";
import { SYSTEM, getCoin, quoteDecimals, recordLaunch, recordTrade } from "../ledger";
import { activeConfig, quoteRow, solPerUnit, toUnits } from "../prices";
import { now } from "../services";

const SOL = "SOL";
const LAMPORTS = 1_000_000_000n;
/** New demo wallets start with this much of SOL and of every quote asset they touch. */
const FAUCET_USD = 10_000;

export const fakeSig = () => bs58.encode(randomBytes(64));
export const fakeKey = () => Keypair.generate().publicKey.toBase58();

type Fill = {
  side: SwapSide;
  amountIn: bigint;
  amountOut: bigint;
  /** quote actually consumed by a buy (less than amountIn when it hits graduation) */
  used: bigint;
  gross: bigint;
  tax: bigint;
  meteora: bigint;
  referral: bigint;
  claimable: bigint;
  feeBps: number;
  next: number;
  impact: number;
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

  // ---------------------------------------------------------------- the curve

  private state(c: CoinRow): CurveState {
    return { sqrtPrice: c.sqrt_price, liquidity: c.liquidity, sqrtStart: c.sqrt_start, sqrtMig: c.sqrt_mig };
  }

  fill(c: CoinRow, side: SwapSide, amount: bigint, at: number, opts: { referral: boolean; firstBuy?: boolean }): Fill {
    const qDec = quoteDecimals(c.quote);
    const feeBps = opts.firstBuy ? TAX_BPS : buyTaxBpsAt(at - c.created_at);
    const s = this.state(c);
    const capped = c.graduated !== 1;
    const p0 = s.sqrtPrice * s.sqrtPrice;
    let gross: bigint, tax: bigint, out: bigint, used: bigint, next: number;
    if (side === "buy") {
      tax = (amount * BigInt(feeBps)) / 10_000n;
      const r = buy(s, toUnits(amount - tax, qDec), capped);
      used = BigInt(Math.floor(r.used * 10 ** qDec));
      // at graduation the unused input is refunded, and so is its share of the fee
      if (used < amount - tax) tax = (used * BigInt(feeBps)) / BigInt(10_000 - feeBps);
      gross = used + tax;
      out = BigInt(Math.floor(r.out * 10 ** COIN_DECIMALS));
      next = r.next;
    } else {
      const r = sell(s, toUnits(amount, COIN_DECIMALS));
      gross = BigInt(Math.floor(r.out * 10 ** qDec));
      tax = (gross * BigInt(feeBps)) / 10_000n;
      out = gross - tax;
      used = amount;
      next = r.next;
    }
    const protocol = (tax * BigInt(METEORA_PROTOCOL_SHARE_BPS)) / 10_000n;
    const referral = opts.referral ? (protocol * BigInt(METEORA_REFERRAL_SHARE_BPS)) / 10_000n : 0n;
    return {
      side,
      amountIn: amount,
      amountOut: out,
      used,
      gross,
      tax,
      meteora: protocol - referral,
      referral,
      claimable: tax - protocol,
      feeBps,
      next,
      impact: Math.abs(next * next - p0) / p0,
    };
  }

  /** Executes a swap for `trader` and books it like the indexer would. */
  trade(c: CoinRow, trader: string, side: SwapSide, amount: bigint, at: number, kind: "trade" | "buyback" = "trade", firstBuy = false) {
    return tx(() => {
      const f = this.fill(c, side, amount, at, { referral: kind === "trade", firstBuy });
      if (f.amountOut <= 0n) throw new UserError("Amount too small.");
      const qDec = quoteDecimals(c.quote);
      if (side === "buy") {
        this.add(trader, c.quote, -f.gross, quoteRow(c.quote)?.symbol ?? "quote");
        this.add(trader, c.mint, f.amountOut);
      } else {
        this.add(trader, c.mint, -f.amountIn, c.symbol);
        this.add(trader, c.quote, f.amountOut);
      }
      if (f.referral > 0n) this.add(this.wallets.fees, c.quote, f.referral);
      const s = { ...this.state(c), sqrtPrice: f.next };
      const reserve = BigInt(Math.floor(quoteReserve(s) * 10 ** qDec));
      const sig = fakeSig();
      recordTrade({
        id: `${sig}:0`,
        coin: c.mint,
        trader,
        isBuy: side === "buy",
        quoteAmount: f.gross,
        tokenAmount: side === "buy" ? f.amountOut : f.amountIn,
        tax: f.tax,
        meteora: f.meteora,
        claimable: f.claimable,
        referral: f.referral,
        sqrtPrice: f.next,
        quoteReserve: c.graduated === 1 ? undefined : reserve,
        ts: at,
        tx: sig,
        kind,
      });
      const after = getCoin(c.mint)!;
      if (after.graduated === 1 && !after.damm_pool) run("UPDATE coin SET damm_pool = ? WHERE mint = ?", fakeKey(), c.mint);
      return { fill: f, sig };
    });
  }

  private toQuote(c: CoinRow, f: Fill, slippageBps: number): SwapQuote {
    return {
      side: f.side,
      amountIn: (f.side === "buy" ? f.gross : f.amountIn).toString(),
      amountOut: f.amountOut.toString(),
      minOut: ((f.amountOut * BigInt(10_000 - slippageBps)) / 10_000n).toString(),
      fee: f.tax.toString(),
      feeBps: f.feeBps,
      priceImpact: f.impact,
      venue: "demo",
    };
  }

  async swapQuote(c: CoinRow, side: SwapSide, amount: bigint, slippageBps: number): Promise<SwapQuote> {
    return this.toQuote(c, this.fill(c, side, amount, this.at(), { referral: true }), slippageBps);
  }

  async swap(c: CoinRow, req: SwapRequest): Promise<SwapResponse> {
    const { fill, sig } = this.trade(c, req.wallet, req.side, big(req.amount), this.at());
    return { tx: null, demo: true, signature: sig, quote: this.toQuote(c, fill, req.slippageBps) };
  }

  /** The config new demo coins on a quote launch from, re-priced like the real one when the quote's USD moves. */
  configFor(quoteMint: string) {
    const q = quoteRow(quoteMint)!;
    const cfg = activeConfig(quoteMint);
    if (cfg && Math.abs(q.usd - cfg.quote_usd) / cfg.quote_usd < 0.15) return cfg;
    const curve = curveFor(START_MCAP_USD / q.usd, GRADUATION_MCAP_USD / q.usd);
    const address = fakeKey();
    run("UPDATE config SET active = 0 WHERE quote = ?", quoteMint);
    run(
      "INSERT INTO config (address, quote, quote_usd, threshold, created_at) VALUES (?, ?, ?, ?, ?)",
      address,
      quoteMint,
      q.usd,
      BigInt(Math.floor(curve.threshold * 10 ** q.decimals)).toString(),
      this.at(),
    );
    return activeConfig(quoteMint)!;
  }

  /** Creates a coin like initialize_virtual_pool would, plus the creator's bundled first buy. */
  createCoin(req: LaunchRequest, uriBase: string, at: number, isMain = false) {
    const q = quoteRow(req.quote);
    if (!q) throw new UserError("Unknown quote asset.");
    const cfg = this.configFor(req.quote);
    const curve = curveFor(START_MCAP_USD / cfg.quote_usd, GRADUATION_MCAP_USD / cfg.quote_usd);
    const mint = fakeKey();
    const pool = fakeKey();
    return tx(() => {
      // launch fee: Meteora keeps 10%, the rest funds the platform buyback
      const fee = BigInt(Math.round(LAUNCH_FEE_SOL * 1e9));
      this.add(req.wallet, NATIVE_MINT, -fee, "SOL for the launch fee");
      kvSet("main_pending_lamports", big(kvGet("main_pending_lamports")) + (fee * 9n) / 10n);
      this.add(this.wallets.fees, NATIVE_MINT, (fee * 9n) / 10n);
      storeMetadata(mint, req);
      recordLaunch({
        mint,
        pool,
        config: cfg.address,
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
        isMain,
        sqrtStart: curve.sqrtStart,
        sqrtMig: curve.sqrtMig,
        liquidity: curve.liquidity,
        threshold: big(cfg.threshold),
        totalSupply: SUPPLY_RAW,
      });
      const initial = big(req.initialBuy);
      if (initial > 0n) this.trade(getCoin(mint)!, req.wallet, "buy", initial, at, "trade", true);
      return { mint, pool };
    });
  }

  async launch(req: LaunchRequest, uriBase: string): Promise<LaunchResponse> {
    const { mint, pool } = this.createCoin(req, uriBase, this.at());
    return { tx: null, demo: true, signature: fakeSig(), mint, pool };
  }

  // ---------------------------------------------------------------- OTC and claims settle instantly

  async otcTx(q: OtcQuoteRow, c: CoinRow): Promise<TxEnvelope> {
    tx(() => {
      const tax = big(q.tax);
      if (q.side === "sell") {
        this.add(q.wallet, c.mint, -big(q.amount_in), c.symbol);
        this.add(this.wallets.otc, c.mint, big(q.amount_in));
        this.add(this.wallets.otc, NATIVE_MINT, -(big(q.amount_out) + tax), "SOL in the reserve");
        this.add(q.wallet, NATIVE_MINT, big(q.amount_out));
      } else {
        this.add(q.wallet, NATIVE_MINT, -big(q.amount_in), "SOL");
        this.add(this.wallets.otc, NATIVE_MINT, big(q.amount_in) - tax);
        this.add(this.wallets.otc, c.mint, -big(q.amount_out), "inventory");
        this.add(q.wallet, c.mint, big(q.amount_out));
      }
      this.add(this.wallets.fees, NATIVE_MINT, tax);
    });
    return { tx: null, demo: true, signature: fakeSig() };
  }

  async claimTx(claim: ClaimRow): Promise<TxEnvelope> {
    tx(() => {
      this.add(this.wallets.protection, NATIVE_MINT, -big(claim.amount), "SOL in the protection wallet");
      this.add(claim.wallet, NATIVE_MINT, big(claim.amount));
    });
    return { tx: null, demo: true, signature: fakeSig() };
  }

  async verify() {
    return "ok" as const;
  }

  async ingest() {}

  // ---------------------------------------------------------------- treasury

  async claimFees(c: CoinRow) {
    const amount = big(c.claimable_quote);
    if (amount > 0n) this.add(this.wallets.fees, c.quote, amount);
    return amount;
  }

  async buybackAndBurn(c: CoinRow, quoteRaw: bigint) {
    const { fill, sig } = this.trade(c, this.wallets.fees, "buy", quoteRaw, this.at(), "buyback");
    this.add(this.wallets.fees, c.mint, -fill.amountOut);
    return { burned: fill.amountOut, sig };
  }

  async convert(fromMint: string, toMint: string, raw: bigint) {
    if (fromMint === toMint || raw === 0n) return { out: raw, sig: "" };
    const from = quoteRow(fromMint)!;
    const to = quoteRow(toMint)!;
    // aggregator route at a 0.3% all-in cost
    const value = toUnits(raw, from.decimals) * solPerUnit(fromMint) * 0.997;
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
