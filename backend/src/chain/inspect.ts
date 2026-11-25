// Prints what the indexer reads in a transaction (debug helper): tsx src/chain/inspect.ts <signature> [devnet]
import { Connection } from "@solana/web3.js";
import { clusters, type Cluster } from "@gantry/shared";
import { curveFacts, decodeEvents } from "./events";

const cluster: Cluster = process.argv[3] === "devnet" ? "devnet" : "mainnet-beta";
const conn = new Connection(process.env.RPC_URL ?? clusters[cluster].rpc, "confirmed");
const tx = await conn.getTransaction(process.argv[2]!, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
if (!tx) throw new Error("not found");
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
for (const ev of decodeEvents(tx, cluster)) {
  console.log(json(ev));
  // a curve trade's price depends on the quote's decimals, which this helper doesn't know: SOL's are assumed
  if (ev.kind === "curve") console.log("facts (9 quote decimals)", json(curveFacts(ev, 9)));
}
