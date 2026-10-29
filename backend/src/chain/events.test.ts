import assert from "node:assert/strict";
import { test } from "node:test";
import { Connection, PublicKey } from "@solana/web3.js";
import { DBC_PROGRAM_ID } from "@cook/shared";
import { decodeEvents, swapsOf } from "./events";

/**
 * Decodes real Meteora DBC swaps from mainnet (read-only). Needs network access, so it only runs with
 * NETWORK_TESTS=1; set MAINNET_RPC to use your own RPC instead of the rate-limited public one.
 */
test("decodes live DBC swap events from mainnet", { skip: process.env.NETWORK_TESTS !== "1" }, async () => {
  const conn = new Connection(process.env.MAINNET_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const sigs = await conn.getSignaturesForAddress(new PublicKey(DBC_PROGRAM_ID), { limit: 25 });
  let swaps = 0;
  for (const s of sigs.filter((x) => !x.err).slice(0, 12)) {
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
    if (!tx) continue;
    for (const { ev, facts: f } of swapsOf(decodeEvents(tx))) {
      swaps++;
      assert.ok(f.quoteAmount > 0n && f.tokenAmount > 0n, `amounts in ${s.signature}`);
      assert.ok(f.tax > 0n && f.tax < f.quoteAmount, `fee below the trade in ${s.signature}`);
      // the fee is a sane share of the trade: Meteora caps it at 99%, launchpads charge ~0.25–10%
      const bps = Number((f.tax * 10_000n) / f.quoteAmount);
      assert.ok(bps >= 1 && bps <= 9900, `fee ${bps} bps in ${s.signature}`);
      assert.ok(f.sqrtQ64 > 0n);
      console.log(`${ev.name} ${f.isBuy ? "buy " : "sell"} quote=${f.quoteAmount} tokens=${f.tokenAmount} fee=${bps}bps`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(swaps > 0, "expected at least one swap among recent DBC transactions");
});
