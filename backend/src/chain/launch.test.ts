import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Connection } from "@solana/web3.js";
import type { LaunchRequest } from "@gantry/shared";

// an isolated real-mode database; the RPC calls a launch needs are stubbed, so no network
process.env.DB_FILE = ":memory:";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "gantry-launch-test-"));
process.env.CLUSTER = "mainnet-beta";
delete process.env.DEMO;

const { AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } = await import("@solana/web3.js");
const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
const { getPdaLaunchpadConfigId, getPdaLaunchpadPoolId } = await import("@raydium-io/raydium-sdk-v2");
const { default: BN } = await import("bn.js");
const { ENTRY_RENT_LAMPORTS, LAUNCHLAB_PROGRAM_ID, NATIVE_MINT } = await import("@gantry/shared");
const { curveBuy, curveRates, launchCurve } = await import("../curve");
const { quoteRow, syncQuotes } = await import("../prices");
const { ChainEngine } = await import("./engine");

syncQuotes();
const keys = { fees: Keypair.generate(), otc: Keypair.generate(), protection: Keypair.generate() };
const engine = new ChainEngine(keys);
const LAUNCHLAB = new PublicKey(LAUNCHLAB_PROGRAM_ID["mainnet-beta"]);

// what the engine reads from the chain: LaunchLab's config for the quote (mainnet's limits) and our platform config
type Internals = {
  conn: Connection;
  launchConfig: (mint: string) => Promise<unknown>;
  platformInfo: () => Promise<unknown>;
  commonAddresses: () => InstanceType<typeof PublicKey>[];
  quoteAddresses: (mint: string) => InstanceType<typeof PublicKey>[];
  ensurePlatform: () => Promise<unknown>;
};
const e = engine as unknown as Internals;
e.conn.getLatestBlockhash = async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 });
e.conn.getMinimumBalanceForRentExemption = async () => 2_039_280;
e.conn.getAccountInfo = (async () => ({ owner: TOKEN_PROGRAM_ID })) as never;
e.launchConfig = async (mint) => ({
  id: getPdaLaunchpadConfigId(LAUNCHLAB, new PublicKey(mint), 0, 0).publicKey,
  info: {
    curveType: 0,
    tradeFeeRate: new BN(2_500),
    migrateFee: new BN(0),
    minSupplyA: new BN(10_000_000),
    minSellRateA: new BN(200_000),
    minMigrateRateA: new BN(150_000),
    minFundRaisingB: new BN(mint === NATIVE_MINT ? 24_000_000_000 : 1),
  },
});
e.platformInfo = async () => ({ feeRate: new BN(27_500), creatorFeeRate: new BN(0) });
// the table the fee wallet would have created: what every launch names, and what SOL and the stablecoins add
const { all } = await import("../db");
const pinned = all<{ mint: string }>("SELECT mint FROM quote WHERE category IN ('solana', 'currency') ORDER BY rowid").map((q) => q.mint);
const table = new AddressLookupTableAccount({
  key: Keypair.generate().publicKey,
  state: {
    deactivationSlot: 2n ** 64n - 1n,
    lastExtendedSlot: 0,
    lastExtendedSlotStartIndex: 0,
    authority: keys.fees.publicKey,
    addresses: [...e.commonAddresses(), ...pinned.flatMap((m) => e.quoteAddresses(m))],
  },
});
assert.equal(table.state.addresses.length, 19, "a table this small serves the whole catalog");
e.ensurePlatform = async () => table;

const request = (over: Partial<LaunchRequest>): LaunchRequest => ({
  wallet: Keypair.generate().publicKey.toBase58(),
  // the longest the API lets through: 32 bytes of name, 10 of ticker
  name: "A name as long as names can get!",
  symbol: "TENLETTERS",
  description: "",
  image: "",
  website: "",
  twitter: "",
  telegram: "",
  quote: NATIVE_MINT,
  initialBuy: "0",
  ...over,
});
const URI = "https://a-launchpad-domain.example/api/metadata/";
const u64 = (b: Uint8Array, o: number) => Buffer.from(b).readBigUInt64LE(o);

async function build(over: Partial<LaunchRequest>, entry?: { raw: bigint; to: string }) {
  const req = request(over);
  const res = await engine.launch(req, URI, entry);
  const raw = Buffer.from(res.tx!, "base64");
  const tx = VersionedTransaction.deserialize(raw);
  const ixs = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: [table] }).instructions;
  return { req, res, raw, tx, ixs, user: new PublicKey(req.wallet), mint: new PublicKey(res.mint) };
}

