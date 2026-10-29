import assert from "node:assert/strict";
import { test } from "node:test";
import { LOW_SOL, QUOTE_REJECTED } from "./errors";

// Shaped like web3.js's SendTransactionError messages for a createConfig2 transaction (instruction 0 is the priority fee).
const failed = (detail: string, logs: string[]) =>
  `Simulation failed. \nMessage: Transaction simulation failed: ${detail}. \nLogs: \n${JSON.stringify(logs, null, 2)}. \nCatch the \`SendTransactionError\` and call \`getLogs()\` on it for full details.`;

const rentShort = failed("Error processing Instruction 1: custom program error: 0x1", [
  "Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN invoke [1]",
  "Program log: Instruction: CreateConfig",
  "Program 11111111111111111111111111111111 invoke [2]",
  "Transfer: insufficient lamports 4000000, need 5974080",
  "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
  "Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN failed: custom program error: 0x1",
]);
const emptyPayer = failed("Attempt to debit an account but found no record of a prior credit.", []);
const noBadge = failed("Error processing Instruction 1: custom program error: 0x17c0", [
  "Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN invoke [1]",
  "Program log: Instruction: CreateConfig",
  "Program log: AnchorError occurred. Error Code: InvalidTokenBadge. Error Number: 6080. Error Message: Invalid token badge.",
  "Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN failed: custom program error: 0x17c0",
]);

test("a fee wallet short on SOL is not a rejected quote", () => {
  for (const msg of [rentShort, emptyPayer]) {
    assert.ok(LOW_SOL.test(msg));
    assert.ok(!QUOTE_REJECTED.test(msg));
  }
});

test("Meteora rejecting the mint disables the quote, even from the 300 characters the database keeps", () => {
  assert.ok(QUOTE_REJECTED.test(noBadge));
  assert.ok(QUOTE_REJECTED.test(noBadge.slice(0, 300)));
  assert.ok(!LOW_SOL.test(noBadge));
  for (const code of ["0x1778", "0x178c", "0x17c1"]) assert.ok(QUOTE_REJECTED.test(failed(`Error processing Instruction 1: custom program error: ${code}`, [])));
});

test("other failures leave the quote alone", () => {
  for (const msg of [
    failed("Error processing Instruction 1: custom program error: 0x1770", ["Program log: AnchorError occurred. Error Code: MathOverflow."]),
    "429 Too Many Requests: {\"jsonrpc\":\"2.0\",\"error\":{\"code\":429,\"message\":\"Too many requests\"}}",
    "transaction 5xYz failed: {\"InstructionError\":[1,{\"Custom\":6000}]}",
  ]) {
    assert.ok(!QUOTE_REJECTED.test(msg), msg);
    assert.ok(!LOW_SOL.test(msg), msg);
  }
});
