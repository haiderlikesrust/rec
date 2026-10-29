/**
 * Local demo data: 20 coins across ETH / USDG / NVDA / TSLA with two days of trading history,
 * keeper runs along the way (fee processing, airdrops, protection epochs).
 * Requires anvil started ~2 days in the past (see README) with the contracts deployed and the indexer running.
 */
import {
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  maxUint256,
  parseEther,
  parseEventLogs,
  type Address,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { cookRouterAbi, launchpadAbi, launchTokenAbi, NATIVE } from "@cook/shared";
import { createCtx } from "./config";
import { processFees, runAirdrops, runProtectionEpoch, updateQuoteRates } from "./jobs";

const MNEMONIC = "test test test test test test test test test test test junk"; // anvil's public dev mnemonic
const ctx = createCtx();
if (ctx.chain.id !== 31337) throw new Error("seed only runs against the local anvil chain");
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(rpc) });
const pub = ctx.pub;
const d = ctx.d;

// deterministic randomness so every seed looks the same
let s = 0x2f6e2b1;
const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

const traders: HDAccount[] = Array.from({ length: 40 }, (_, i) => mnemonicToAccount(MNEMONIC, { addressIndex: i + 2 }));
const wallets = new Map(traders.map((a) => [a.address, createWalletClient({ chain: ctx.chain, transport: http(rpc), account: a })]));
const deployer = createWalletClient({ chain: ctx.chain, transport: http(rpc), account: mnemonicToAccount(MNEMONIC, { addressIndex: 0 }) });

const QUOTES: Record<string, { address: Address; ethPrice: number; decimals: number }> = {
  ETH: { address: NATIVE, ethPrice: 1, decimals: 18 },
  USDG: { address: d.USDG as Address, ethPrice: 1 / 4000, decimals: 6 },
  NVDA: { address: d.NVDA as Address, ethPrice: 180 / 4000, decimals: 18 },
  TSLA: { address: d.TSLA as Address, ethPrice: 250 / 4000, decimals: 18 },
};

type Kind = "runner" | "steady" | "dump" | "rug" | "dead";
const COINS: { name: string; symbol: string; quote: keyof typeof QUOTES; kind: Kind; about: string }[] = [
  { name: "Orbit Dog", symbol: "ODOG", quote: "ETH", kind: "runner", about: "A good boy in low earth orbit." },
  { name: "Quant Cat", symbol: "QCAT", quote: "USDG", kind: "steady", about: "Backtested on vibes." },
  { name: "Paper Hands", symbol: "PAPER", quote: "ETH", kind: "dump", about: "Sold the bottom so you don't have to." },
  { name: "Diamond Duck", symbol: "DDUCK", quote: "NVDA", kind: "runner", about: "Quacks in tokenized silicon." },
  { name: "Lazy Lion", symbol: "LAZY", quote: "ETH", kind: "dead", about: "Will launch the roadmap after a nap." },
  { name: "Stonk Snail", symbol: "SNAIL", quote: "TSLA", kind: "steady", about: "Slow and steady, paired with TSLA." },
  { name: "Mango Mode", symbol: "MANGO", quote: "ETH", kind: "steady", about: "Tropical risk-on." },
  { name: "Bagholder Bear", symbol: "BAGS", quote: "ETH", kind: "rug", about: "Trust me bro." },
  { name: "Pixel Penguin", symbol: "PPNG", quote: "USDG", kind: "runner", about: "8-bit chill, dollar-denominated." },
  { name: "Night Owl", symbol: "OWL", quote: "ETH", kind: "dump", about: "Only trades after midnight." },
  { name: "Tiny Whale", symbol: "TWHL", quote: "ETH", kind: "steady", about: "Small fish, big dreams." },
  { name: "Volt Bunny", symbol: "VOLT", quote: "NVDA", kind: "steady", about: "Fully charged hops." },
  { name: "Cloud Nine", symbol: "CLD9", quote: "ETH", kind: "runner", about: "Up only (not financial advice)." },
  { name: "Sunday Slots", symbol: "SUNS", quote: "USDG", kind: "dead", about: "Open on weekends only." },
  { name: "Gm Coffee", symbol: "GMC", quote: "ETH", kind: "steady", about: "Brewed fresh every block." },
  { name: "Sir Hops", symbol: "HOPS", quote: "TSLA", kind: "dump", about: "A frog of noble lineage." },
  { name: "Banana Desk", symbol: "BDSK", quote: "ETH", kind: "steady", about: "Desk-tested, monkey-approved." },
  { name: "Moon Mint", symbol: "MINT", quote: "USDG", kind: "steady", about: "Freshly minted, lightly toasted." },
  { name: "Gigachad Turtle", symbol: "GTURT", quote: "ETH", kind: "runner", about: "Shell-shocked into greatness." },
  { name: "Echo Fox", symbol: "ECHO", quote: "ETH", kind: "dead", about: "Echo... echo... echo..." },
];