test("a launch with a first buy and a Fleet entry is one transaction: create, buy, hand the entry to the fee wallet", async () => {
  const sol = quoteRow(NATIVE_MINT)!;
  const entry = { raw: BigInt(Math.ceil((500 / sol.usd) * 1e9)), to: Keypair.generate().publicKey.toBase58() };
  const initialBuy = 2n * 10n ** 9n;
  const { res, raw, tx, ixs, user, mint } = await build({ initialBuy: initialBuy.toString() }, entry);

  assert.ok(raw.length <= 1232, `fits in one packet: ${raw.length} bytes`);
  assert.equal(tx.message.version, 0);
  assert.equal(tx.message.addressTableLookups.length, 1, "the accounts that never change come from the platform's lookup table");
  // the user pays and signs; the new mint's key has already signed
  assert.deepEqual(tx.message.staticAccountKeys.slice(0, 2).map(String), [user.toBase58(), mint.toBase58()]);
  assert.equal(tx.message.header.numRequiredSignatures, 2);
  assert.ok(tx.signatures[0]!.every((b) => b === 0) && tx.signatures[1]!.some((b) => b !== 0));
  assert.equal(res.pool, getPdaLaunchpadPoolId(LAUNCHLAB, mint, new PublicKey(NATIVE_MINT)).publicKey.toBase58());

  const programs = ixs.map((ix) => ix.programId.toBase58());
  const [SYS, TOKEN, ATA, CB] = [SystemProgram.programId, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, ComputeBudgetProgram.programId].map(String) as [string, string, string, string];
  // budget ×2, create the coin and its curve, the buyer's coin account, wrap SOL ×2, buy, unwrap what's left,
  // the fee wallet's coin account, the entry's coins, rent for the accounts they'll be airdropped into
  assert.deepEqual(programs, [CB, CB, LAUNCHLAB.toBase58(), ATA, SYS, TOKEN, LAUNCHLAB.toBase58(), TOKEN, ATA, TOKEN, SYS]);

  // the curve it asks LaunchLab for: 1B supply, the share sold and the raise for $2.5k → $25k at SOL's price,
  // migrating to CPMM, nothing locked, and the pool's creator fee in the quote only
  const init = ixs[2]!;
  const curve = launchCurve(sol.usd, 9);
  const params = init.data.subarray(init.data.length - 51);
  assert.deepEqual([params[0], u64(params, 1), u64(params, 9), u64(params, 17), params[25]], [0, curve.supply, curve.sell, curve.raise, 1]);
  assert.deepEqual([u64(params, 26), u64(params, 34), u64(params, 42), params[50]], [0n, 0n, 0n, 0]);
  assert.deepEqual([init.keys[0]!.pubkey, init.keys[1]!.pubkey, init.keys[3]!.pubkey].map(String), [user.toBase58(), user.toBase58(), engine.platform.toBase58()], "the user pays and is the creator, under our platform");

  // one buy for the creator's amount and the entry together, straight after the create
  const buy = ixs[6]!;
  assert.deepEqual([u64(buy.data, 8), u64(buy.data, 16), u64(buy.data, 24)], [initialBuy + entry.raw, 0n, 0n]);
  const wrapped = ixs[4]!.keys[1]!.pubkey;
  assert.ok(buy.keys[6]!.pubkey.equals(wrapped), "paid from the SOL wrapped for it");
  assert.equal(SystemProgram.programId.toBase58(), SYS);

  // the entry's coins are what its amount buys first on the fresh curve, and go to the fee wallet in the same transaction
  const fresh = { virtualBase: curve.virtualBase, virtualQuote: curve.virtualQuote, sold: 0n, raised: 0n, sell: curve.sell };
  const moved = ixs[9]!;
  assert.equal(u64(moved.data, 1), curveBuy(fresh, entry.raw, curveRates).amountOut);
  assert.ok(moved.keys[2]!.pubkey.equals(getAssociatedTokenAddressSync(mint, keys.fees.publicKey)));
  assert.ok(u64(moved.data, 1) < curveBuy(fresh, initialBuy + entry.raw, curveRates).amountOut, "the creator keeps the rest of the buy");
  const rent = ixs[10]!;
  assert.ok(rent.keys[1]!.pubkey.equals(keys.fees.publicKey));
  assert.equal(Number(u64(rent.data, 4)), ENTRY_RENT_LAMPORTS);
});

test("a launch on a stablecoin pays its first buy from the launcher's own token account, and one with no buy only creates", async () => {
  const usdc = quoteRow("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")!;
  const { raw, ixs, user } = await build({ quote: usdc.mint, initialBuy: "25000000" });
  assert.ok(raw.length <= 1232);
  const names = ixs.map((ix) => ix.programId.toBase58());
  assert.equal(names.filter((p) => p === LAUNCHLAB.toBase58()).length, 2);
  assert.ok(!names.includes(SystemProgram.programId.toBase58()), "nothing to wrap");
  const buy = ixs[ixs.length - 1]!;
  assert.ok(buy.keys[6]!.pubkey.equals(getAssociatedTokenAddressSync(new PublicKey(usdc.mint), user)));
  const curve = launchCurve(usdc.usd, 6);
  const init = ixs[2]!;
  assert.equal(u64(init.data.subarray(init.data.length - 51), 17), curve.raise, "the same curve, raised in USDC");

  const bare = await build({});
  assert.deepEqual(bare.ixs.map((ix) => ix.programId.toBase58()).slice(2), [LAUNCHLAB.toBase58()]);
});

