import assert from "node:assert/strict";
import { test } from "node:test";
import { LOW_SOL, SLIPPAGE, TOO_LITTLE_TO_COLLECT } from "./errors";

// Shaped like web3.js's SendTransactionError messages (instruction 0 is the priority fee).
const failed = (detail: string, logs: string[]) =>
  `Simulation failed. \nMessage: Transaction simulation failed: ${detail}. \nLogs: \n${JSON.stringify(logs, null, 2)}. \nCatch the \`SendTransactionError\` and call \`getLogs()\` on it for full details.`;

const LAUNCHLAB = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
const rentShort = failed("Error processing Instruction 1: custom program error: 0x1", [
  `Program ${LAUNCHLAB} invoke [1]`,
  "Program log: Instruction: CreatePlatformConfig",
  "Program 11111111111111111111111111111111 invoke [2]",
  "Transfer: insufficient lamports 4000000, need 7461120",
  "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
  `Program ${LAUNCHLAB} failed: custom program error: 0x1`,
]);
const emptyPayer = failed("Attempt to debit an account but found no record of a prior credit.", []);
const priceMoved = failed("Error processing Instruction 3: custom program error: 0x1774", [
  `Program ${LAUNCHLAB} invoke [1]`,
  "Program log: Instruction: BuyExactIn",
  "Program log: AnchorError occurred. Error Code: ExceededSlippage. Error Number: 6004. Error Message: Exceeds desired slippage limit.",
  `Program ${LAUNCHLAB} failed: custom program error: 0x1774`,
]);

test("a fee wallet short on SOL is recognized, whether it can't pay rent or has never been funded", () => {
  for (const msg of [rentShort, emptyPayer]) {
    assert.ok(LOW_SOL.test(msg));
    assert.ok(!SLIPPAGE.test(msg));
  }
});

test("a trade past its slippage limit is recognized by name or by LaunchLab's code", () => {
  assert.ok(SLIPPAGE.test(priceMoved));
  assert.ok(SLIPPAGE.test("transaction 5xYz failed: custom program error: 0x1774"));
  assert.ok(!LOW_SOL.test(priceMoved));
});

test("a harvest of fees too small to collect is recognized, and is not a slippage failure", () => {
  // as mainnet answers a collect on a position that has earned next to nothing
  const dust = failed("Error processing Instruction 3: custom program error: 0x1776", [
    "Program LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE invoke [1]",
    "Program log: Instruction: CollectCpFees",
    "Program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C invoke [2]",
    "Program log: Instruction: Withdraw",
    "Program log: AnchorError thrown in programs/cp-swap/src/instructions/withdraw.rs:125. Error Code: ZeroTradingTokens. Error Number: 6006. Error Message: Given pool token amount results in zero trading tokens.",
    "Program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C failed: custom program error: 0x1776",
  ]);
  assert.ok(TOO_LITTLE_TO_COLLECT.test(dust));
  assert.ok(!SLIPPAGE.test(dust) && !LOW_SOL.test(dust));
  assert.ok(!TOO_LITTLE_TO_COLLECT.test(priceMoved) && !TOO_LITTLE_TO_COLLECT.test(rentShort));
});

test("other failures are neither", () => {
  for (const msg of [
    failed("Error processing Instruction 1: custom program error: 0x1772", ["Program log: AnchorError occurred. Error Code: InvalidInput. Error Number: 6002."]),
    "429 Too Many Requests: {\"jsonrpc\":\"2.0\",\"error\":{\"code\":429,\"message\":\"Too many requests\"}}",
    "transaction 5xYz failed: {\"InstructionError\":[1,{\"Custom\":6000}]}",
  ]) {
    assert.ok(!SLIPPAGE.test(msg), msg);
    assert.ok(!LOW_SOL.test(msg), msg);
  }
});
