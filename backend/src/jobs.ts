import {
  AIRDROP_EPOCH_SECONDS,
  NATIVE_MINT,
  PROTECTION_CLAIM_WINDOW_SECONDS,
  otcPolicy,
  planProtectionEpoch,
  splitRaw,
} from "@cook/shared";
import { config, log } from "./config";
import { all, big, kvGet, kvSet, one, run, tx, type ClaimRow, type CoinRow, type OtcQuoteRow } from "./db";
import type { Engine } from "./engine";
import { getCoin, ledger, quoteDecimals, recordAirdrop, recordBurn, recordTrade } from "./ledger";
import { solPerUnit, solUsd, toUnits } from "./prices";
import { epochBudgetSol, holdersOf, lastEpochTo, lossesSince, now, treasury } from "./services";

const LAMPORTS = 1_000_000_000;
const lamports = (sol: number) => BigInt(Math.floor(sol * LAMPORTS));

// ---------------------------------------------------------------- fee router
//
// Per coin: claim the pool's accrued fees into the fee wallet, then split what Recur received (partner fee +
// referral rebate, plus any OTC tax paid in SOL) 10/10/30/40/10:
//   coin buyback  → buy the coin in its own pool and burn it
//   airdrop       → quote asset to the airdrop wallet (paid out hourly)
//   OTC reserve   → converted to SOL, sent to the OTC wallet (the coin earns 2× credit)
//   protection    → converted to SOL, sent to the protection wallet
//   platform burn → converted to SOL, held for the next $RECR buy-and-burn

export async function processFees(engine: Engine, at = now()) {
  let processed = 0;
  for (const c0 of all<CoinRow>("SELECT * FROM coin WHERE income_quote != split_quote OR claimable_quote != '0' OR pending_sol > 0")) {
    try {
      if (await processCoin(engine, c0, at)) processed++;
    } catch (e) {
      log(`fees ${c0.symbol}: ${(e as Error).message}`);
    }
  }
  if (processed) log(`fees: split ${processed} coin(s)`);
  await buybackMain(engine);
  return processed;
}

