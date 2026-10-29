// Pre-creates Meteora DBC configs so the first launch on a pair doesn't wait for one:
//   pnpm --filter @cook/backend setup:configs SOL USDC NVDAX
// Configs are otherwise created on demand, and re-created when a quote's USD price drifts.
import { config, loadWallets } from "../config";
import { all, type QuoteRow } from "../db";
import { refreshPrices, syncQuotes } from "../prices";
import { ChainEngine } from "../chain/engine";

if (config.demo) throw new Error("setup:configs talks to the chain; unset DEMO");
syncQuotes();
await refreshPrices();
const engine = new ChainEngine(loadWallets(false));
const wanted = new Set(process.argv.slice(2).map((s) => s.toUpperCase()));
for (const q of all<QuoteRow>("SELECT * FROM quote WHERE available = 1 AND usd > 0")) {
  if (wanted.size && !wanted.has(q.symbol.toUpperCase())) continue;
  try {
    const cfg = await engine.ensureConfig(q.mint);
    console.log(`${q.symbol.padEnd(12)} ${cfg.address}  (priced at $${cfg.quote_usd})`);
  } catch (e) {
    console.log(`${q.symbol.padEnd(12)} failed: ${(e as Error).message}`);
  }
}
process.exit(0);
