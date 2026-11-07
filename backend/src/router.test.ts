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

test("fees flow from trades into the OTC and protection wallets, and losses are paid out automatically", async () => {
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
  const feeWalletBefore = sol(engine.wallets.fees);
  const launchFee = c.pending_sol;
  assert.ok(launchFee > 0, "the launch fee waits to be split with the trading fees");
  await processFees(engine, t0 + 7400);
  const after = getCoin(mint)!;
  assert.equal(big(after.split_quote), big(after.income_quote), "everything received was split");
  assert.equal(after.pending_sol, 0, "the launch fee too");
  // half to the OTC reserve, half to the protection fund, nothing left in the fee wallet
  const total = Number(income) / 1e9 + launchFee;
  assert.ok(Math.abs(after.sol_to_otc + after.sol_to_protection - total) < 1e-9, "all of it reached the two wallets");
  assert.ok(Math.abs(after.sol_to_otc - after.sol_to_protection) <= 1e-9, "in equal halves");
  // the pass claims the pool's share into the fee wallet and sends it on with the rest
  const claimed = Number(big(c.claimable_quote)) / 1e9;
  assert.ok(Math.abs(feeWalletBefore + claimed - sol(engine.wallets.fees) - total) < 1e-9, "out of the fee wallet, none left behind");
  assert.ok(Math.abs(sol(engine.wallets.otc) - after.sol_to_otc) < 1e-6, "the OTC wallet holds exactly its share");
  assert.ok(Math.abs(sol(engine.wallets.protection) - after.sol_to_protection) < 1e-6);
  assert.equal(big(after.total_supply), 10n ** 15n, "no buybacks: supply only falls through OTC sales");
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

test("a send that fails puts the unsent SOL back for the next pass instead of stranding it in the fee wallet", async () => {
  const at = Math.floor(Date.now() / 1000);
  const { mint } = engine.createCoin(
    { wallet: fakeKey(), name: "Fail", symbol: "FAIL", description: "", image: "", website: "", twitter: "", telegram: "", quote: NATIVE_MINT, initialBuy: "0" },
    "http://x/",
    at - 600,
  );
  engine.trade(getCoin(mint)!, fakeKey(), "buy", 5n * 10n ** 9n, at - 300);
  const send = engine.sendSol.bind(engine);
  let failures = 0;
  engine.sendSol = async (from, to, lamports) => {
    if (to === engine.wallets.protection && failures++ === 0) throw new Error("RPC down");
    return send(from, to, lamports);
  };
  try {
    await processFees(engine, at);
    const c = getCoin(mint)!;
    assert.ok(c.sol_to_otc > 0, "the OTC half went out");
    assert.equal(c.sol_to_protection, 0, "the protection half didn't");
    assert.ok(Math.abs(c.pending_sol - c.sol_to_otc) < 2e-9, "it waits as pending SOL");
    await processFees(engine, at + 30);
    const d = getCoin(mint)!;
    assert.equal(d.pending_sol, 0, "the next pass sent it");
    assert.ok(Math.abs(d.sol_to_otc + d.sol_to_protection - (c.sol_to_otc + c.pending_sol)) < 1e-9, "nothing was lost");
  } finally {
    engine.sendSol = send;
  }
});

test("a config built for older market caps is replaced at the next launch, and keeps its own curve", async () => {
  const { GRADUATION_MCAP_USD, START_MCAP_USD } = await import("@cook/shared");
  const { configCurve } = await import("./prices");
  const usdt = one<{ mint: string }>("SELECT mint FROM quote WHERE symbol = 'USDT'")!.mint;
  const old = engine.configFor(usdt);
  run("UPDATE config SET start_mcap_usd = 2500, grad_mcap_usd = 30000 WHERE address = ?", old.address);
  const fresh = engine.configFor(usdt);
  assert.notEqual(fresh.address, old.address, "the outdated config is retired");
  assert.equal(fresh.start_mcap_usd, START_MCAP_USD);
  assert.equal(fresh.grad_mcap_usd, GRADUATION_MCAP_USD);
  const legacy = one<{ quote_usd: number; start_mcap_usd: number; grad_mcap_usd: number }>("SELECT * FROM config WHERE address = ?", old.address)!;
  assert.ok(Math.abs(configCurve(legacy).sqrtStart ** 2 * 1e9 * legacy.quote_usd - 2500) < 1, "its coins still price from $2.5k");
});

test("a first buy paid in SOL on another pair swaps into the quote, then launches with what arrived", async () => {
  const usdc = one<{ mint: string }>("SELECT mint FROM quote WHERE symbol = 'USDC'")!.mint;
  const creator = fakeKey();
  const solBefore = engine.bal(creator, NATIVE_MINT);
  const usdcBefore = engine.bal(creator, usdc);
  const swap = await engine.solToQuote(creator, usdc, 10n ** 9n);
  const got = big(swap.outAmount);
  assert.ok(got > 0n, "the swap returns the quote it bought");
  assert.equal(engine.bal(creator, NATIVE_MINT), solBefore - 10n ** 9n);
  assert.equal(engine.bal(creator, usdc), usdcBefore + got);

  const setup = await engine.pairSetup(creator, usdc);
  assert.equal(setup.tx, null, "a listed pair needs no setup transaction");
  const { mint } = await engine.launch(
    { wallet: creator, name: "Paid", symbol: "PAID", description: "", image: "", website: "", twitter: "", telegram: "", quote: usdc, initialBuy: got.toString() },
    "http://x/",
  );
  assert.equal(engine.bal(creator, usdc), usdcBefore, "the whole swap went into the first buy");
  assert.ok(big(one<{ balance: string }>("SELECT balance FROM holder WHERE coin = ? AND wallet = ?", mint, creator)!.balance) > 0n);
});

test("Nest: a copy pays its entry to the leader's holders and feeds the leader its whole fee split", async () => {
  const { BLOODLINE, bloodKey } = await import("@cook/shared");
  const { checkLaunch, familyState, runEntries } = await import("./bloodline");
  const { createApi } = await import("./api");
  const app = createApi(engine);
  assert.equal(bloodKey("C4T"), "CAT");
  assert.equal(bloodKey("C@T"), "CAT");
  assert.equal(bloodKey("Сat"), "CAT", "a Cyrillic С reads as C");
  assert.equal(bloodKey("0FFICIA1"), bloodKey("Official"));

  const at = Math.floor(Date.now() / 1000);
  const meta = { description: "", image: "", website: "", twitter: "", telegram: "", quote: NATIVE_MINT, initialBuy: "0" };
  const ogCreator = fakeKey();
  const og = engine.createCoin({ ...meta, wallet: ogCreator, name: "Cat", symbol: "CAT" }, "http://x/", at - 3600).mint;
  // five holders keep the OG alive; the last one buys highest
  const holders = Array.from({ length: 5 }, () => fakeKey());
  holders.forEach((h, i) => engine.trade(getCoin(og)!, h, "buy", 3n * 10n ** 9n, at - 1800 + i));

  assert.equal(checkLaunch("DOG", "Dog", NATIVE_MINT).family, null, "an unrelated launch joins no family");
  const check = checkLaunch("C4T", "C@T", NATIVE_MINT);
  assert.equal(check.family?.og.address, og);
  assert.ok(check.entry, "copying an alive coin costs the entry");
  assert.equal(check.entry!.to.address, og);

  const launch = (body: object) =>
    app.request("/api/tx/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const copier = fakeKey();
  const req = { ...meta, wallet: copier, name: "C@T", symbol: "C4T", initialBuy: (10n ** 9n).toString() };
  const refused = await launch(req);
  assert.equal(refused.status, 400, "a copy can't launch without its entry");
  assert.match(((await refused.json()) as { error: string }).error, /pays the \$500 Nest entry/);

  const res = await launch({ ...req, entry: check.entry!.quoteRaw });
  assert.equal(res.status, 200);
  const copy = ((await res.json()) as { mint: string }).mint;
  const c = getCoin(copy)!;
  assert.equal(c.family, og, "the copy joins the OG's family");
  assert.equal(c.entry_status, "pending");
  const entryTokens = big(c.entry_tokens);
  assert.equal(engine.bal(engine.wallets.fees, copy), entryTokens, "the entry's coins sit in the fee wallet");
  const own = big(one<{ balance: string }>("SELECT balance FROM holder WHERE coin = ? AND wallet = ?", copy, copier)!.balance);
  assert.ok(own > 0n && own < entryTokens, "the launcher gets only their own buy, bought after the entry at a higher price");

  await runEntries(engine, at);
  assert.equal(getCoin(copy)!.entry_status, "done");
  const drops = all<{ wallet: string; amount: string }>("SELECT wallet, amount FROM entry_drop WHERE coin = ?", copy);
  assert.equal(drops.reduce((s, d) => s + big(d.amount), 0n), entryTokens, "all of the entry went out");
  assert.deepEqual(new Set(drops.map((d) => d.wallet)), new Set(holders), "to the OG's holders, not its creator or the copier");
  // nobody over the cap (the cap can't be below an even split), give or take rounding dust
  const capBps = BigInt(Math.max(BLOODLINE.maxShareBps, Math.ceil(10_000 / drops.length)));
  assert.ok(drops.every((d) => big(d.amount) * 10_000n <= entryTokens * capBps + 10_000n * BigInt(drops.length)));
  for (const d of drops) assert.equal(engine.bal(d.wallet, copy), big(d.amount));

  // two wallets trade the copy; it isn't alive, so its whole split goes to the OG
  for (const w of [fakeKey(), fakeKey()]) engine.trade(getCoin(copy)!, w, "buy", 2n * 10n ** 9n, at + 60);
  const ogBefore = getCoin(og)!;
  await processFees(engine, at + 120);
  const ogAfter = getCoin(og)!;
  const copyAfter = getCoin(copy)!;
  assert.equal(copyAfter.sol_to_otc + copyAfter.sol_to_protection, 0, "the copy keeps none of its fees");
  assert.equal(copyAfter.otc_credit, 0, "and earns no OTC credit of its own");
  const gained = ogAfter.sol_to_otc - ogBefore.sol_to_otc + (ogAfter.sol_to_protection - ogBefore.sol_to_protection);
  assert.ok(copyAfter.blood_sent_sol > 0 && Math.abs(copyAfter.blood_sent_sol - ogAfter.blood_received_sol) < 1e-9);
  // the OG's own fees were split in the same pass, so it gained at least what the copy sent
  assert.ok(gained >= copyAfter.blood_sent_sol - 1e-9, "the OG's OTC credit and protection pot grew by the copy's fees");
  assert.ok(ogAfter.otc_credit > ogBefore.otc_credit);

  // 13 hours on, the OG has gone quiet and the copy is busy: the copy leads
  const later = at + 13 * 3600;
  for (const w of [fakeKey(), fakeKey(), fakeKey()]) engine.trade(getCoin(copy)!, w, "buy", 3n * 10n ** 9n, later - 600);
  const s = familyState(og, later)!;
  assert.equal(s.rule, "alive");
  assert.equal(s.leader.mint, copy);
  // and once both are quiet, the best of them overall
  assert.equal(familyState(og, later + 13 * 3600)!.rule, "best");
});
