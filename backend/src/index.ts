import { serve } from "@hono/node-server";
import { config, loadWallets, log } from "./config";
import { createApi } from "./api";
import { db } from "./db";
import type { Engine, Job } from "./engine";
import { processFees, runAirdrops, runProtectionEpoch, sweep } from "./jobs";
import { lease, releaseLease, renewLease } from "./lease";
import { SYSTEM } from "./ledger";
import { refreshPrices, syncQuotes } from "./prices";
import { treasury } from "./services";

const keys = loadWallets();
for (const k of Object.values(keys)) SYSTEM.add(k.publicKey.toBase58());

syncQuotes();
await refreshPrices();

let engine: Engine;
/** Runs once, the first time this server becomes the leader. */
let onLead = async () => {};
const extraJobs: Job[] = [];
if (config.demo) {
  const { DemoEngine } = await import("./demo/engine");
  const { seedDemo, simulator } = await import("./demo/simulate");
  const demo = new DemoEngine(keys);
  engine = demo;
  onLead = () => seedDemo(demo);
  extraJobs.push({ name: "market", ms: 2500, run: simulator(demo) });
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

const server = serve({ fetch: createApi(engine).fetch, port: config.port });
log(`${config.demo ? "demo" : config.cluster} backend on http://localhost:${config.port}`);
for (const [role, address] of Object.entries(engine.wallets)) log(`  ${role.padEnd(10)} ${address}`);

// ---------------------------------------------------------------- background work (leader only)

const timers: NodeJS.Timeout[] = [];
let running = 0;

/** Runs `job` every `ms` (never overlapping itself); leader-only jobs skip while this server is on standby. */
function every(job: Job, leaderOnly = true) {
  let busy = false;
  timers.push(
    setInterval(async () => {
      if (busy || lease.state === "stopping" || (leaderOnly && lease.state !== "leader")) return;
      busy = true;
      running++;
      try {
        await job.run();
      } catch (e) {
        log(`${job.name}: ${(e as Error).message}`);
      } finally {
        busy = false;
        running--;
      }
    }, job.ms),
  );
}

every({ name: "treasury", ms: 10_000, run: refreshTreasuryBalances }, false);
for (const job of [
  { name: "prices", ms: 60_000, run: refreshPrices },
  // burns and airdrops run continuously: these loop every few seconds
  { name: "fees", ms: config.feesEveryMs, run: () => processFees(engine) },
  { name: "airdrops", ms: config.airdropsEveryMs, run: () => runAirdrops(engine) },
  { name: "protection", ms: 60_000, run: () => runProtectionEpoch() },
  { name: "sweep", ms: 15_000, run: () => sweep(engine) },
  ...engine.jobs(),
  ...extraJobs,
])
  every(job);

let led = false;
async function heartbeat() {
  const was = lease.state;
  const leader = renewLease();
  if (leader && was !== "leader") log(was === "starting" ? "leader: running background work" : "leader: took over background work");
  if (!leader && was !== "standby") log("standby: another server holds the lease; serving the API until it hands over");
  if (leader && !led) {
    led = true;
    running++;
    try {
      await onLead();
    } finally {
      running--;
    }
  }
}
await heartbeat();
timers.push(setInterval(() => void heartbeat().catch((e) => log(`lease: ${(e as Error).message}`)), 2000));

// ---------------------------------------------------------------- graceful hand-over

/**
 * On SIGTERM (Swarm stopping the old container after the new one is healthy): stop starting new work, let the
 * running job finish (8 s cap), release the lease so the standby takes over within ~2 s, finish open requests,
 * then close the database.
 */
async function shutdown(signal: string) {
  if (lease.state === "stopping") return;
  log(`${signal}: handing over`);
  const wasLeader = lease.state === "leader";
  lease.state = "stopping";
  for (const t of timers) clearInterval(t);
  const deadline = Date.now() + 8000;
  while (running > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  if (wasLeader) releaseLease();
  setTimeout(() => process.exit(0), 5000).unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
// a parent process (tests, supervisors on platforms without POSIX signals) can ask for the same hand-over
process.on("message", (m) => m === "shutdown" && void shutdown("shutdown message"));
