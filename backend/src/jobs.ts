import { NATIVE_MINT, PROTECTION_MIN_PAYOUT_SOL, otcPolicy, protectionPayout, splitRaw } from "@cook/shared";
import { config, log } from "./config";
import { all, big, claimByCoin, kvGet, kvSet, one, run, tx, type ClaimRow, type CoinRow, type LossRow, type OtcQuoteRow } from "./db";
import { memoFor, type Engine } from "./engine";
import { getCoin, ledger, quoteDecimals, recordAirdrop, recordBurn, recordTrade } from "./ledger";
import { solPerUnit, solUsd, toUnits } from "./prices";
import { coinPotSol, holdersOf, isRugged, now, owedProtectionSol, treasury } from "./services";

const LAMPORTS = 1_000_000_000;
const lamports = (sol: number) => BigInt(Math.floor(sol * LAMPORTS));

// ---------------------------------------------------------------- fee router
//
// Per coin: claim the pool's accrued fees into the fee wallet, then split what Recur received (partner fee +
// referral rebate, plus any OTC tax paid in SOL) 10/10/30/40/10:
//   coin buyback  → buy the coin in its own pool and burn it
//   airdrop       → quote asset to the airdrop wallet (paid out continuously by runAirdrops)
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

/**
 * Continuous airdrops. Every pass, each coin's new airdrop money is shared out to its current high-entry holders
 * (average entry above the price, weighted by how far underwater they are), and every holder's allocation is sent
 * as soon as it is worth the minimum payout, so nothing waits for an epoch and dust never costs more to move than
 * it is worth. Unsent allocations stay owed across passes (and across restarts).
 */
export async function runAirdrops(engine: Engine, at = now()) {
  for (const c of all<CoinRow>("SELECT * FROM coin WHERE airdrop_balance != '0'")) {
    const balance = big(c.airdrop_balance);
    const holders = holdersOf(c.mint).filter((h) => h.airdropEligible);
    if (holders.length === 0) continue; // no one underwater right now; the money waits for the next pass
    tx(() => {
      let given = 0n;
      for (const h of holders) {
        const amount = (balance * BigInt(Math.floor(h.airdropWeight * 1e9))) / 1_000_000_000n;
        if (amount <= 0n) continue;
        const prev = big(one<{ amount: string }>("SELECT amount FROM airdrop_owed WHERE coin = ? AND wallet = ?", c.mint, h.address)?.amount);
        run(
          "INSERT INTO airdrop_owed (coin, wallet, amount) VALUES (?, ?, ?) ON CONFLICT(coin, wallet) DO UPDATE SET amount = excluded.amount",
          c.mint,
          h.address,
          (prev + amount).toString(),
        );
        given += amount;
      }
      run("UPDATE coin SET airdrop_balance = ? WHERE mint = ?", (balance - given).toString(), c.mint);
    });
  }

  let sent = 0;
  const owed = all<{ coin: string; wallet: string; amount: string }>("SELECT * FROM airdrop_owed WHERE amount != '0'");
  for (const mint of new Set(owed.map((o) => o.coin))) {
    const c = getCoin(mint);
    const q = c && one<{ usd: number; decimals: number }>("SELECT usd, decimals FROM quote WHERE mint = ?", c.quote);
    if (!c || !q || !(q.usd > 0)) continue;
    const minRaw = BigInt(Math.ceil((config.airdropMinPayoutUsd / q.usd) * 10 ** q.decimals));
    const items = owed.filter((o) => o.coin === mint && big(o.amount) >= minRaw).map((o) => ({ to: o.wallet, amount: big(o.amount) }));
    if (items.length === 0) continue;
    try {
      for (const r of await engine.sendTokens("airdrop", c.quote, items)) {
        const amount = items.find((i) => i.to === r.to)!.amount;
        tx(() => {
          const left = big(one<{ amount: string }>("SELECT amount FROM airdrop_owed WHERE coin = ? AND wallet = ?", mint, r.to)?.amount) - amount;
          run("UPDATE airdrop_owed SET amount = ? WHERE coin = ? AND wallet = ?", (left > 0n ? left : 0n).toString(), mint, r.to);
          recordAirdrop(mint, at, r.to, amount, at, r.sig);
        });
        sent++;
      }
    } catch (e) {
      log(`airdrop ${c.symbol}: ${(e as Error).message}`);
    }
  }
  if (sent) log(`airdrops: sent ${sent} payout(s)`);
  return sent;
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

/** Decides the payout for every loss recorded since the last pass, oldest first. */
export function coverLosses() {
  const losses = all<LossRow>("SELECT * FROM loss WHERE processed = 0 ORDER BY ts, rowid");
  if (losses.length === 0) return 0;
  const coins = new Map(all<CoinRow>("SELECT * FROM coin").map((c) => [c.mint, c]));
  let available = treasury.protectionSol - owedProtectionSol();
  let covered = 0;
  for (const l of losses) {
    const c = coins.get(l.coin);
    tx(() => {
      run("UPDATE loss SET processed = 1 WHERE id = ?", l.id);
      // creators selling their own coin aren't covered
      if (!c || c.creator === l.wallet) return;
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
        potSol: coinPotSol(c, available),
      });
      // whole lamports, so what's booked is exactly what gets sent
      const amount = Number(lamports(p.payoutSol)) / LAMPORTS;
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
          recordBurn(c.mint, burned, 0, "otc");
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
    if (isSell) recordBurn(c.mint, tokens, q.sol_gross, "otc");
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
