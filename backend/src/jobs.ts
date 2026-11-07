import { NATIVE_MINT, PROTECTION_MIN_PAYOUT_SOL, otcPolicy, protectionPayout, splitRaw } from "@cook/shared";
import { config, log } from "./config";
import { all, big, claimByCoin, kvGet, kvSet, one, run, tx, type ClaimRow, type CoinRow, type LossRow, type OtcQuoteRow } from "./db";
import { memoFor, type Engine } from "./engine";
import { leaderOf } from "./bloodline";
import { getCoin, ledger, quoteDecimals, recordBurn, recordTrade } from "./ledger";
import { solPerUnit, solUsd, toUnits } from "./prices";
import { coinPotSol, isRugged, now, owedProtectionSol, treasury } from "./services";

const LAMPORTS = 1_000_000_000;
const lamports = (sol: number) => BigInt(Math.floor(sol * LAMPORTS));

// ---------------------------------------------------------------- fee router
//
// Per coin: claim the pool's accrued fees into the fee wallet, then convert what was received (partner fee + referral
// rebate, plus the launch fee and any OTC tax paid in SOL) to SOL and split it in half:
//   OTC reserve → sent to the OTC wallet (the coin earns 2× sell credit)
//   protection  → sent to the protection wallet (the coin's pot for its sellers' losses)
// A copy that doesn't lead its Nest credits both halves to the Nest's leader instead (see bloodline.ts).

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

  // book the batch before moving anything, so a crash mid-way never splits the same fees twice
  run("UPDATE coin SET split_quote = ?, pending_sol = MAX(0, pending_sol - ?) WHERE mint = ?", c.income_quote, c.pending_sol, c.mint);
  // anything not sent yet goes back as pending SOL for the next pass, so a failure never strands it in the fee wallet
  const requeue = (sol: bigint) => run("UPDATE coin SET pending_sol = pending_sol + ? WHERE mint = ?", Number(sol) / LAMPORTS, c.mint);
  let converted = 0n;
  try {
    if (quoteIn > 0n) converted = (await engine.convert(c.quote, NATIVE_MINT, quoteIn)).out;
  } catch (e) {
    run("UPDATE coin SET split_quote = ?, pending_sol = pending_sol + ? WHERE mint = ?", c.split_quote, c.pending_sol, c.mint);
    throw e;
  }
  const total = converted + solIn;
  if (total <= 0n) return true;

  const { otcReserve: otc, protection } = splitRaw(total);
  const lead = leaderOf(c, at);
  const routed = lead.mint !== c.mint;
  const note = routed ? `nest: from ${c.symbol} (${c.mint})` : undefined;
  /** A copy's half that reached its leader: tallied on both sides as it lands. */
  const tally = (sol: number) => {
    if (!routed) return;
    run("UPDATE coin SET blood_sent_sol = blood_sent_sol + ? WHERE mint = ?", sol, c.mint);
    run("UPDATE coin SET blood_received_sol = blood_received_sol + ? WHERE mint = ?", sol, lead.mint);
  };
  const send = async (to: string, amount: bigint, unsent: bigint) => {
    try {
      return await engine.sendSol("fees", to, amount);
    } catch (e) {
      requeue(unsent);
      throw e;
    }
  };
  const otcSig = await send(engine.wallets.otc, otc, total);
  const otcSol = Number(otc) / LAMPORTS;
  run(
    "UPDATE coin SET sol_to_otc = sol_to_otc + ?, otc_credit = otc_credit + ?, otc_last_contribution = ? WHERE mint = ?",
    otcSol,
    (otcSol * otcPolicy.creditMultiplierBps) / 10_000,
    at,
    lead.mint,
  );
  ledger({ coin: lead.mint, kind: "to-otc", mint: NATIVE_MINT, amount: otc, sol: otcSol, tx: otcSig, note });
  treasury.otcSol += otcSol;
  tally(otcSol);

  const protSig = await send(engine.wallets.protection, protection, protection);
  const protSol = Number(protection) / LAMPORTS;
  run("UPDATE coin SET sol_to_protection = sol_to_protection + ? WHERE mint = ?", protSol, lead.mint);
  ledger({ coin: lead.mint, kind: "to-protection", mint: NATIVE_MINT, amount: protection, sol: protSol, tx: protSig, note });
  treasury.protectionSol += protSol;
  tally(protSol);
  return true;
}

// ---------------------------------------------------------------- protection payouts

/**
 * Covers realized losses as they happen, with nothing to claim. Each new loss gets its payout right away (loss x
 * hold-time rate, capped at 5x the tax that wallet paid on the coin and at a share of the coin's own pot), and every
 * wallet owed at least the minimum is paid from the protection wallet in batched transfers.
 */
export async function runProtection(engine: Engine, at = now()) {
  await payOldRounds(engine);
  coverLosses();
  return sendPayouts(engine, at);
}

