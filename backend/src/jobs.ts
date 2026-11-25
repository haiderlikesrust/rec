import { NATIVE_MINT, PROTECTION_MIN_PAYOUT_SOL, otcPolicy, protectionPayout, splitRaw } from "@gantry/shared";
import { config, log } from "./config";
import { all, big, kvGet, kvSet, one, run, tx, type CoinRow, type LossRow, type OtcQuoteRow } from "./db";
import { memoFor, type Engine } from "./engine";
import { leaderOf } from "./fleet";
import { getCoin, ledger, quoteDecimals, recordBurn, recordTrade } from "./ledger";
import { solPerUnit, solUsd, toUnits } from "./prices";
import { coinPotSol, isRugged, now, owedProtectionSol, treasury } from "./services";

const LAMPORTS = 1_000_000_000;
const lamports = (sol: number) => BigInt(Math.floor(sol * LAMPORTS));

// ---------------------------------------------------------------- fee router
//
// Per coin: bring what its pools owe into the fee wallet, then convert it (plus any OTC tax paid in SOL) to SOL and
// split it in half:
//   OTC reserve → sent to the OTC wallet (the coin earns 2× sell credit)
//   protection  → sent to the protection wallet (the coin's pot for its sellers' losses)
// On the curve that is the platform fee of each trade, an exact amount waiting in the platform's vault. After
// graduation it is harvested from the CPMM pool: the quote side joins the split, the coin side is burned.
// A copy that doesn't lead its Fleet credits both halves to the Fleet's leader instead (see fleet.ts).

export async function processFees(engine: Engine, at = now()) {
  let processed = 0;
  for (const c0 of all<CoinRow>("SELECT * FROM coin WHERE income_quote != split_quote OR claimable_quote != '0' OR harvest_quote != '0' OR pending_sol > 0 OR EXISTS (SELECT 1 FROM kv WHERE k = 'protection_due:' || coin.mint AND v != '0')")) {
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
    // on a quote with a transfer fee less arrives than waited in the vault: that part was never income
    const short = big(c0.claimable_quote) - got;
    const income = big(getCoin(c0.mint)!.income_quote) - (short > 0n ? short : 0n);
    run("UPDATE coin SET claimable_quote = '0', income_quote = ? WHERE mint = ?", (income > 0n ? income : 0n).toString(), c0.mint);
    if (got > 0n) ledger({ coin: c0.mint, kind: "claim", mint: c0.quote, amount: got });
  }
  // a harvest costs two transactions, so it waits until what the pool holds for us is worth the split's minimum
  if (c0.cpmm_pool && toUnits(c0.harvest_quote, q.decimals) * q.usd >= config.feeMinUsd)
    // a harvest that fails is tried again next pass; what the coin already earned is still split now
    await harvest(engine, c0).catch((e: Error) => log(`harvest ${c0.symbol}: ${e.message}`));

  const c = getCoin(c0.mint)!;
  const quoteIn = big(c.income_quote) - big(c.split_quote);
  const solIn = lamports(c.pending_sol);
  // a protection half an earlier pass couldn't send: it goes out whole, not through the split again
  const dueKey = `protection_due:${c.mint}`;
  const due = big(kvGet(dueKey));
  const usd = toUnits(quoteIn > 0n ? quoteIn : 0n, q.decimals) * q.usd + (c.pending_sol + Number(due) / LAMPORTS) * solUsd();
  if (usd < config.feeMinUsd) return false;

  // book the batch before moving anything, so a crash mid-way never splits the same fees twice
  tx(() => {
    run("UPDATE coin SET split_quote = ?, pending_sol = MAX(0, pending_sol - ?) WHERE mint = ?", c.income_quote, c.pending_sol, c.mint);
    kvSet(dueKey, 0);
  });
  // anything not sent yet goes back as pending SOL for the next pass, so a failure never strands it in the fee wallet
  const requeue = (sol: bigint) => run("UPDATE coin SET pending_sol = pending_sol + ? WHERE mint = ?", Number(sol) / LAMPORTS, c.mint);
  let converted = 0n;
  try {
    if (quoteIn > 0n) converted = (await engine.convert(c.quote, NATIVE_MINT, quoteIn)).out;
  } catch (e) {
    run("UPDATE coin SET split_quote = ?, pending_sol = pending_sol + ? WHERE mint = ?", c.split_quote, c.pending_sol, c.mint);
    kvSet(dueKey, due);
    throw e;
  }
  const total = converted + solIn;
  if (total + due <= 0n) return true;

  const halves = splitRaw(total);
  const otc = halves.otcReserve;
  const protection = halves.protection + due;
  const lead = leaderOf(c, at);
  const routed = lead.mint !== c.mint;
  const note = routed ? `fleet: from ${c.symbol} (${c.mint})` : undefined;
  /** A copy's half that reached its leader: tallied on both sides as it lands. */
  const tally = (sol: number) => {
    if (!routed) return;
    run("UPDATE coin SET fleet_sent_sol = fleet_sent_sol + ? WHERE mint = ?", sol, c.mint);
    run("UPDATE coin SET fleet_received_sol = fleet_received_sol + ? WHERE mint = ?", sol, lead.mint);
  };
  const send = async (to: string, amount: bigint, failed: () => void) => {
    try {
      return await engine.sendSol("fees", to, amount);
    } catch (e) {
      failed();
      throw e;
    }
  };
  if (otc > 0n) {
    const otcSig = await send(engine.wallets.otc, otc, () => {
      requeue(total);
      kvSet(dueKey, due);
    });
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
  }

  const protSig = await send(engine.wallets.protection, protection, () => kvSet(dueKey, protection));
  const protSol = Number(protection) / LAMPORTS;
  run("UPDATE coin SET sol_to_protection = sol_to_protection + ? WHERE mint = ?", protSol, lead.mint);
  ledger({ coin: lead.mint, kind: "to-protection", mint: NATIVE_MINT, amount: protection, sol: protSol, tx: protSig, note });
  treasury.protectionSol += protSol;
  tally(protSol);
  return true;
}

