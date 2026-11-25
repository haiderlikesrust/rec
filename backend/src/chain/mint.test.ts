import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as spl from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { inspectMint } from "./mint";

// mint accounts as they were on mainnet (Nov 2026): USDC, an xStock, a Backpack stock, and two pre-IPO stock tokens
const saved = JSON.parse(readFileSync(new URL("./fixtures/mints.json", import.meta.url), "utf8")) as Record<string, { address: string; owner: string; data: string }>;
const inspect = (symbol: string, registered: boolean) => {
  const m = saved[symbol]!;
  // epoch 1096: when the accounts were saved
  return inspectMint(symbol, new PublicKey(m.address), { owner: new PublicKey(m.owner), data: Buffer.from(m.data, "base64"), executable: false, lamports: 1 }, registered, 1096);
};

test("a classic SPL quote needs no looking into", () => {
  assert.deepEqual(inspect("USDC", false), { scale: 1, fee: null, trouble: null });
});

test("a tokenized stock takes launches while CPMM's registry has its mint, and not without it", () => {
  // freeze authority, permanent delegate, pausable, a transfer hook that isn't set: nothing a pool can't trade
  assert.deepEqual(inspect("TSLAx", true), { scale: 1, fee: null, trouble: null });
  // but those extensions are outside CPMM's own list, so only the registry lets a curve on it graduate
  assert.match(inspect("TSLAx", false).trouble!, /could never graduate/);
});

test("a stock that scales its displayed amounts reports the multiplier its market price has to be multiplied by", () => {
  const sndk = inspect("SNDK", true);
  assert.equal(sndk.trouble, null);
  assert.ok(Math.abs(sndk.scale - 8) < 1e-6, `one raw token shows as ${sndk.scale}`);
});

test("a quote whose mint charges a transfer fee is read with its fee, and takes launches while the fee is modest", () => {
  // a pre-IPO stock token: 1% of every transfer, no cap; its other extensions need CPMM's registry
  const anthropic = inspect("ANTHROPIC", true);
  assert.deepEqual([anthropic.fee?.bps, anthropic.fee?.max, anthropic.trouble], [100, 2n ** 64n - 1n, null]);
  assert.match(inspect("ANTHROPIC", false).trouble!, /could never graduate/);
  // 0.2%, and nothing on its mint that CPMM doesn't take as it is
  const kalshi = inspect("tKalshi", false);
  assert.deepEqual([kalshi.fee?.bps, kalshi.trouble], [20, null]);
});

test("a transfer fee above the limit holds a quote back", () => {
  const { TOKEN_2022_PROGRAM_ID, getTransferFeeConfig, unpackMint } = spl;
  // the same mint with its fee raised to 6% for the next epoch on
  const m = saved["tKalshi"]!;
  const data = Buffer.from(m.data, "base64");
  const config = getTransferFeeConfig(unpackMint(new PublicKey(m.address), { owner: TOKEN_2022_PROGRAM_ID, data, executable: false, lamports: 1 }, TOKEN_2022_PROGRAM_ID))!;
  // the newer fee's rate is the last two bytes of the extension: found by the older rate that precedes its epoch and cap
  const at = data.lastIndexOf(Buffer.from([config.newerTransferFee.transferFeeBasisPoints & 0xff, config.newerTransferFee.transferFeeBasisPoints >> 8]));
  data.writeUInt16LE(600, at);
  const raised = inspectMint("tKalshi", new PublicKey(m.address), { owner: TOKEN_2022_PROGRAM_ID, data, executable: false, lamports: 1 }, true, 1096);
  assert.match(raised.trouble!, /6% of every transfer/);
});
