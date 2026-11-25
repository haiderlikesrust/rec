import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// an isolated demo database for this run
process.env.DEMO = "1";
process.env.DB_FILE = ":memory:";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "gantry-test-"));

const { GRADUATION_MCAP_USD, LAUNCH_RENT_SOL, NATIVE_MINT, START_MCAP_USD, feeBreakdown } = await import("@gantry/shared");
const { loadWallets } = await import("./config");
const { all, big, one, run } = await import("./db");
const { DemoEngine, fakeKey } = await import("./demo/engine");
const { otcQuote } = await import("./flows");
const { coverLosses, processFees, runProtection } = await import("./jobs");
const { SYSTEM, getCoin } = await import("./ledger");
const { quoteRow, syncQuotes, toQuoteAsset, unavailableReason } = await import("./prices");
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
const meta = { description: "", image: "", website: "", twitter: "", telegram: "", quote: NATIVE_MINT, initialBuy: "0" };

test("fees flow from trades into the OTC and protection wallets, and losses are paid out automatically", async () => {
  const t0 = Math.floor(Date.now() / 1000) - 4 * 3600;
  const creator = fakeKey();
  const creatorBefore = sol(creator);
  const { mint } = engine.createCoin({ ...meta, wallet: creator, name: "Test", symbol: "TEST" }, "http://x/", t0);
  assert.ok(Math.abs(creatorBefore - sol(creator) - LAUNCH_RENT_SOL) < 1e-9, "a launch costs the rent of the coin's accounts and no fee");
  const usd = quoteRow(NATIVE_MINT)!.usd;
  assert.ok(Math.abs(getCoin(mint)!.price * 1e9 * usd - START_MCAP_USD) < 0.01, "it starts at a $2.5k market cap");

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
  const protocol = big(c.protocol_quote);
  // 3% on the quote side of every trade: Raydium keeps 0.25%, the platform fee is the other 2.75%
  assert.equal(income + protocol, tax);
  assert.ok(Math.abs(Number(tax) / Number(big(c.volume_quote)) - 0.03) < 1e-6, `fee ${Number(tax) / Number(big(c.volume_quote))}`);
  assert.ok(Math.abs(Number(protocol) / Number(tax) - 25 / 300) < 1e-6, `Raydium's share ${Number(protocol) / Number(tax)}`);
  assert.equal(big(c.claimable_quote), income, "all of it waits in the platform's fee vault");
  assert.ok(one("SELECT 1 FROM loss WHERE wallet = ?", buyer), "the buyer's losing sale is recorded for protection");

  refresh();
  const feeWalletBefore = sol(engine.wallets.fees);
  await processFees(engine, t0 + 7400);
  const after = getCoin(mint)!;
  assert.equal(big(after.split_quote), big(after.income_quote), "everything received was split");
  assert.equal(big(after.claimable_quote), 0n, "after being claimed from the vault");
  // half to the OTC reserve, half to the protection fund, nothing left in the fee wallet
  const total = Number(income) / 1e9;
  assert.ok(Math.abs(after.sol_to_otc + after.sol_to_protection - total) < 1e-9, "all of it reached the two wallets");
  assert.ok(Math.abs(after.sol_to_otc - after.sol_to_protection) <= 1e-9, "in equal halves");
  assert.ok(Math.abs(sol(engine.wallets.fees) - feeWalletBefore) < 1e-9, "the fee wallet claimed it and passed all of it on");
  assert.ok(Math.abs(sol(engine.wallets.otc) - after.sol_to_otc) < 1e-6, "the OTC wallet holds exactly its share");
  assert.ok(Math.abs(sol(engine.wallets.protection) - after.sol_to_protection) < 1e-6);
  assert.equal(big(after.total_supply), 10n ** 15n, "nothing is bought back or burned on the curve: supply only falls through OTC sales");
  assert.ok(Math.abs(after.otc_credit - after.sol_to_otc * 2) < 1e-9, "the coin earns 2x OTC credit");

  // OTC: the buyer sells the rest to the reserve; the 3% goes to the fee wallet in the same settlement
  refresh();
  // half of what the reserve will take from this wallet for this coin right now
  const info = otcCoin(getCoin(mint)!, t0 + 7400);
  assert.ok(info.twapReady && info.sellLimitSol > 0, "OTC is open once there is enough history");
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

  // a short protection wallet makes a loss wait instead of paying it $0, and it's paid once the wallet can cover it
  const late = fakeKey();
  run(
    "INSERT INTO loss (id, coin, wallet, ts, loss_quote, loss_sol, sol_usd, hold, tax_paid_sol) VALUES ('late', ?, ?, ?, '0', 0.05, 150, 7200, 0.02)",
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
  const { mint } = engine.createCoin({ ...meta, wallet: fakeKey(), name: "Fail", symbol: "FAIL" }, "http://x/", at - 600);
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

test("a coin graduates at $25k into a CPMM pool at the same price; its pool fees split in the quote and burn in the coin", async () => {
  const at = Math.floor(Date.now() / 1000) - 3600;
  const usd = quoteRow(NATIVE_MINT)!.usd;
  const { mint } = engine.createCoin({ ...meta, wallet: fakeKey(), name: "Grad", symbol: "GRAD" }, "http://x/", at);
  const launched = getCoin(mint)!;
  const raise = big(launched.threshold);
  assert.ok(Math.abs((Number(raise) / 1e9) * usd - 6006.33) < 0.01, "a curve raises about $6k");
  assert.ok(Math.abs(Number(big(launched.curve_sell)) / 1e15 - 0.75975) < 1e-5, "by selling 75.97% of the supply");

  // five wallets buy the curve out; the last one offers more than it has left
  const wallets = Array.from({ length: 5 }, () => fakeKey());
  const slice = (raise * 103n) / 100n / 4n;
  for (const w of wallets) engine.add(w, NATIVE_MINT, slice * 2n);
  let last = { amountIn: 0n };
  for (const [i, w] of wallets.entries()) {
    if (getCoin(mint)!.graduated) break;
    last = engine.trade(getCoin(mint)!, w, "buy", slice, at + 60 + i).fill;
  }
  const g = getCoin(mint)!;
  assert.equal(g.graduated, 1);
  assert.ok(last.amountIn < slice, "the buy that completes the curve pays only for the coins that were left");
  assert.equal(big(g.base_sold), big(g.curve_sell), "the curve sold everything it had to sell");
  assert.ok(g.cpmm_pool && g.fee_key, "the pool exists, its LP locked behind a Fee Key the fee wallet holds");
  assert.ok(Math.abs(g.price * 1e9 * usd - GRADUATION_MCAP_USD) < 0.5, `graduates at $25k, got $${(g.price * 1e9 * usd).toFixed(2)}`);
  // what the curve didn't sell and everything it raised open the pool
  assert.equal(big(g.pool_base), 10n ** 15n - big(g.curve_sell));
  assert.equal(big(g.pool_quote), big(g.quote_reserve));
  assert.ok(Math.abs(Number(big(g.pool_quote)) / Number(big(g.pool_base)) / 1e3 / g.price - 1) < 1e-9, "at the price the curve ended on");

  // the curve's own fees are split first, so what follows is only the pool's
  refresh();
  await processFees(engine, at + 120);
  const before = getCoin(mint)!;
  assert.equal(big(before.harvest_quote), 0n);

  const trader = fakeKey();
  const bought = engine.trade(before, trader, "buy", 4n * 10n ** 9n, at + 200).fill;
  const sold = engine.trade(getCoin(mint)!, trader, "sell", bought.amountOut, at + 260).fill;
  const share = feeBreakdown("cpmm");
  assert.equal(bought.venue, "cpmm");
  assert.equal(bought.tax, (4n * 10n ** 9n * 255n) / 10_000n, "the pool charges its tier: 2.5% plus a 0.05% creator fee");
  assert.ok(Math.abs(Number(sold.tax) / Number(sold.gross) - share.taxBps / 10_000) < 1e-6, "on sales too, valued in the quote");
  const traded = getCoin(mint)!;
  const fees = big(traded.fees_quote) - big(before.fees_quote);
  const expected = big(traded.harvest_quote);
  assert.equal(fees, bought.tax + sold.tax);
  assert.ok(Math.abs(Number(expected) / Number(fees) - share.bucketsBps / share.taxBps) < 1e-6, "43% of a pool fee is expected back in the quote");
  assert.equal(big(traded.income_quote), big(before.income_quote), "but nothing counts as income until it is harvested");

  const supply = big(traded.total_supply);
  const otcBefore = traded.sol_to_otc;
  const price = traded.price;
  await processFees(engine, at + 300);
  const h = getCoin(mint)!;
  assert.equal(big(h.harvest_quote), 0n, "the harvest collected it");
  assert.equal(big(h.income_quote) - big(traded.income_quote), expected, "the quote side became income");
  assert.equal(big(h.split_quote), big(h.income_quote), "and was split like any fee");
  // (to the lamport: an odd amount leaves the extra one with the protection half)
  assert.ok(Math.abs((h.sol_to_otc - otcBefore) * 2 - Number(expected) / 1e9) < 1e-8, "half to each bucket");
  const burned = big(h.fee_burned);
  assert.ok(burned > 0n && big(h.total_supply) === supply - burned && big(h.burned) === burned, "the coin side was burned, not sold");
  // the burn is worth what the LP fees paid in the quote: the two sides of an LP payout are equal in value
  const lpQuote = (Number(fees) * share.burnedBps) / share.taxBps;
  assert.ok(Math.abs((Number(burned) / 1e6) * h.price * 1e9 - lpQuote) / lpQuote < 1e-3);
  assert.ok(Math.abs(Number(big(h.pool_quote)) / Number(big(h.pool_base)) / 1e3 / price - 1) < 1e-9, "taking fees out of the pool doesn't move its price");
  assert.equal(engine.bal(engine.wallets.fees, mint), 0n, "the fee wallet keeps none of the coin");
});

test("a quote whose curve can't raise LaunchLab's floor at today's price is listed as unavailable and can't be launched on", async () => {
  const { createApi } = await import("./api");
  const app = createApi(engine);
  const live = quoteRow(NATIVE_MINT)!.usd;
  const launch = () =>
    app.request("/api/tx/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...meta, wallet: fakeKey(), name: "Pricey", symbol: "PRCY" }) });
  try {
    // LaunchLab asks a SOL curve to raise 24 SOL; at $400 a SOL the $6k raise is about 15
    run("UPDATE quote SET usd = 400 WHERE mint = ?", NATIVE_MINT);
    const quotes = (await (await app.request("/api/quotes")).json()) as import("@gantry/shared").QuoteAsset[];
    assert.deepEqual(quotes.slice(0, 4).map((q) => [q.symbol, q.available]), [["SOL", false], ["USDC", true], ["USDT", true], ["USD1", true]]);
    assert.ok(Math.abs(quotes[0]!.graduationThreshold - 6006.33 / 400) < 0.001);
    assert.match(quotes[0]!.unavailableReason!, /paused/);
    // the stocks are listed after them, each under its issuer, and a floor on SOL's raise is nothing to them
    const stocks = quotes.filter((q) => q.category === "stock");
    assert.ok(stocks.length > 120 && stocks.every((q) => q.issuer && q.available === (q.unavailableReason === null)));
    assert.ok(stocks.filter((q) => q.group === "xstocks").slice(0, 10).every((q) => q.available), "the liquid ones are open");
    // a stock its issuer has minted but that doesn't trade yet is listed, closed, with the reason
    assert.match(stocks.find((q) => q.usdPerUnit === 0)!.unavailableReason!, /No live USD price/);
    assert.ok(quotes.slice(0, 4).every((q) => q.issuer === null && q.uiMultiplier === 1 && q.group === "crypto" && q.transferFeeBps === 0 && q.transferFeeMax === null));
    const res = await launch();
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /paused/);
  } finally {
    run("UPDATE quote SET usd = ? WHERE mint = ?", live, NATIVE_MINT);
  }
  assert.equal(toQuoteAsset(quoteRow(NATIVE_MINT)!).available, true);
  assert.equal((await launch()).status, 200);
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

  const { mint } = await engine.launch({ ...meta, wallet: creator, name: "Paid", symbol: "PAID", quote: usdc, initialBuy: got.toString() }, "http://x/");
  assert.equal(engine.bal(creator, usdc), usdcBefore, "the whole swap went into the first buy");
  assert.ok(big(one<{ balance: string }>("SELECT balance FROM holder WHERE coin = ? AND wallet = ?", mint, creator)!.balance) > 0n);
  // the same curve in a different quote: $2.5k to start, in USDC
  assert.ok(Math.abs(getCoin(mint)!.start_price * 1e9 * quoteRow(usdc)!.usd - START_MCAP_USD) < 0.01);
});

test("Fleet: a copy pays its entry to the leader's holders and feeds the leader its whole fee split", async () => {
  const { FLEET, fleetKey } = await import("@gantry/shared");
  const { checkLaunch, familyState, runEntries } = await import("./fleet");
  const { createApi } = await import("./api");
  const app = createApi(engine);
  assert.equal(fleetKey("C4T"), "CAT");
  assert.equal(fleetKey("C@T"), "CAT");
  assert.equal(fleetKey("Сat"), "CAT", "a Cyrillic С reads as C");
  assert.equal(fleetKey("0FFICIA1"), fleetKey("Official"));

  const at = Math.floor(Date.now() / 1000);
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
  assert.match(((await refused.json()) as { error: string }).error, /pays the \$500 Fleet entry/);

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
  const capBps = BigInt(Math.max(FLEET.maxShareBps, Math.ceil(10_000 / drops.length)));
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
  assert.ok(copyAfter.fleet_sent_sol > 0 && Math.abs(copyAfter.fleet_sent_sol - ogAfter.fleet_received_sol) < 1e-9);
  // the OG's own fees were split in the same pass, so it gained at least what the copy sent
  assert.ok(gained >= copyAfter.fleet_sent_sol - 1e-9, "the OG's OTC credit and protection pot grew by the copy's fees");
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

test("a coin can launch on a tokenized stock and trade like any other pair, with a quote the issuer has taken off refused", async () => {
  const { createApi } = await import("./api");
  const app = createApi(engine);
  const tsla = one<{ mint: string; usd: number; decimals: number }>("SELECT * FROM quote WHERE symbol = 'TSLAx'")!;
  const launch = (symbol: string) =>
    app.request("/api/tx/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...meta, quote: tsla.mint, wallet: fakeKey(), name: `Stock ${symbol}`, symbol }) });
  const res = await launch("STKA");
  assert.equal(res.status, 200);
  const { mint } = (await res.json()) as { mint: string };
  assert.ok(Math.abs(getCoin(mint)!.price * 1e9 * tsla.usd - START_MCAP_USD) < 0.01, "priced in the stock, it still starts at $2.5k");
  engine.trade(getCoin(mint)!, fakeKey(), "buy", BigInt(Math.floor((300 / tsla.usd) * 10 ** tsla.decimals)), Math.floor(Date.now() / 1000));
  const c = getCoin(mint)!;
  assert.ok(Math.abs(Number(big(c.fees_quote)) / Number(big(c.volume_quote)) - 0.03) < 1e-5, "3% of the trade, in the stock");
  const listed = (await (await app.request("/api/coins?quote=stock")).json()) as { address: string; quote: { issuer: string } }[];
  assert.deepEqual(listed.map((x) => [x.address, x.quote.issuer]), [[mint, "xStocks"]], "the stock pairs can be listed on their own");

  // what the chain engine stores when a quote's mint is paused, or its route to SOL is gone
  for (const column of ["error", "route_error"]) {
    run(`UPDATE quote SET ${column} = 'TSLAx is off for now.' WHERE mint = ?`, tsla.mint);
    const off = await launch("STKB");
    assert.equal(off.status, 400);
    assert.equal(((await off.json()) as { error: string }).error, "TSLAx is off for now. Pick another pair.");
    const q = ((await (await app.request("/api/quotes")).json()) as { symbol: string; available: boolean; unavailableReason: string }[]).find((x) => x.symbol === "TSLAx")!;
    assert.deepEqual([q.available, q.unavailableReason], [false, "TSLAx is off for now."]);
    run(`UPDATE quote SET ${column} = NULL WHERE mint = ?`, tsla.mint);
  }
  assert.equal((await launch("STKC")).status, 200);
});

test("the most protected coins come first, each with what its pot has left, and every payout has a page of its own", async () => {
  const { createApi } = await import("./api");
  const app = createApi(engine);
  type Listed = { address: string; protectionPotSol: number; protectionPotUsd: number };
  const list = (await (await app.request("/api/coins?sort=protected")).json()) as Listed[];
  const pots = all<{ mint: string; pot: number }>("SELECT mint, sol_to_protection - protection_paid AS pot FROM coin WHERE sol_to_protection - protection_paid > 0 AND COALESCE(entry_status, '') != 'unpaid' ORDER BY pot DESC");
  assert.ok(pots.length >= 2, "several coins have paid into the fund by now");
  assert.deepEqual(list.map((c) => c.address), pots.map((p) => p.mint), "by what's left in the pot, largest first; coins with nothing left aren't listed");
  const usd = quoteRow(NATIVE_MINT)!.usd;
  for (const [i, c] of list.entries()) {
    assert.ok(Math.abs(c.protectionPotSol - pots[i]!.pot) < 1e-12);
    assert.ok(Math.abs(c.protectionPotUsd - pots[i]!.pot * usd) < 1e-6, "valued at SOL's price whatever the coin is paired with");
  }
  // every list carries the figure, zero included
  const every = (await (await app.request("/api/coins?sort=new")).json()) as Listed[];
  assert.ok(every.length > list.length && every.every((c) => c.protectionPotSol >= 0 && typeof c.protectionPotUsd === "number"));

  // the coin page's reserve line: the same bid in SOL, in the coin's quote and in USD, with what it will take
  const detail = (await (await app.request(`/api/coins/${list[0]!.address}`)).json()) as import("@gantry/shared").CoinDetail;
  const { otc } = detail;
  assert.ok(Math.abs(otc.sellPrice * detail.quote.solPerUnit - otc.sellPriceSol) < 1e-15 && Math.abs(otc.sellPrice * detail.quote.usdPerUnit - otc.sellPriceUsd) < 1e-12);
  assert.equal(otc.twapReady, otc.sellPrice > 0, "no bid until the coin has the history its average price needs");

  // a payout's page: the loss, what it paid and when, in SOL and in USD at the time of the sale
  const row = one<{ id: string; wallet: string; coin: string; loss_sol: number; amount_sol: number; sol_usd: number; hold: number; tier_bps: number; tx: string }>(
    "SELECT * FROM protection_payout WHERE amount_sol > 0 AND id != 'late' ORDER BY ts LIMIT 1",
  )!;
  const got = await app.request(`/api/payouts/${encodeURIComponent(row.id)}`);
  assert.equal(got.status, 200);
  const p = (await got.json()) as import("@gantry/shared").Payout;
  const coin = getCoin(row.coin)!;
  assert.deepEqual([p.id, p.wallet, p.coin, p.status, p.tx], [row.id, row.wallet, { address: coin.mint, symbol: coin.symbol, name: coin.name, image: coin.image }, "sent", row.tx]);
  assert.deepEqual([p.lossSol, p.payoutSol, p.holdSeconds, p.tierBps], [row.loss_sol, row.amount_sol, row.hold, row.tier_bps]);
  assert.ok(row.sol_usd > 0 && Math.abs(p.lossUsd - row.loss_sol * row.sol_usd) < 1e-9 && Math.abs(p.payoutUsd - row.amount_sol * row.sol_usd) < 1e-9);
  assert.equal(p.coverageBps, Math.round((row.amount_sol / row.loss_sol) * 10_000));
  assert.ok(p.coverageBps <= p.tierBps && p.paidAt! >= p.t);
  // the wallet's own list of covered losses links to it by the same id
  const wallet = (await (await app.request(`/api/wallet/${row.wallet}`)).json()) as import("@gantry/shared").WalletSummary;
  assert.ok(wallet.protection.losses.some((l) => l.id === row.id && l.amountSol === row.amount_sol));
  const recent = (await (await app.request("/api/protection")).json()) as import("@gantry/shared").ProtectionStatus;
  assert.ok(recent.recent.some((l) => l.id === row.id));

  // nothing to show for an id that isn't a payout, or for a loss that was covered with nothing
  assert.equal((await app.request("/api/payouts/nope")).status, 404);
  run("INSERT INTO protection_payout (id, wallet, coin, ts, loss_sol, sol_usd, hold, tier_bps, amount_sol, limit_by) VALUES ('zero', ?, ?, 1, 1, 150, 60, 0, 0, 'rate')", row.wallet, row.coin);
  assert.equal((await app.request("/api/payouts/zero")).status, 404);
});

test("the picker's groups come with their counts, and the list of quotes can be narrowed on the server", async () => {
  const { createApi } = await import("./api");
  const app = createApi(engine);
  type Q = import("@gantry/shared").QuoteAsset;
  const get = async <T>(path: string) => (await (await app.request(path)).json()) as T;
  const every = await get<Q[]>("/api/quotes");
  const groups = await get<import("@gantry/shared").QuoteGroupInfo[]>("/api/quotes/groups");
  assert.deepEqual(groups.map((g) => [g.key, g.label]), [["crypto", "Crypto"], ["xstocks", "xStocks"], ["backpack", "Backpack"], ["prestocks", "PreStocks"], ["tessera", "Tessera"], ["sunrise", "Sunrise"], ["memes", "Memes"]]);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), every.length);
  for (const g of groups) {
    const mine = every.filter((q) => q.group === g.key);
    assert.deepEqual([g.count, g.available], [mine.length, mine.filter((q) => q.available).length], g.key);
    assert.ok(g.available > 0 && g.available <= g.count, g.key);
  }
  assert.deepEqual(every.slice(0, 4).map((q) => q.symbol), ["SOL", "USDC", "USDT", "USD1"], "SOL and the stablecoins open the first group");

  const pre = await get<Q[]>("/api/quotes?group=prestocks");
  assert.ok(pre.length === groups.find((g) => g.key === "prestocks")!.count && pre.every((q) => q.group === "prestocks" && q.issuer === "PreStocks" && q.transferFeeBps === 100 && q.transferFeeMax === null));
  const open = await get<Q[]>("/api/quotes?group=prestocks&available=1");
  assert.ok(open.length > 0 && open.length < pre.length && open.every((q) => q.available), "the ones that don't trade yet are listed, but not as open");
  const nvda = await get<Q[]>("/api/quotes?search=nvda");
  assert.ok(nvda.some((q) => q.symbol === "NVDAx") && nvda.some((q) => q.symbol === "NVDA") && nvda.length < 10);
  assert.deepEqual((await get<Q[]>(`/api/quotes?search=${every[40]!.address}`)).map((q) => q.address), [every[40]!.address], "a mint finds its quote");
  assert.deepEqual(await get<Q[]>("/api/quotes?limit=10&offset=4"), every.slice(4, 14));

  // hundreds of quotes: sent compressed to a client that takes it
  const packed = await app.request("/api/quotes", { headers: { "accept-encoding": "gzip" } });
  assert.equal(packed.headers.get("content-encoding"), "gzip");
  assert.ok((await packed.arrayBuffer()).byteLength * 4 < JSON.stringify(every).length);
});

test("on a real cluster a quote takes launches only once the chain has been read for it and its price is fresh", () => {
  const q = one<import("./db").QuoteRow>("SELECT * FROM quote WHERE symbol = 'TSLAx'")!;
  const t = Math.floor(Date.now() / 1000);
  // the demo goes by the catalog's copies
  assert.equal(unavailableReason(q, false, t), null);
  assert.match(unavailableReason(q, true, t)!, /still being checked/);
  assert.match(unavailableReason({ ...q, checked_at: t, price_at: t - 3600 }, true, t)!, /No live USD price/);
  assert.equal(unavailableReason({ ...q, checked_at: t, price_at: t - 120 }, true, t), null);
  assert.match(unavailableReason({ ...q, checked_at: t, price_at: t, liquidity: 1_200 }, true, t)!, /thinly traded/);
  assert.equal(unavailableReason({ ...q, checked_at: t, price_at: t, error: "TSLAx's issuer has paused its transfers." }, true, t), "TSLAx's issuer has paused its transfers.");
  // listed as open on its liquidity, but a launch waits for an answer on its route to SOL
  assert.equal(unavailableReason({ ...q, checked_at: t, price_at: t, route_at: 0 }, true, t), null);
  assert.match(unavailableReason({ ...q, checked_at: t, price_at: t, route_at: 0 }, true, t, true)!, /couldn't be checked/);
  assert.equal(unavailableReason({ ...q, checked_at: t, price_at: t, route_at: t - 600 }, true, t, true), null);
  assert.match(unavailableReason({ ...q, checked_at: t, price_at: t, route_at: t - 600, route_error: "TSLAx is too thinly traded right now for its fees to be turned into SOL." }, true, t, true)!, /thinly traded/);
});

test("a pair whose quote charges a transfer fee: the wallet's side and the pool's side are booked apart, and the buckets get what arrives", async () => {
  const pre = one<import("./db").QuoteRow>("SELECT * FROM quote WHERE symbol = 'ANTHROPIC' AND grp = 'prestocks'")!;
  assert.equal(pre.fee_bps, 100);
  const cut = (x: bigint) => (x * 100n + 9_999n) / 10_000n;
  const at = Math.floor(Date.now() / 1000) - 600;
  const { mint } = engine.createCoin({ ...meta, quote: pre.mint, wallet: fakeKey(), name: "Fee Pair", symbol: "FEEP" }, "http://x/", at);
  const buyer = fakeKey();
  const amount = BigInt(Math.floor((400 / pre.usd) * 10 ** pre.decimals));
  const had = engine.bal(buyer, pre.mint);

  const quoted = await engine.swapQuote(getCoin(mint)!, "buy", amount, 100);
  const { fill } = engine.trade(getCoin(mint)!, buyer, "buy", amount, at + 60);
  const landed = amount - cut(amount);
  assert.deepEqual([quoted.amountIn, quoted.transferFee, quoted.amountOut], [amount.toString(), cut(amount).toString(), fill.amountOut.toString()]);
  assert.equal(had - engine.bal(buyer, pre.mint), amount, "the wallet paid what it sent");
  assert.equal(fill.tax, (landed * 3n + 99n) / 100n, "the launchpad's 3% is of what reached the curve");
  let c = getCoin(mint)!;
  assert.equal(big(c.quote_reserve) + fill.tax, landed, "and the curve priced that, not what was sent");
  const platformFee = fill.tax - fill.protocol;
  assert.equal(big(c.claimable_quote), platformFee - cut(platformFee), "the platform fee reached its vault less the transfer fee");
  assert.equal(big(one<{ cost_basis: string }>("SELECT cost_basis FROM holder WHERE coin = ? AND wallet = ?", mint, buyer)!.cost_basis), amount, "the buyer's cost is what left the wallet");

  // a sale: the curve pays out, and the seller keeps 99% of it
  const coins = fill.amountOut / 2n;
  const before = engine.bal(buyer, pre.mint);
  const sale = await engine.swapQuote(getCoin(mint)!, "sell", coins, 100);
  engine.trade(getCoin(mint)!, buyer, "sell", coins, at + 120);
  const got = engine.bal(buyer, pre.mint) - before;
  assert.equal(got.toString(), sale.amountOut);
  assert.equal(big(sale.transferFee), cut(got + big(sale.transferFee)), "1% of what the curve sent");

  // the fee wallet claims the vault, losing the fee once more, and splits exactly what arrived
  c = getCoin(mint)!;
  const waiting = big(c.claimable_quote);
  refresh();
  await processFees(engine, at + 180);
  const after = getCoin(mint)!;
  assert.equal(big(after.income_quote), waiting - cut(waiting), "income is what came out of the vault");
  assert.equal(big(after.split_quote), big(after.income_quote));
  assert.equal(engine.bal(engine.wallets.fees, pre.mint), 0n, "all of it was turned into SOL: nothing booked that never arrived");
  assert.ok(after.sol_to_otc > 0 && Math.abs(after.sol_to_otc - after.sol_to_protection) <= 1e-9);
});
