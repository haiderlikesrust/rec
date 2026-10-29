import { serve } from "@hono/node-server";
import { config, loadWallets, log } from "./config";
import { createApi } from "./api";
import type { Engine } from "./engine";
import { processFees, runAirdrops, runProtectionEpoch, sweep } from "./jobs";
import { SYSTEM } from "./ledger";
import { refreshPrices, syncQuotes } from "./prices";
import { treasury } from "./services";

const keys = loadWallets();
for (const k of Object.values(keys)) SYSTEM.add(k.publicKey.toBase58());

syncQuotes();
await refreshPrices();

let engine: Engine;
if (config.demo) {
  const { DemoEngine } = await import("./demo/engine");
  const { seedDemo, startSimulator, refreshTreasury } = await import("./demo/simulate");
  const demo = new DemoEngine(keys);
  engine = demo;
  await seedDemo(demo);
  await refreshTreasury(demo);
  startSimulator(demo);
} else {
  const { ChainEngine } = await import("./chain/engine");
  engine = new ChainEngine(keys);
}
await engine.start();

async function refreshTreasuryBalances() {
  const [fees, otc, protection, airdrop] = await Promise.all(
    (["fees", "otc", "protection", "airdrop"] as const).map((r) => engine.solBalance(engine.wallets[r]).catch(() => NaN)),
  );
  if (!Number.isNaN(fees)) treasury.feesSol = fees!;
  if (!Number.isNaN(otc)) treasury.otcSol = otc!;
  if (!Number.isNaN(protection)) treasury.protectionSol = protection!;
  if (!Number.isNaN(airdrop)) treasury.airdropSol = airdrop!;
}
await refreshTreasuryBalances();

/** Runs `job` every `ms`, never overlapping itself. */
function every(ms: number, name: string, job: () => Promise<unknown> | unknown) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await job();
    } catch (e) {
      log(`${name}: ${(e as Error).message}`);
    } finally {
      busy = false;
    }
  }, ms);
}

every(10_000, "treasury", refreshTreasuryBalances);
every(60_000, "prices", refreshPrices);
every(config.demo ? 30_000 : 120_000, "fees", () => processFees(engine));
every(60_000, "airdrops", () => runAirdrops(engine));
every(300_000, "protection", () => runProtectionEpoch());
every(15_000, "sweep", () => sweep(engine));

serve({ fetch: createApi(engine).fetch, port: config.port });
log(`${config.demo ? "demo" : config.cluster} backend on http://localhost:${config.port}`);
for (const [role, address] of Object.entries(engine.wallets)) log(`  ${role.padEnd(10)} ${address}`);
