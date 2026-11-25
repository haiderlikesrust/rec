// Sets the platform up on Raydium LaunchLab, once per cluster, ahead of the first launch:
//   pnpm --filter @gantry/backend setup:platform
// The fee wallet creates its platform config (the platform fee, who gets the graduated pools' LP and creator fee,
// which CPMM fee tier they trade on) and the address lookup table launches use: two transactions and about 0.015 SOL
// of rent, however many quotes the catalog has. Run it again after changing the fee policy in
// packages/shared/src/fees.ts: it brings an existing config back in line. The first launch does the same creation on
// demand; this only keeps that launch from waiting on it.
import { PlatformConfig } from "@raydium-io/raydium-sdk-v2";
import { Connection } from "@solana/web3.js";
import { CPMM_TIER } from "@gantry/shared";
import { ChainEngine } from "../chain/engine";
import { config, loadWallets } from "../config";
import { all, type QuoteRow } from "../db";
import { quoteGroupInfo, refreshPrices, syncQuotes, toQuoteAsset } from "../prices";

if (config.demo) throw new Error("setup:platform talks to the chain; unset DEMO");
syncQuotes();
await refreshPrices(true);
const engine = new ChainEngine(loadWallets(false));
await engine.start();
const table = await engine.ensurePlatform(true);

const info = await new Connection(config.rpc, "confirmed").getAccountInfo(engine.platform);
const p = PlatformConfig.decode(info!.data);
const tier = CPMM_TIER[config.cluster];
console.log(`\ncluster          ${config.cluster}`);
console.log(`platform config  ${engine.platform.toBase58()}`);
console.log(`platform fee     ${p.feeRate.toNumber() / 10_000}% of every curve trade, ${p.creatorFeeRate.toNumber() / 10_000}% to creators`);
console.log(`graduated LP     ${p.platformScale.toNumber() / 10_000}% locked for ${p.platformLockNftWallet.toBase58()}, ${p.burnScale.toNumber() / 10_000}% burned`);
console.log(`CPMM tier        ${p.cpConfigId.toBase58()}${p.cpConfigId.toBase58() === tier.config ? ` (index ${tier.index}: ${tier.tradeFeeBps / 100}% + ${tier.creatorFeeBps / 100}% creator fee)` : ""}`);
console.log(`CPMM creator     ${p.platformCpCreator.toBase58()}`);
console.log(`lookup table     ${table.key.toBase58()}  (set LOOKUP_TABLE to this)`);
// the quotes, group by group: how many can be launched on, and why the others can't (their routes to SOL are asked
// for over the first hour the backend runs, so this only knows what the chain and the prices say)
console.log("\nquotes");
const rows = all<QuoteRow>("SELECT * FROM quote ORDER BY rowid").map((q) => ({ q, a: toQuoteAsset(q) }));
for (const g of quoteGroupInfo(rows.map((r) => r.q))) {
  console.log(`  ${g.label}: ${g.available} of ${g.count} open`);
  for (const { q, a } of rows) if (q.grp === g.key && !a.available) console.log(`    ${q.symbol.padEnd(10)} ${q.available ? a.unavailableReason : "no LaunchLab config"}`);
}
process.exit(0);