/**
 * Decides the payout for every loss recorded since the last pass, oldest first. When the protection wallet can't
 * cover the next payout on top of what it already owes, that loss and every later one wait for the next pass, so a
 * short wallet delays payouts instead of shrinking them.
 */
export function coverLosses() {
  const losses = all<LossRow>("SELECT * FROM loss WHERE processed = 0 ORDER BY ts, rowid");
  if (losses.length === 0) return 0;
  const coins = new Map(all<CoinRow>("SELECT * FROM coin").map((c) => [c.mint, c]));
  let available = treasury.protectionSol - owedProtectionSol();
  let covered = 0;
  for (const [i, l] of losses.entries()) {
    const c = coins.get(l.coin);
    // creators selling their own coin aren't covered
    if (!c || c.creator === l.wallet) {
      run("UPDATE loss SET processed = 1 WHERE id = ?", l.id);
      continue;
    }
    const paidOnCoin = one<{ s: number }>(
      "SELECT COALESCE(SUM(amount_sol), 0) AS s FROM protection_payout WHERE wallet = ? AND coin = ?",
      l.wallet,
      l.coin,
    )!.s;
    const p = protectionPayout({
      lossSol: l.loss_sol,
      holdSeconds: l.hold,
      rugged: isRugged(c),
      taxPaidSol: l.tax_paid_sol,
      paidOnCoinSol: paidOnCoin,
      potSol: coinPotSol(c),
    });
    // whole lamports, so what's booked is exactly what gets sent
    const amount = Number(lamports(p.payoutSol)) / LAMPORTS;
    if (amount > available) {
      log(`protection: the wallet holds ${Math.max(0, available).toFixed(4)} SOL beyond what it owes; ${losses.length - i} loss(es) wait for it`);
      break;
    }
    tx(() => {
      run("UPDATE loss SET processed = 1 WHERE id = ?", l.id);
      run(
        "INSERT INTO protection_payout (id, wallet, coin, ts, loss_sol, hold, tier_bps, amount_sol, limit_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        l.id,
        l.wallet,
        l.coin,
        l.ts,
        l.loss_sol,
        l.hold,
        p.tierBps,
        amount,
        p.limit,
      );
      if (amount > 0) {
        run("UPDATE coin SET protection_paid = protection_paid + ? WHERE mint = ?", amount, c.mint);
        c.protection_paid += amount;
        available -= amount;
        covered++;
      }
    });
  }
  if (covered) log(`protection: covered ${covered} loss(es)`);
  return covered;
}

/**
 * Pays every wallet owed at least the minimum. The payouts are marked as sending before the transfer, so if the
 * server dies mid-send they're left for a look rather than sent twice; a transfer that fails puts them back.
 */
async function sendPayouts(engine: Engine, at: number) {
  const owed = all<{ wallet: string; s: number }>(
    "SELECT wallet, SUM(amount_sol) AS s FROM protection_payout WHERE tx IS NULL AND amount_sol > 0 GROUP BY wallet ORDER BY s",
  ).filter((o) => o.s >= PROTECTION_MIN_PAYOUT_SOL);
  // never send more than the wallet holds, less a little for network fees
  let room = treasury.protectionSol - 0.005;
  const items: { to: string; amount: bigint }[] = [];
  for (const o of owed) {
    if (o.s > room) break;
    room -= o.s;
    // each payout is booked in whole lamports, so the sum rounds back to one exactly
    items.push({ to: o.wallet, amount: BigInt(Math.round(o.s * LAMPORTS)) });
  }
  if (items.length === 0) return 0;
  const batch = `sending:${at}`;
  tx(() => {
    for (const i of items) run("UPDATE protection_payout SET tx = ? WHERE wallet = ? AND tx IS NULL AND amount_sol > 0", batch, i.to);
  });
  const sent = new Map((await engine.sendTokens("protection", NATIVE_MINT, items)).map((r) => [r.to, r.sig]));
  let paid = 0n;
  tx(() => {
    for (const i of items) {
      const sig = sent.get(i.to);
      if (!sig) {
        run("UPDATE protection_payout SET tx = NULL WHERE wallet = ? AND tx = ?", i.to, batch);
        continue;
      }
      run("UPDATE protection_payout SET tx = ?, sent_at = ? WHERE wallet = ? AND tx = ?", sig, at, i.to, batch);
      ledger({ kind: "protection-payout", mint: NATIVE_MINT, amount: i.amount, sol: Number(i.amount) / LAMPORTS, tx: sig, note: i.to });
      paid += i.amount;
    }
    kvSet("protection_paid", big(kvGet("protection_paid")) + paid);
  });
  treasury.protectionSol -= Number(paid) / LAMPORTS;
  if (sent.size) log(`protection: paid ${sent.size} wallet(s) ${(Number(paid) / LAMPORTS).toFixed(4)} SOL`);
  return sent.size;
}

