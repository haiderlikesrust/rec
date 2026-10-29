import { createCtx } from "./config";
import { processFees, runAirdrops, runProtectionEpoch, updateQuoteRates } from "./jobs";

const once = process.argv.includes("--once");
const intervalMs = Number(process.env.KEEPER_INTERVAL_MS ?? 30_000);
const minProcessEth = Number(process.env.MIN_PROCESS_ETH ?? 0.001);

const ctx = createCtx();
ctx.log(`keeper ${ctx.wallet.account.address} on chain ${ctx.chain.id}, indexer ${ctx.indexerUrl}`);

async function tick() {
  const jobs: [string, () => Promise<unknown>][] = [
    ["rates", () => updateQuoteRates(ctx)],
    ["fees", () => processFees(ctx, minProcessEth)],
    ["airdrops", () => runAirdrops(ctx)],
    ["protection", () => runProtectionEpoch(ctx)],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (e) {
      ctx.log(`${name} failed:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

await tick();
if (!once) setInterval(tick, intervalMs);