function avatar(symbol: string, i: number) {
  const hues = [262, 168, 32, 352, 210, 140, 290, 12, 190, 48];
  const h = hues[i % hues.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},85%,62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},80%,45%)"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="url(#g)"/><text x="48" y="58" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="700" fill="white">${symbol.slice(0, 2)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function advance(seconds: number) {
  await test.increaseTime({ seconds: Math.round(seconds) });
  await test.mine({ blocks: 1 });
}

async function write(account: HDAccount, req: Parameters<ReturnType<typeof createWalletClient>["writeContract"]>[0]) {
  const w = wallets.get(account.address) ?? deployer;
  const hash = await w.writeContract({ ...req, account, chain: ctx.chain } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`reverted ${hash}`);
  return r;
}

const quoteAmount = (q: keyof typeof QUOTES, eth: number) =>
  BigInt(Math.floor((eth / QUOTES[q]!.ethPrice) * 10 ** QUOTES[q]!.decimals));

async function buy(who: HDAccount, token: Address, q: keyof typeof QUOTES, eth: number) {
  const amount = quoteAmount(q, eth);
  const deadline = BigInt(Number((await pub.getBlock()).timestamp) + 3600);
  await write(who, {
    abi: cookRouterAbi,
    address: d.router,
    functionName: "buy",
    args: [token, amount, 0n, who.address, deadline],
    value: q === "ETH" ? amount : 0n,
  } as never);
}

const approved = new Set<string>();
async function sell(who: HDAccount, token: Address, fraction: number) {
  const bal = await pub.readContract({ abi: launchTokenAbi, address: token, functionName: "balanceOf", args: [who.address] });
  const amount = (bal * BigInt(Math.floor(fraction * 1000))) / 1000n;
  if (amount === 0n) return false;
  if (!approved.has(`${who.address}${token}`)) {
    await write(who, { abi: launchTokenAbi, address: token, functionName: "approve", args: [d.router, maxUint256] } as never);
    approved.add(`${who.address}${token}`);
  }
  const deadline = BigInt(Number((await pub.getBlock()).timestamp) + 3600);
  await write(who, { abi: cookRouterAbi, address: d.router, functionName: "sell", args: [token, amount, 0n, who.address, deadline] } as never);
  return true;
}

async function holdersOf(token: Address) {
  const balances = await Promise.all(
    traders.map((t) => pub.readContract({ abi: launchTokenAbi, address: token, functionName: "balanceOf", args: [t.address] })),
  );
  return traders.filter((_, i) => balances[i]! > 0n);
}