/**
 * Claims still open from when protection paid in 6-day rounds become ordinary owed payouts, so they're sent
 * without a claim. One whose claim transaction already landed (memo on the protection wallet) is just recorded.
 */
async function payOldRounds(engine: Engine) {
  const open = all<ClaimRow>("SELECT * FROM protection_claim WHERE status = 'open'");
  if (open.length === 0) return;
  const landed = await engine.recentMemos("protection");
  for (const c of open) {
    const hit = landed.find((m) => m.memo.includes(memoFor("claim", c.id)));
    if (hit) {
      settleClaim(c.id, hit.signature);
      continue;
    }
    const items = JSON.parse(c.breakdown) as { coin: string; lossSol: number; coverageBps: number; holdSeconds: number }[];
    const amounts = new Map(claimByCoin(c.amount, c.breakdown));
    tx(() => {
      run("UPDATE protection_claim SET status = 'converted' WHERE id = ?", c.id);
      // the coins' pots were charged for these when the round was published
      for (const b of items)
        run(
          "INSERT OR IGNORE INTO protection_payout (id, wallet, coin, ts, loss_sol, hold, tier_bps, amount_sol, limit_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'round')",
          `claim:${c.id}:${b.coin}`,
          c.wallet,
          b.coin,
          one<{ t: number }>("SELECT published_at AS t FROM protection_epoch WHERE id = ?", c.epoch)?.t ?? now(),
          b.lossSol,
          b.holdSeconds,
          b.coverageBps,
          Number(lamports(amounts.get(b.coin) ?? 0)) / LAMPORTS,
        );
    });
  }
  log(`protection: ${open.length} open claim(s) from the old rounds will be paid automatically`);
}

// ---------------------------------------------------------------- housekeeping

/** Expires stale OTC quotes, and settles OTC trades and old-round claims the UI sent but never confirmed. */
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
  await burnOtcLeftovers(engine);
}

/**
 * Coins the OTC reserve bought before it started burning them on arrival: burn those too, so it never holds any.
 * The amount is taken off the books before the burn and put back if the burn fails, so two servers can't both burn it.
 */
async function burnOtcLeftovers(engine: Engine) {
  for (const c of all<CoinRow>("SELECT * FROM coin WHERE otc_inventory != '0'")) {
    const amount = big(c.otc_inventory);
    run("UPDATE coin SET otc_inventory = '0' WHERE mint = ?", c.mint);
    if (amount <= 0n) continue;
    try {
      const { burned, sig } = await engine.burnHeld("otc", c, amount);
      if (burned > 0n)
        tx(() => {
          recordBurn(c.mint, burned, "otc");
          ledger({ coin: c.mint, kind: "otc-burn", mint: c.mint, amount: burned, tx: sig, note: "inventory from before burn-on-arrival" });
        });
      log(`OTC reserve: burned ${toUnits(burned, c.decimals).toFixed(0)} leftover ${c.symbol}`);
    } catch (e) {
      run("UPDATE coin SET otc_inventory = ? WHERE mint = ?", amount.toString(), c.mint);
      log(`OTC leftover burn ${c.symbol}: ${(e as Error).message}`);
    }
  }
}

/**
 * Books a confirmed OTC trade: limits, the burn, the 3% tax as SOL fee income for the coin. The transaction that
 * paid the seller also burned the coins, so a confirmed sale is a confirmed burn.
 */
export function settleOtc(id: string, signature: string, at = now()) {
  return tx(() => {
    const q = one<OtcQuoteRow>("SELECT * FROM otc_quote WHERE id = ?", id);
    if (!q || q.status === "done") return false;
    const c = getCoin(q.coin)!;
    const taxSol = Number(BigInt(q.tax)) / LAMPORTS;
    // quotes issued before the reserve started burning could also buy from its inventory
    const isSell = q.side === "sell";
    const tokens = BigInt(isSell ? q.amount_in : q.amount_out);
    run("UPDATE otc_quote SET status = 'done', signature = ? WHERE id = ?", signature, id);
    run(
      "UPDATE coin SET otc_credit = MAX(0, otc_credit + ?), pending_sol = pending_sol + ?, fees_sol = fees_sol + ? WHERE mint = ?",
      isSell ? -q.sol_gross : q.sol_gross,
      taxSol,
      taxSol,
      c.mint,
    );
    if (isSell) recordBurn(c.mint, tokens, "otc");
    else run("UPDATE coin SET otc_inventory = ? WHERE mint = ?", (big(c.otc_inventory) - tokens).toString(), c.mint);
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
    ledger({ coin: c.mint, kind: isSell ? "otc-burn" : "otc-sell", mint: c.mint, amount: tokens, sol: q.sol_gross, tx: signature });
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
