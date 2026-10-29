// Creates the four backend wallets (data/wallets/*.json, gitignored) if missing and prints their addresses.
// Fund the fee wallet with a little SOL for network fees and config rent before going live.
import { Connection } from "@solana/web3.js";
import { config, loadWallets, roles } from "../config";

const keys = loadWallets(true);
const conn = new Connection(config.rpc, "confirmed");
console.log(`cluster ${config.cluster}\n`);
for (const r of roles) {
  const pk = keys[r.role].publicKey;
  const sol = await conn
    .getBalance(pk)
    .then((l) => (l / 1e9).toFixed(4))
    .catch(() => "?");
  console.log(`${r.label.padEnd(36)} ${pk.toBase58()}  ${sol} SOL`);
}
console.log(`\nKeys live in ${config.dataDir}/wallets. Back them up, or set FEE_WALLET, OTC_WALLET, PROTECTION_WALLET and AIRDROP_WALLET.`);