async function processCoin(engine: Engine, c0: CoinRow, at: number) {
  const q = one<{ usd: number; decimals: number }>("SELECT usd, decimals FROM quote WHERE mint = ?", c0.quote)!;
  if (big(c0.claimable_quote) > 0n) {
    const got = await engine.claimFees(c0);
    run("UPDATE coin SET claimable_quote = '0' WHERE mint = ?", c0.mint);
    if (got > 0n) ledger({ coin: c0.mint, kind: "claim", mint: c0.quote, amount: got });
  }
  const c = getCoin(c0.mint)!;
  const quoteIn = big(c.income_quote) - big(c.split_quote);
  const solIn = lamports(c.pending_sol);
  const usd = toUnits(quoteIn > 0n ? quoteIn : 0n, q.decimals) * q.usd + c.pending_sol * solUsd();
  if (usd < config.feeMinUsd) return false;

  const a = splitRaw(quoteIn > 0n ? quoteIn : 0n);
  const b = splitRaw(solIn);
  // book the batch first so a crash mid-way never splits the same fees twice
  run("UPDATE coin SET split_quote = income_quote, pending_sol = 0 WHERE mint = ?", c.mint);

  const toQuote = async (lam: bigint) => (lam > 0n ? (await engine.convert(NATIVE_MINT, c.quote, lam)).out : 0n);
  const toSol = async (raw: bigint) => (raw > 0n ? (await engine.convert(c.quote, NATIVE_MINT, raw)).out : 0n);

  // 1. coin buyback & burn
  const buyQuote = a.coinBuyback + (await toQuote(b.coinBuyback));
  if (buyQuote > 0n) {
    const { burned, sig } = await engine.buybackAndBurn(getCoin(c.mint)!, buyQuote);
    recordBurn(c.mint, burned, toUnits(buyQuote, q.decimals) * solPerUnit(c.quote), "coin");
    ledger({ coin: c.mint, kind: "coin-burn", mint: c.mint, amount: burned, tx: sig });
  }

  // 2. airdrop bucket
  const dropQuote = a.airdrop + (await toQuote(b.airdrop));
  if (dropQuote > 0n) {
    const [r] = await engine.sendTokens("fees", c.quote, [{ to: engine.wallets.airdrop, amount: dropQuote }]);
    const row = getCoin(c.mint)!;
    run(
      "UPDATE coin SET airdrop_quote = ?, airdrop_balance = ? WHERE mint = ?",
      (big(row.airdrop_quote) + dropQuote).toString(),
      (big(row.airdrop_balance) + dropQuote).toString(),
      c.mint,
    );
    ledger({ coin: c.mint, kind: "to-airdrop", mint: c.quote, amount: dropQuote, tx: r?.sig });
  }

  // 3. SOL buckets
  const solTotal = (await toSol(a.otcReserve + a.protection + a.mainBuyback)) + b.otcReserve + b.protection + b.mainBuyback;
  if (solTotal > 0n) {
    const otc = (solTotal * 3000n) / 8000n;
    const main = (solTotal * 1000n) / 8000n;
    const protection = solTotal - otc - main;
    const otcSig = await engine.sendSol("fees", engine.wallets.otc, otc);
    const protSig = await engine.sendSol("fees", engine.wallets.protection, protection);
    const otcSol = Number(otc) / LAMPORTS;
    run(
      `UPDATE coin SET sol_to_otc = sol_to_otc + ?, otc_credit = otc_credit + ?, otc_last_contribution = ?,
         sol_to_protection = sol_to_protection + ?, sol_to_main = sol_to_main + ? WHERE mint = ?`,
      otcSol,
      (otcSol * otcPolicy.creditMultiplierBps) / 10_000,
      at,
      Number(protection) / LAMPORTS,
      Number(main) / LAMPORTS,
      c.mint,
    );
    kvSet("main_pending_lamports", big(kvGet("main_pending_lamports")) + main);
    ledger({ coin: c.mint, kind: "to-otc", mint: NATIVE_MINT, amount: otc, sol: otcSol, tx: otcSig });
    ledger({ coin: c.mint, kind: "to-protection", mint: NATIVE_MINT, amount: protection, sol: Number(protection) / LAMPORTS, tx: protSig });
    treasury.otcSol += otcSol;
    treasury.protectionSol += Number(protection) / LAMPORTS;
  }
  return true;
}

/** Spends the platform-burn SOL on $RECR and burns it. */
export async function buybackMain(engine: Engine) {
  const main = one<CoinRow>("SELECT * FROM coin WHERE is_main = 1");
  const pending = big(kvGet("main_pending_lamports"));
  if (!main || pending === 0n || Number(pending) / LAMPORTS < config.mainBuybackMinSol) return;
  kvSet("main_pending_lamports", 0);
  try {
    const quoteIn = main.quote === NATIVE_MINT ? pending : (await engine.convert(NATIVE_MINT, main.quote, pending)).out;
    const { burned, sig } = await engine.buybackAndBurn(main, quoteIn);
    recordBurn(main.mint, burned, Number(pending) / LAMPORTS, "main");
    kvSet("main_burned", big(kvGet("main_burned")) + burned);
    ledger({ coin: main.mint, kind: "main-burn", mint: main.mint, amount: burned, sol: Number(pending) / LAMPORTS, tx: sig });
    log(`platform burn: ${toUnits(burned, main.decimals).toFixed(0)} ${main.symbol}`);
  } catch (e) {
    kvSet("main_pending_lamports", big(kvGet("main_pending_lamports")) + pending);
    throw e;
  }
}

// ---------------------------------------------------------------- airdrops

