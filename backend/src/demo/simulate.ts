import { NATIVE_MINT, brand, type LaunchRequest } from "@cook/shared";
import { config, log } from "../config";
import { all, big, kvGet, kvSet, one, type CoinRow, type HolderRow } from "../db";
import { processFees, runAirdrops, runProtectionEpoch } from "../jobs";
import { SYSTEM, getCoin } from "../ledger";
import { quoteRow } from "../prices";
import { treasury } from "../services";
import { DemoEngine, fakeKey } from "./engine";

/**
 * Demo data: two days of history for a couple dozen coins across SOL, stablecoins and stock pairs, then a live
 * market that keeps trading, launching and paying out while the server runs. Every trade goes through the same
 * engine and ledger as a real one.
 */

/** [name, ticker, quote symbol]; the first two run hot and graduate during the seed. */
const COINS: [string, string, string][] = [
  ["Fishcake", "FISH", "SOL"],
  ["Gigachad Index", "GIGA", "NVDAX"],
  ["Moonpie", "MPIE", "SOL"],
  ["Cyber Shiba", "CSHIB", "USDC"],
  ["Tendies", "TEND", "TSLAX"],
  ["Paper Hands", "PAPER", "SOL"],
  ["Diamond Dog", "DDOG", "SPYX"],
  ["Claude Fan Club", "CFC", "ANTHROPIC"],
  ["Orbital", "ORB", "SOL"],
  ["Pixel Frog", "PFROG", "USDC"],
  ["Chip Bros", "CHIPS", "NVDA"],
  ["Apple Pie", "APIE", "AAPL"],
  ["Sigma Grind", "SIGMA", "SOL"],
  ["Turbo Snail", "TSNL", "USDT"],
  ["Rocket Rat", "RRAT", "TSLA"],
  ["Basket Case", "BSKT", "QQQX"],
  ["Gold Rush", "RUSH", "GLDX"],
  ["Night Owl", "OWL", "SOL"],
  ["Meta Cat", "MCAT", "METAX"],
  ["Soft Serve", "SOFT", "MSFT"],
  ["Prompt Lord", "PRMPT", "OPENAI"],
  ["Lazy Lion", "LION", "SOL"],
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

type Mood = { bias: number; hot: boolean };
const moods = new Map<string, Mood>();
const hot = new Set(COINS.slice(0, 2).map((c) => c[1]));
const mood = (c: CoinRow) => {
  let m = moods.get(c.mint);
  if (!m) moods.set(c.mint, (m = { bias: rand(-0.2, 0.6), hot: hot.has(c.symbol) }));
  m.bias = Math.max(-0.9, Math.min(0.9, m.bias + rand(-0.12, 0.12)));
  if (m.hot && !c.graduated) m.bias = Math.max(m.bias, 0.75);
  return m;
};

function traders(): string[] {
  const saved = kvGet("demo_traders");
  if (saved) return JSON.parse(saved);
  const list = Array.from({ length: 70 }, () => fakeKey());
  kvSet("demo_traders", JSON.stringify(list));
  return list;
}

const quoteMint = (symbol: string) =>
  one<{ mint: string }>("SELECT mint FROM quote WHERE symbol = ? AND available = 1 ORDER BY rowid LIMIT 1", symbol)?.mint ?? NATIVE_MINT;

function launchReq(wallet: string, name: string, symbol: string, quote: string, initialUsd: number): LaunchRequest {
  const q = quoteRow(quote)!;
  return {
    wallet,
    name,
    symbol,
    description: `${name} (${symbol}) is a demo coin paired with ${q.symbol}. Every trade pays 3%, and every fee Recur collects goes back to holders.`,
    image: "",
    website: "",
    twitter: "",
    telegram: "",
    quote,
    initialBuy: BigInt(Math.floor((initialUsd / q.usd) * 10 ** q.decimals)).toString(),
  };
}

/** One market action: a buy or a sell on a coin, sized in USD, by a demo trader. */
function step(engine: DemoEngine, c: CoinRow, wallets: string[], at: number) {
  const m = mood(c);
  const q = quoteRow(c.quote)!;
  const holders = all<HolderRow>("SELECT * FROM holder WHERE coin = ? AND balance != '0'", c.mint).filter((h) => !SYSTEM.has(h.wallet));
  const buyBias = 0.5 + 0.35 * m.bias;
  try {
    if (holders.length === 0 || Math.random() < buyBias) {
      const usd = Math.exp(rand(Math.log(15), Math.log(c.graduated ? 1500 : 450)));
      const amount = BigInt(Math.floor((usd / q.usd) * 10 ** q.decimals));
      engine.trade(c, pick(wallets), "buy", amount, at);
    } else {
      const h = pick(holders);
      const frac = Math.random() < 0.3 ? 1 : rand(0.15, 0.8);
      const amount = (big(h.balance) * BigInt(Math.floor(frac * 1000))) / 1000n;
      if (amount > 0n) engine.trade(c, h.wallet, "sell", amount, at);
    }
  } catch {
    // a demo wallet ran dry; skip
  }
}

export async function seedDemo(engine: DemoEngine) {
  if (one("SELECT 1 FROM coin LIMIT 1")) return;
  const wallets = traders();
  const uri = `${config.publicUrl}/api/metadata/`;
  const end = Math.floor(Date.now() / 1000);
  const start = end - 2 * 86_400;
  log("demo: seeding two days of market history…");

  // the platform token first, on SOL
  const deployer = fakeKey();
  const main = engine.createCoin(launchReq(deployer, brand.name, brand.mainTicker, NATIVE_MINT, 400), uri, start, true);
  const schedule = COINS.map(([name, symbol, quote], i) => ({
    name,
    symbol,
    quote: quoteMint(quote),
    at: start + 1800 + Math.floor((i / COINS.length) * (end - start - 4 * 3600)) + Math.floor(rand(0, 1800)),
  }));

  let nextHour = start + 3600;
  let launched = 0;
  for (let t = start + 60; t < end; t += Math.floor(rand(40, 140))) {
    while (launched < schedule.length && schedule[launched]!.at <= t) {
      const s = schedule[launched++]!;
      engine.createCoin(launchReq(pick(wallets), s.name, s.symbol, s.quote, rand(20, 300)), uri, s.at);
    }
    engine.simNow = t;
    // newer coins trade more
    const coins = all<CoinRow>("SELECT * FROM coin");
    const recent = coins.filter((x) => t - x.created_at < 30 * 3600);
    step(engine, Math.random() < 0.15 ? getCoin(main.mint)! : pick(recent.length ? recent : coins), wallets, t);
    if (t >= nextHour) {
      await refreshTreasury(engine);
      await processFees(engine, t);
      await runAirdrops(engine, t);
      if (t - start > 30 * 3600 && !one("SELECT 1 FROM protection_epoch")) {
        await refreshTreasury(engine);
        runProtectionEpoch(t, true);
      }
      nextHour += 3600;
    }
  }
  engine.simNow = null;
  await refreshTreasury(engine);
  log(`demo: ${one<{ n: number }>("SELECT COUNT(*) AS n FROM coin")!.n} coins, ${one<{ n: number }>("SELECT COUNT(*) AS n FROM trade")!.n} trades`);
}

export async function refreshTreasury(engine: DemoEngine) {
  treasury.feesSol = await engine.solBalance(engine.wallets.fees);
  treasury.otcSol = await engine.solBalance(engine.wallets.otc);
  treasury.protectionSol = await engine.solBalance(engine.wallets.protection);
  treasury.airdropSol = await engine.solBalance(engine.wallets.airdrop);
}

/** The demo market's heartbeat: one trade per tick, a new coin every few minutes. Runs on the leader only. */
export function simulator(engine: DemoEngine) {
  const uri = `${config.publicUrl}/api/metadata/`;
  let n = 0;
  const names = ["Sunny", "Waffle", "Comet", "Pebble", "Mango", "Glitch", "Nova", "Bonk Jr", "Zappy", "Kiwi", "Rook", "Velvet"];
  const quotes = ["SOL", "SOL", "SOL", "USDC", "NVDAX", "TSLAX", "AMD", "SPYX", "ANTHROPIC", "COINX"];
  return () => {
    const wallets = traders();
    const at = Math.floor(Date.now() / 1000);
    const coins = all<CoinRow>("SELECT * FROM coin ORDER BY last_trade_at DESC LIMIT 30");
    if (coins.length) step(engine, pick(coins), wallets, at);
    if (++n % 90 === 0 && one<{ n: number }>("SELECT COUNT(*) AS n FROM coin")!.n < 80) {
      const name = `${pick(names)} ${pick(["Cat", "Coin", "Inu", "Club", "Labs", "Moon"])}`;
      const symbol = name.replace(/[^A-Z]/gi, "").slice(0, 5).toUpperCase();
      try {
        engine.createCoin(launchReq(pick(wallets), name, symbol, quoteMint(pick(quotes)), rand(20, 200)), uri, at);
      } catch {
        // ignore
      }
    }
  };
}