test("a launch on any other quote names its three accounts itself and still fits in one transaction, Token-2022 quotes included", async () => {
  const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
  const programs = (engine as unknown as { tokenPrograms: Map<string, InstanceType<typeof PublicKey>> }).tokenPrograms;
  // an xStock (8 decimals), a Backpack stock (6), and a pre-IPO stock token (9 decimals, 1% transfer fee): each with
  // the longest name and ticker, a first buy and a Fleet entry, which is as large as a launch gets off SOL
  for (const [symbol, group] of [["TSLAx", "xstocks"], ["NVDA", "backpack"], ["ANTHROPIC", "prestocks"]] as const) {
    const q = all<{ mint: string; usd: number; decimals: number; fee_bps: number }>("SELECT * FROM quote WHERE symbol = ? AND grp = ?", symbol, group)[0]!;
    programs.set(q.mint, TOKEN_2022_PROGRAM_ID);
    const raw = (usd: number) => BigInt(Math.ceil((usd / q.usd) * 10 ** q.decimals));
    const entry = { raw: raw(500), to: Keypair.generate().publicKey.toBase58() };
    const { raw: wire, tx, ixs, user, mint } = await build({ quote: q.mint, initialBuy: raw(250).toString() }, entry);

    assert.ok(wire.length <= 1232, `${symbol}: fits in one packet at ${wire.length} bytes`);
    assert.ok(wire.length <= 1160, `${symbol}: with room to spare (${wire.length} bytes)`);
    assert.deepEqual(tx.message.addressTableLookups.map((l) => l.accountKey.toBase58()), [table.key.toBase58()]);
    // the quote's mint, its config and the platform's vault for it ride in the transaction; the Token-2022 program is in the table
    const fixed = tx.message.staticAccountKeys.map(String);
    for (const k of e.quoteAddresses(q.mint).map(String)) assert.ok(fixed.includes(k), `${symbol}: ${k} is named by the transaction`);
    assert.ok(!fixed.includes(TOKEN_2022_PROGRAM_ID.toBase58()));

    const lab = ixs.filter((ix) => ix.programId.equals(LAUNCHLAB));
    assert.equal(lab.length, 2, "create, then one buy for the first buy and the entry together");
    const [init, buy] = lab as [typeof lab[0], typeof lab[0]];
    // in LaunchLab's account lists the coin's token program comes 12th and the quote's 13th, creating and buying alike
    assert.ok(init.keys[12]!.pubkey.equals(TOKEN_2022_PROGRAM_ID) && init.keys[11]!.pubkey.equals(TOKEN_PROGRAM_ID), "a classic SPL coin on a Token-2022 quote");
    assert.ok(buy.keys[12]!.pubkey.equals(TOKEN_2022_PROGRAM_ID) && buy.keys[11]!.pubkey.equals(TOKEN_PROGRAM_ID));
    assert.ok(buy.keys[6]!.pubkey.equals(getAssociatedTokenAddressSync(new PublicKey(q.mint), user, false, TOKEN_2022_PROGRAM_ID)), "paid from the launcher's Token-2022 account");
    assert.deepEqual([u64(buy.data, 8), u64(buy.data, 16)], [raw(250) + entry.raw, 0n], "the launcher sends the first buy and the entry as asked");
    const curve = launchCurve(q.usd, q.decimals);
    const params = init.data.subarray(init.data.length - 51);
    assert.deepEqual([u64(params, 1), u64(params, 9), u64(params, 17)], [curve.supply, curve.sell, curve.raise], "the same curve, raised in the quote");
    // the entry's coins are plain SPL, like every coin: what its amount buys first once the quote's transfer fee is off it
    const moved = ixs[ixs.length - 2]!;
    assert.ok(moved.programId.equals(TOKEN_PROGRAM_ID) && moved.keys[2]!.pubkey.equals(getAssociatedTokenAddressSync(mint, keys.fees.publicKey)));
    const fresh = { virtualBase: curve.virtualBase, virtualQuote: curve.virtualQuote, sold: 0n, raised: 0n, sell: curve.sell };
    const lands = entry.raw - (q.fee_bps ? (entry.raw * BigInt(q.fee_bps) + 9_999n) / 10_000n : 0n);
    assert.equal(q.fee_bps, symbol === "ANTHROPIC" ? 100 : 0);
    assert.equal(u64(moved.data, 1), curveBuy(fresh, lands, curveRates).amountOut, `${symbol}: the entry's coins`);
  }
});

test("a quote LaunchLab has no room for at today's price is refused before anything is built", async () => {
  // SOL's config wants 24 SOL raised: at $400 a SOL the curve's $6k is about 15
  const { run } = await import("../db");
  const live = quoteRow(NATIVE_MINT)!.usd;
  run("UPDATE quote SET usd = 400 WHERE mint = ?", NATIVE_MINT);
  try {
    await assert.rejects(build({}), /at least 24 SOL/);
  } finally {
    run("UPDATE quote SET usd = ? WHERE mint = ?", live, NATIVE_MINT);
  }
});
