import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Connection } from "@solana/web3.js";
import type { CoinRow, OtcQuoteRow } from "../db";

// an isolated real-mode database; the RPC calls the OTC transaction needs are stubbed, so no network
process.env.DB_FILE = ":memory:";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "recur-otc-test-"));
process.env.CLUSTER = "mainnet-beta";
delete process.env.DEMO;

const { Keypair, SystemProgram, Transaction } = await import("@solana/web3.js");
const { TOKEN_PROGRAM_ID, TokenInstruction, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
const { NATIVE_MINT } = await import("@cook/shared");
const { ChainEngine } = await import("./engine");

const keys = { fees: Keypair.generate(), otc: Keypair.generate(), protection: Keypair.generate(), airdrop: Keypair.generate() };
const engine = new ChainEngine(keys);
const conn = (engine as unknown as { conn: Connection }).conn;
conn.getLatestBlockhash = async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 });
conn.getAccountInfo = (async () => ({ owner: TOKEN_PROGRAM_ID })) as never;

test("an OTC sale pays the seller and burns the coins in the same transaction, signed by the reserve", async () => {
  const seller = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const coins = 123_456_789n;
  const q = { id: "q1", wallet: seller.toBase58(), side: "sell", amount_in: coins.toString(), amount_out: "970000000", tax: "30000000" } as OtcQuoteRow;
  const c = { mint: mint.toBase58(), decimals: 6, quote: NATIVE_MINT } as CoinRow;

  const env = await engine.otcTx(q, c);
  const tx = Transaction.from(Buffer.from(env.tx!, "base64"));
  const otcAta = getAssociatedTokenAddressSync(mint, keys.otc.publicKey, true, TOKEN_PROGRAM_ID);

  const token = tx.instructions.filter((i) => i.programId.equals(TOKEN_PROGRAM_ID));
  assert.deepEqual(
    token.map((i) => i.data[0]),
    [TokenInstruction.TransferChecked, TokenInstruction.BurnChecked],
    "the coins move to the reserve, then the reserve burns them",
  );
  const burn = token[1]!;
  assert.ok(burn.keys[0]!.pubkey.equals(otcAta), "burned from the reserve's token account");
  assert.ok(burn.keys[1]!.pubkey.equals(mint));
  assert.ok(burn.keys[2]!.pubkey.equals(keys.otc.publicKey) && burn.keys[2]!.isSigner, "the reserve signs the burn");
  assert.equal(burn.data.readBigUInt64LE(1), coins, "exactly the coins it bought");

  const payouts = tx.instructions.filter((i) => i.programId.equals(SystemProgram.programId));
  assert.equal(payouts.length, 2, "seller and fee wallet are paid in the same transaction");
  assert.ok(tx.signatures.some((s) => s.publicKey.equals(keys.otc.publicKey) && s.signature), "the reserve already co-signed");

  await assert.rejects(engine.otcTx({ ...q, side: "buy" } as unknown as OtcQuoteRow, c), /only buys/);
});