async function keeperRound() {
  const jobs: [string, () => Promise<unknown>][] = [
    ["rates", () => updateQuoteRates(ctx)],
    ["fees", () => processFees(ctx, 0)],
    ["airdrops", () => runAirdrops(ctx)],
    ["protection", () => runProtectionEpoch(ctx)],
  ];
  // a failed keeper job should not abort the demo timeline
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (e) {
      ctx.log(`${name} failed:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

// ---------------------------------------------------------------- setup

ctx.log("funding 40 trader wallets");
for (const t of traders) {
  await test.setBalance({ address: t.address, value: parseEther("500") });
  for (const q of ["USDG", "NVDA", "TSLA"] as const) {
    const info = QUOTES[q]!;
    await write(mnemonicToAccount(MNEMONIC, { addressIndex: 0 }) as HDAccount, {
      abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] }],
      address: info.address,
      functionName: "mint",
      args: [t.address, quoteAmount(q, 200)],
    } as never);
    await write(t, { abi: erc20Abi, address: info.address, functionName: "approve", args: [d.router, maxUint256] } as never);
    await write(t, { abi: erc20Abi, address: info.address, functionName: "approve", args: [d.launchpad, maxUint256] } as never);
  }
}
await updateQuoteRates(ctx);

// ---------------------------------------------------------------- timeline

type Live = { token: Address; q: keyof typeof QUOTES; kind: Kind; launchedAt: number; creator: HDAccount; rugged: boolean };
const live: Live[] = [];
const fee = await pub.readContract({ abi: launchpadAbi, address: d.launchpad, functionName: "launchFee" });
const chainTime = async () => Number((await pub.getBlock()).timestamp);

for (let i = 0; i < COINS.length; i++) {
  const spec = COINS[i]!;
  await advance(between(45, 100) * 60);
  const creator = traders[i % 12]!;
  const initialEth = spec.kind === "rug" ? 2 : between(0.05, 0.3);
  const initialBuy = quoteAmount(spec.quote, initialEth);
  const r = await write(creator, {
    abi: launchpadAbi,
    address: d.launchpad,
    functionName: "createLaunch",
    args: [
      {
        name: spec.name,
        symbol: spec.symbol,
        meta: { image: avatar(spec.symbol, i), description: spec.about, website: "", twitter: "", telegram: "" },
        quote: QUOTES[spec.quote]!.address,
        initialBuy,
        minTokensOut: 0n,
        snipeExempt: [],
      },
    ],
    value: fee + (spec.quote === "ETH" ? initialBuy : 0n),
  } as never);
  const [launched] = parseEventLogs({ abi: launchpadAbi, logs: r.logs, eventName: "TokenLaunched" });
  live.push({ token: launched!.args.token, q: spec.quote, kind: spec.kind, launchedAt: await chainTime(), creator, rugged: false });
  ctx.log(`launched ${spec.symbol} (${spec.quote}, ${spec.kind})`);

  const bursts = Math.floor(between(10, 18));
  for (let k = 0; k < bursts; k++) {
    await advance(between(1, 7) * 60);
    // recent coins get most of the attention
    const c = live[Math.max(0, live.length - 1 - Math.floor(rand() ** 2 * live.length))]!;
    const age = (await chainTime()) - c.launchedAt;
    const who = pick(traders);
    switch (c.kind) {
      case "runner":
        if (rand() < (age < 6 * 3600 ? 0.85 : 0.6)) await buy(who, c.token, c.q, between(0.2, 1.4));
        else await sell(pick(await holdersOf(c.token)) ?? who, c.token, between(0.2, 0.6));
        break;
      case "steady":
        if (rand() < 0.62) await buy(who, c.token, c.q, between(0.05, 0.5));
        else await sell(pick(await holdersOf(c.token)) ?? who, c.token, between(0.2, 0.8));
        break;
      case "dump":
        if (age < 2 * 3600 && rand() < 0.9) await buy(who, c.token, c.q, between(0.2, 1));
        else if (rand() < 0.8) await sell(pick(await holdersOf(c.token)) ?? who, c.token, between(0.3, 1));
        else await buy(who, c.token, c.q, between(0.05, 0.2));
        break;
      case "rug":
        if (!c.rugged && age > 4 * 3600) {
          await sell(c.creator, c.token, 1);
          c.rugged = true;
        } else if (!c.rugged) await buy(who, c.token, c.q, between(0.1, 0.6));
        else await sell(pick(await holdersOf(c.token)) ?? who, c.token, between(0.5, 1));
        break;
      case "dead":
        if (age < 30 * 60) await buy(who, c.token, c.q, between(0.02, 0.08));
        break;
    }
  }
  if (i % 3 === 2) await keeperRound();
}

// ---------------------------------------------------------------- catch up to wall clock

const lag = Math.floor(Date.now() / 1000) - (await chainTime());
if (lag > 300) await advance(lag - 240);
// a last burst of activity so the 24h stats and charts have fresh data
for (let k = 0; k < 25; k++) {
  await advance(between(5, 9));
  const c = pick(live.filter((l) => l.kind !== "dead"));
  if (rand() < 0.65) await buy(pick(traders), c.token, c.q, between(0.05, 0.6));
  else await sell(pick(await holdersOf(c.token)) ?? pick(traders), c.token, between(0.2, 0.5));
}
await keeperRound();
ctx.log(`seeded ${live.length} coins; chain time ${new Date((await chainTime()) * 1000).toISOString()}`);