/** Hourly: each coin's airdrop bucket goes to holders whose average entry is above the current price. */
export async function runAirdrops(engine: Engine, at = now()) {
  const epoch = Math.floor(at / AIRDROP_EPOCH_SECONDS);
  let paid = 0;
  for (const c of all<CoinRow>("SELECT * FROM coin WHERE airdrop_balance != '0' AND airdrop_last_epoch < ?", epoch)) {
    const balance = big(c.airdrop_balance);
    const holders = holdersOf(c.mint).filter((h) => h.airdropEligible);
    if (holders.length === 0) continue; // the bucket waits for the next epoch
    const items = holders
      .map((h) => ({ to: h.address, amount: (balance * BigInt(Math.floor(h.airdropWeight * 1e9))) / 1_000_000_000n }))
      .filter((i) => i.amount > 0n);
    try {
      const sent = await engine.sendTokens("airdrop", c.quote, items);
      for (const s of sent) recordAirdrop(c.mint, epoch, s.to, items.find((i) => i.to === s.to)!.amount, at, s.sig);
      run("UPDATE coin SET airdrop_last_epoch = ? WHERE mint = ?", epoch, c.mint);
      paid++;
    } catch (e) {
      log(`airdrop ${c.symbol}: ${(e as Error).message}`);
    }
  }
  if (paid) log(`airdrops: paid ${paid} coin(s) for epoch ${epoch}`);
  return paid;
}

// ---------------------------------------------------------------- protection epochs

/** When an epoch is due: cover realized losses since the last one, each coin limited to its share of the budget. */
export function runProtectionEpoch(at = now(), force = false) {
  const last = one<{ t: number }>("SELECT MAX(published_at) AS t FROM protection_epoch")?.t ?? 0;
  if (!force && last !== 0 && at < last + config.protectionEpochSeconds) return false;
  const from = lastEpochTo();
  const { losses, contributed, total } = lossesSince(from, at);
  // a hair under the budget so lamport rounding can never exceed it
  const plan = planProtectionEpoch(losses, contributed, total, epochBudgetSol() * 0.999);
  const claims = [...plan.wallets].map(([wallet, w]) => ({ wallet, amount: lamports(w.totalSol), breakdown: w.breakdown })).filter((c) => c.amount > 0n);
  if (claims.length === 0) {
    if (last === 0) return false; // nothing to publish yet; keep accumulating
    run(
      "INSERT INTO protection_epoch (total, published_at, window_from, window_to, coins) VALUES ('0', ?, ?, ?, '{}')",
      at,
      from,
      at,
    );
    return false;
  }
  const totalLamports = claims.reduce((s, c) => s + c.amount, 0n);
  tx(() => {
    const r = run(
      "INSERT INTO protection_epoch (total, published_at, window_from, window_to, coins) VALUES (?, ?, ?, ?, ?)",
      totalLamports.toString(),
      at,
      from,
      at,
      JSON.stringify(Object.fromEntries(plan.coins)),
    );
    const epoch = Number(r.lastInsertRowid);
    for (const c of claims)
      run(
        "INSERT INTO protection_claim (id, epoch, wallet, amount, breakdown, status, expires_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
        `${epoch}-${c.wallet}`,
        epoch,
        c.wallet,
        c.amount.toString(),
        JSON.stringify(
          c.breakdown.map((b) => ({ coin: b.coin, symbol: b.symbol, lossSol: b.lossSol, coverageBps: b.coverageBps, holdSeconds: b.holdSeconds })),
        ),
        at + PROTECTION_CLAIM_WINDOW_SECONDS,
      );
    log(`protection epoch ${epoch}: ${claims.length} wallet(s), ${(Number(totalLamports) / LAMPORTS).toFixed(4)} SOL`);
  });
  return true;
}

// ---------------------------------------------------------------- housekeeping

