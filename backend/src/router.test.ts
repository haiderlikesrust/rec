import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// an isolated demo database for this run
process.env.DEMO = "1";
process.env.DB_FILE = ":memory:";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "recur-test-"));

const { NATIVE_MINT } = await import("@cook/shared");
const { loadWallets } = await import("./config");
const { all, big, one, run } = await import("./db");
const { DemoEngine, fakeKey } = await import("./demo/engine");
const { otcQuote } = await import("./flows");
const { coverLosses, processFees, runProtection } = await import("./jobs");
const { SYSTEM, getCoin } = await import("./ledger");
const { syncQuotes } = await import("./prices");
const { otcCoin, treasury, walletDailyCapSol } = await import("./services");

syncQuotes();
const keys = loadWallets(true);
for (const k of Object.values(keys)) SYSTEM.add(k.publicKey.toBase58());
const engine = new DemoEngine(keys);
const sol = (wallet: string) => Number(engine.bal(wallet, NATIVE_MINT)) / 1e9;
const refresh = () => {
  treasury.otcSol = sol(engine.wallets.otc);
  treasury.protectionSol = sol(engine.wallets.protection);
};

test("fees flow from trades into the five wallets, and losses are paid out automatically", async () => {
  const t0 = Math.floor(Date.now() / 1000) - 4 * 3600;
  const creator = fakeKey();
  const { mint } = engine.createCoin(
    { wallet: creator, name: "Test", symbol: "TEST", description: "", image: "", website: "", twitter: "", telegram: "", quote: NATIVE_MINT, initialBuy: "0" },
    "http://x/",
    t0,
  );
  const buyer = fakeKey();
  const whale = fakeKey();
  // the buyer enters near the top: the whale pumps first, the buyer buys, then the whale dumps
  engine.trade(getCoin(mint)!, whale, "buy", 20n * 10n ** 9n, t0 + 60);
  engine.trade(getCoin(mint)!, buyer, "buy", 5n * 10n ** 9n, t0 + 120);
  engine.trade(getCoin(mint)!, whale, "sell", big(one<{ balance: string }>("SELECT balance FROM holder WHERE wallet = ?", whale)!.balance), t0 + 7200);
  const half = big(one<{ balance: string }>("SELECT balance FROM holder WHERE wallet = ?", buyer)!.balance) / 2n;
  engine.trade(getCoin(mint)!, buyer, "sell", half, t0 + 7300);

  const c = getCoin(mint)!;
  const tax = big(c.fees_quote);
  const income = big(c.income_quote);
  const meteora = big(c.meteora_quote);
  // 3% fee; Meteora keeps 20% minus the 20% referral rebate (16% net) on trades built by Recur
  assert.equal(income + meteora, tax);
  assert.ok(Math.abs(Number(meteora) / Number(tax) - 0.16) < 0.001, `meteora share ${Number(meteora) / Number(tax)}`);
  assert.ok(one("SELECT 1 FROM loss WHERE wallet = ?", buyer), "the buyer's losing sale is recorded for protection");

  refresh();
  await processFees(engine, t0 + 7400);
  const after = getCoin(mint)!;
  assert.equal(big(after.split_quote), income, "everything received was split");
  // the buyback is a trade too: it pays the 3% like anyone, and that income waits for the next split
  const leftover = big(after.income_quote) - big(after.split_quote);
  assert.ok(leftover > 0n && leftover <= (income * 1000n * 3n) / 10_000n / 100n, `buyback fee income ${leftover}`);
  assert.ok(big(after.coin_burned) > 0n, "coin bought back and burned");
  assert.ok(big(after.total_supply) < 10n ** 15n, "supply went down");
  // the SOL buckets keep their 30 : 40 : 10 ratio
  assert.ok(Math.abs(after.sol_to_otc / after.sol_to_protection - 0.75) < 0.001);
  assert.ok(Math.abs(after.sol_to_main / after.sol_to_protection - 0.25) < 0.001);
  assert.ok(Math.abs(sol(engine.wallets.otc) - after.sol_to_otc) < 1e-6, "the OTC wallet holds exactly its share");
  assert.ok(Math.abs(sol(engine.wallets.protection) - after.sol_to_protection) < 1e-6);
  assert.equal(big(after.airdrop_balance), (income * 1000n) / 10_000n, "10% sits in the airdrop wallet");
  assert.equal(engine.bal(engine.wallets.airdrop, NATIVE_MINT), big(after.airdrop_balance));
  assert.ok(Math.abs(after.otc_credit - after.sol_to_otc * 2) < 1e-9, "the coin earns 2x OTC credit");

  // OTC: the buyer sells the rest to the reserve; the 3% goes to the fee wallet in the same settlement
  refresh();
  // half of what the reserve will take from this wallet for this coin right now
  const info = otcCoin(getCoin(mint)!, t0 + 7400);
  assert.ok(info.twapReady && info.sellLimitSol > 0, "OTC is open after 30 minutes of history");
  const rest = BigInt(Math.floor(((Math.min(info.sellLimitSol, walletDailyCapSol()) * 0.5) / info.sellPriceSol) * 1e6));
  const before = sol(buyer);
  const feesBefore = sol(engine.wallets.fees);
  const supplyBefore = big(getCoin(mint)!.total_supply);
  const q = await otcQuote(engine, { wallet: buyer, coin: mint, side: "sell", amount: rest.toString() });
  assert.equal(q.demo, true);
  assert.ok(Math.abs(sol(buyer) - before - Number(q.amountOut) / 1e9) < 1e-9);
  assert.ok(Math.abs(sol(engine.wallets.fees) - feesBefore - Number(q.taxLamports) / 1e9) < 1e-9);
  assert.equal(one<{ status: string }>("SELECT status FROM otc_quote WHERE id = ?", q.id)!.status, "done");
  assert.ok(getCoin(mint)!.pending_sol > 0, "OTC tax is queued for the next split");
  // the reserve burned exactly what it bought, in the same settlement, and holds none of it
  assert.equal(big(getCoin(mint)!.otc_burned), rest, "every coin sold to the reserve is burned");
  assert.equal(big(getCoin(mint)!.total_supply), supplyBefore - rest, "supply went down by the OTC sale");
  assert.equal(engine.bal(engine.wallets.otc, mint), 0n, "the reserve holds no coins");
  await assert.rejects(otcQuote(engine, { wallet: buyer, coin: mint, side: "buy" as "sell", amount: "1000000" }), /only buys/);

  // protection: the buyer's losing sales are covered and paid out of the protection wallet, with nothing to claim
  refresh();
  const protBefore = sol(engine.wallets.protection);
  const buyerBefore = sol(buyer);
  await runProtection(engine, t0 + 7500);
  const payouts = all<{ amount_sol: number; tx: string | null }>("SELECT amount_sol, tx FROM protection_payout WHERE wallet = ?", buyer);
  const paid = payouts.reduce((s, p) => s + p.amount_sol, 0);
  assert.ok(paid > 0, "the buyer's losses earned a payout");
  assert.ok(payouts.every((p) => p.tx && !p.tx.startsWith("sending:")), "and it was sent");
  assert.ok(Math.abs(protBefore - sol(engine.wallets.protection) - paid) < 1e-9, "out of the protection wallet");
  assert.ok(Math.abs(sol(buyer) - buyerBefore - paid) < 1e-9, "to the buyer");
  assert.ok(Math.abs(getCoin(mint)!.protection_paid - paid) < 1e-9, "charged to the coin's own pot");
  assert.ok(payouts.every((p) => p.amount_sol <= after.sol_to_protection * 0.15 + 1e-9), "no payout takes over 15% of the pot");
  await runProtection(engine, t0 + 7600);
  assert.ok(Math.abs(sol(buyer) - buyerBefore - paid) < 1e-9, "a second pass pays nothing twice");

  // a claim left open from the old 6-day rounds is paid without being claimed
  const legacy = fakeKey();
  run("INSERT INTO protection_epoch (id, total, published_at, window_from, window_to, coins) VALUES (99, '2000000', ?, ?, ?, '{}')", t0, t0, t0);
  run(
    "INSERT INTO protection_claim (id, epoch, wallet, amount, breakdown, status, expires_at) VALUES ('99-x', 99, ?, '2000000', ?, 'open', ?)",
    legacy,
    JSON.stringify([{ coin: mint, symbol: "TEST", lossSol: 0.01, coverageBps: 2000, holdSeconds: 600 }]),
    t0 + 86_400,
  );
  refresh();
  const legacyBefore = engine.bal(legacy, NATIVE_MINT);
  await runProtection(engine, t0 + 7700);
  assert.equal(one<{ status: string }>("SELECT status FROM protection_claim WHERE id = '99-x'")!.status, "converted");
  assert.equal(engine.bal(legacy, NATIVE_MINT) - legacyBefore, 2_000_000n);

  // a short protection wallet makes a loss wait instead of paying it $0, and it's paid once the wallet can cover it
  const late = fakeKey();
  run(
    "INSERT INTO loss (id, coin, wallet, ts, loss_quote, loss_sol, hold, tax_paid_sol) VALUES ('late', ?, ?, ?, '0', 0.05, 7200, 0.02)",
    mint,
    late,
    t0 + 7800,
  );
  treasury.protectionSol = 0;
  coverLosses();
  assert.equal(one<{ processed: number }>("SELECT processed FROM loss WHERE id = 'late'")!.processed, 0, "waits while the wallet is short");
  assert.equal(one("SELECT 1 FROM protection_payout WHERE id = 'late'"), undefined);
  refresh();
  const lateBefore = engine.bal(late, NATIVE_MINT);
  await runProtection(engine, t0 + 7900);
  assert.equal(engine.bal(late, NATIVE_MINT) - lateBefore, 22_500_000n, "paid 45% of the loss once the wallet can cover it");
  assert.ok(all("SELECT * FROM ledger").length > 0);
});
