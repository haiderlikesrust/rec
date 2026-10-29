// Prints decoded Meteora events for a signature (debug helper): tsx src/chain/inspect.ts <signature>
import { Connection } from "@solana/web3.js";
import { decodeEvents, swapFacts } from "./events";

const conn = new Connection(process.env.MAINNET_RPC ?? "https://api.mainnet-beta.solana.com", "confirmed");
const tx = await conn.getTransaction(process.argv[2]!, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
if (!tx) throw new Error("not found");
for (const ev of decodeEvents(tx)) {
  console.log(ev.program, ev.name, JSON.stringify(ev.data, (_, v) => (v && typeof v === "object" && v.constructor?.name === "BN" ? v.toString() : v?._bn ? v.toBase58?.() : v)));
  console.log("facts", JSON.stringify(swapFacts(ev), (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}