/**
 * Collects what a graduated coin's pool owes the fee wallet. What arrived in the quote becomes income for the next
 * split; what arrived in the coin was burned on the way and comes off the supply. The estimate that triggered the
 * harvest is replaced by what it actually brought in.
 */
async function harvest(engine: Engine, c0: CoinRow) {
  const got = await engine.harvestFees(c0);
  tx(() => {
    const c = getCoin(c0.mint)!;
    // swaps indexed while the harvest was in flight keep their estimate
    const left = big(c.harvest_quote) - big(c0.harvest_quote);
    run("UPDATE coin SET harvest_quote = ?, income_quote = ? WHERE mint = ?", (left > 0n ? left : 0n).toString(), (big(c.income_quote) + got.quote).toString(), c.mint);
    if (got.quote > 0n) ledger({ coin: c.mint, kind: "harvest", mint: c.quote, amount: got.quote, tx: got.sig });
    if (got.burned > 0n) {
      recordBurn(c.mint, got.burned, "fees");
      ledger({ coin: c.mint, kind: "fee-burn", mint: c.mint, amount: got.burned, tx: got.sig, note: "the coin side of the pool's fees" });
    }
  });
}

// ---------------------------------------------------------------- protection payouts

/**
 * Covers realized losses as they happen, with nothing to claim. Each new loss gets its payout right away (loss x
 * hold-time rate, capped at 5x the tax that wallet paid on the coin and at a share of the coin's own pot), and every
 * wallet owed at least the minimum is paid from the protection wallet in batched transfers.
 */
export async function runProtection(engine: Engine, at = now()) {
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
        "INSERT INTO protection_payout (id, wallet, coin, ts, loss_sol, sol_usd, hold, tier_bps, amount_sol, limit_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        l.id,
        l.wallet,
        l.coin,
        l.ts,
        l.loss_sol,
        l.sol_usd,
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

// ---------------------------------------------------------------- housekeeping

/** Expires stale OTC quotes, and settles OTC trades the UI sent but never confirmed. */
export async function sweep(engine: Engine, at = now()) {
  for (const q of all<OtcQuoteRow>("SELECT * FROM otc_quote WHERE status = 'issued'")) {
    if (q.signature) {
      const s = await engine.verify(q.signature, memoFor("otc", q.id), "otc").catch(() => "pending" as const);
      if (s === "ok") {
        settleOtc(q.id, q.signature);
        continue;
      }
    }
    if (q.expires_at < at - 90) run("UPDATE otc_quote SET status = 'expired' WHERE id = ?", q.id);
  }
}

/**
 * Books a confirmed OTC sale: limits, the burn, the 3% tax as SOL fee income for the coin. The transaction that
 * paid the seller also burned the coins, so a confirmed sale is a confirmed burn.
 */
export function settleOtc(id: string, signature: string, at = now()) {
  return tx(() => {
    const q = one<OtcQuoteRow>("SELECT * FROM otc_quote WHERE id = ?", id);
    if (!q || q.status === "done") return false;
    const c = getCoin(q.coin)!;
    const taxSol = Number(BigInt(q.tax)) / LAMPORTS;
    const tokens = BigInt(q.amount_in);
    run("UPDATE otc_quote SET status = 'done', signature = ? WHERE id = ?", signature, id);
    run(
      "UPDATE coin SET otc_credit = MAX(0, otc_credit - ?), pending_sol = pending_sol + ?, fees_sol = fees_sol + ? WHERE mint = ?",
      q.sol_gross,
      taxSol,
      taxSol,
      c.mint,
    );
    recordBurn(c.mint, tokens, "otc");
    // the trade counts like any other for cost basis and realized losses, priced in the coin's quote
    const solPer = solPerUnit(c.quote) || 1;
    const qDec = quoteDecimals(c.quote);
    const quoteAmount = BigInt(Math.floor((q.sol_gross / solPer) * 10 ** qDec));
    const taxQuote = BigInt(Math.floor((taxSol / solPer) * 10 ** qDec));
    recordTrade({
      id: `otc:${id}`,
      coin: c.mint,
      trader: q.wallet,
      isBuy: false,
      quoteAmount,
      tokenAmount: tokens,
      tax: taxQuote,
      // the tax was paid in SOL straight to the fee wallet: it is split as pending SOL, not claimed from a pool
      protocol: 0n,
      claimable: 0n,
      harvestable: 0n,
      price: c.price,
      ts: at,
      tx: signature,
      kind: "otc",
    });
    treasury.otcSol -= q.sol_gross;
    ledger({ coin: c.mint, kind: "otc-burn", mint: c.mint, amount: tokens, sol: q.sol_gross, tx: signature });
    return true;
  });
}