/** Expires stale OTC quotes and claims, and settles any the UI sent but never confirmed. */
export async function sweep(engine: Engine, at = now()) {
  for (const q of all<OtcQuoteRow>("SELECT * FROM otc_quote WHERE status = 'issued'")) {
    if (q.signature) {
      const s = await engine.verify(q.signature, `recur:otc:${q.id}`, "otc").catch(() => "pending" as const);
      if (s === "ok") {
        settleOtc(q.id, q.signature);
        continue;
      }
    }
    if (q.expires_at < at - 90) run("UPDATE otc_quote SET status = 'expired' WHERE id = ?", q.id);
  }
  for (const c of all<ClaimRow>("SELECT * FROM protection_claim WHERE status = 'pending'")) {
    if (!c.signature) {
      if (c.last_valid_height === 0 || at > (c.claimed_at ?? 0) + 120) run("UPDATE protection_claim SET status = 'open' WHERE id = ?", c.id);
      continue;
    }
    const s = await engine.verify(c.signature, `recur:claim:${c.id}`, "protection").catch(() => "pending" as const);
    if (s === "ok") settleClaim(c.id, c.signature, at);
    else if (s === "failed" || at > (c.claimed_at ?? 0) + 120) run("UPDATE protection_claim SET status = 'open', signature = NULL WHERE id = ?", c.id);
  }
  run("UPDATE protection_claim SET status = 'expired' WHERE status = 'open' AND expires_at < ?", at);
}

/** Books a confirmed OTC trade: limits, inventory, the 3% tax as SOL fee income for the coin. */
export function settleOtc(id: string, signature: string, at = now()) {
  return tx(() => {
    const q = one<OtcQuoteRow>("SELECT * FROM otc_quote WHERE id = ?", id);
    if (!q || q.status === "done") return false;
    const c = getCoin(q.coin)!;
    const taxSol = Number(BigInt(q.tax)) / LAMPORTS;
    const isSell = q.side === "sell";
    const tokens = BigInt(isSell ? q.amount_in : q.amount_out);
    run("UPDATE otc_quote SET status = 'done', signature = ? WHERE id = ?", signature, id);
    run(
      `UPDATE coin SET otc_credit = MAX(0, otc_credit + ?), otc_inventory = ?, pending_sol = pending_sol + ?,
         fees_sol = fees_sol + ? WHERE mint = ?`,
      isSell ? -q.sol_gross : q.sol_gross,
      (isSell ? big(c.otc_inventory) + tokens : big(c.otc_inventory) - tokens).toString(),
      taxSol,
      taxSol,
      c.mint,
    );
    // the trade counts like any other for cost basis and realized losses, priced in the coin's quote
    const solPer = solPerUnit(c.quote) || 1;
    const qDec = quoteDecimals(c.quote);
    const quoteAmount = BigInt(Math.floor((q.sol_gross / solPer) * 10 ** qDec));
    const taxQuote = BigInt(Math.floor((taxSol / solPer) * 10 ** qDec));
    recordTrade({
        id: `otc:${id}`,
        coin: c.mint,
        trader: q.wallet,
        isBuy: !isSell,
        quoteAmount,
        tokenAmount: tokens,
        tax: taxQuote,
        meteora: 0n,
        claimable: 0n,
        referral: 0n,
        sqrtPrice: c.sqrt_price,
        ts: at,
        tx: signature,
        kind: "otc",
    });
    treasury.otcSol += isSell ? -q.sol_gross : q.sol_gross - taxSol;
    ledger({ coin: c.mint, kind: isSell ? "otc-buy" : "otc-sell", mint: c.mint, amount: tokens, sol: q.sol_gross, tx: signature });
    return true;
  });
}

export function settleClaim(id: string, signature: string, at = now()) {
  return tx(() => {
    const c = one<ClaimRow>("SELECT * FROM protection_claim WHERE id = ?", id);
    if (!c || c.status === "claimed") return false;
    run("UPDATE protection_claim SET status = 'claimed', signature = ?, claimed_at = ? WHERE id = ?", signature, at, id);
    const e = one<{ claimed: string }>("SELECT claimed FROM protection_epoch WHERE id = ?", c.epoch)!;
    run("UPDATE protection_epoch SET claimed = ? WHERE id = ?", (big(e.claimed) + big(c.amount)).toString(), c.epoch);
    kvSet("protection_paid", big(kvGet("protection_paid")) + big(c.amount));
    treasury.protectionSol -= Number(big(c.amount)) / LAMPORTS;
    ledger({ kind: "protection-payout", mint: NATIVE_MINT, amount: big(c.amount), sol: Number(big(c.amount)) / LAMPORTS, tx: signature, note: c.wallet });
    return true;
  });
}
