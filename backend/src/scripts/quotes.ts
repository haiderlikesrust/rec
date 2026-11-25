// Rebuilds the catalog of quote assets from what LaunchLab accepts on mainnet:
//   pnpm --filter @gantry/backend quotes:sync
// Raydium creates LaunchLab's global configs, one per quote mint, and adds to them over time. This reads every
// constant-product one, the mint behind it, CPMM's registry entry for that mint and Jupiter's record of the token,
// sorts the tokens into the pair picker's groups, and writes packages/shared/src/quotes.generated.ts. Nothing is
// sent anywhere: it only reads (a few dozen RPC and Jupiter requests, about a minute). Review the diff it leaves.
//
// A token is listed when its identity is established: its mint is controlled by a known issuer of tokenized stocks,
// or Jupiter lists it as verified. The rest (mostly look-alikes of listed tickers) are left out. Whether a listed
// token can be launched on at a given moment is decided at run time, from the chain; the reason one couldn't when
// this ran is written down with it, so the demo, which reads no chain, shows the same.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchpadConfig, type LaunchpadConfigInfo } from "@raydium-io/raydium-sdk-v2";
import { unpackMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { CPMM_PROGRAM_ID, LAUNCHLAB_PROGRAM_ID, NATIVE_MINT, clusters, quoteGroups, type QuoteGroup } from "@gantry/shared";
import { config } from "../config";
import { inspectMint } from "../chain/mint";
import { launchLimits, shapeTrouble } from "../chain/params";

const MAINNET = "mainnet-beta";
const conn = new Connection(config.cluster === MAINNET ? config.rpc : clusters[MAINNET].rpc, "confirmed");
const launchLab = new PublicKey(LAUNCHLAB_PROGRAM_ID[MAINNET]);
const cpmm = new PublicKey(CPMM_PROGRAM_ID[MAINNET]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- who a token is

/** Issuers of tokenized stocks, each known by the authority it holds over every one of its mints. */
const ISSUERS: { group: QuoteGroup; authority: string; over: "mint" | "freeze"; suffix: RegExp }[] = [
  { group: "xstocks", authority: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj", over: "mint", suffix: / xStock$/ },
  { group: "backpack", authority: "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a", over: "freeze", suffix: / - Backpack Securities$/ },
  { group: "prestocks", authority: "WV9PJN7XTmTLVwbutCLFxp8TyePee6Xq5mRq6Fti5Wc", over: "mint", suffix: / PreStocks$/ },
  { group: "tessera", authority: "EXvTtxurWBUNNCtLojaN8ZBJFNJPZFSH3szoih9hh7YW", over: "mint", suffix: /$^/ },
];
/** Where Jupiter says a token was minted, for the launchpads that mint memecoins. */
const MEME_LAUNCHPADS = new Set(["pump.fun", "letsbonk.fun", "stonkfun", "bags.fun", "Believe", "slerfpad"]);
/** Quotes this launchpad doesn't offer, whatever LaunchLab accepts. */
const NOT_OFFERED = new Set(["METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL"]);
/** SOL and the stablecoins kept by hand at the head of the catalog (quotes.ts). */
const PINNED = new Set([NATIVE_MINT, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB"]);

type JupToken = { id: string; name?: string; symbol?: string; usdPrice?: number; liquidity?: number; tags?: string[]; launchpad?: string };

async function retry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= 5) throw new Error(`${what}: ${(e as Error).message}`);
      await sleep(3000 * (i + 1));
    }
  }
}

async function accounts(keys: PublicKey[]) {
  const out: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
  for (let i = 0; i < keys.length; i += 100) {
    out.push(...(await retry("accounts", () => conn.getMultipleAccountsInfo(keys.slice(i, i + 100)))));
    await sleep(300);
  }
  return out;
}

/** Jupiter's token records, a hundred mints per request (it answers for no more). */
async function jupiter(mints: string[]) {
  const out = new Map<string, JupToken>();
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const got = await retry("Jupiter", async () => {
      const res = await fetch(`${config.jupiterApi}/tokens/v2/search?query=${batch.join(",")}`, { headers: config.jupiterKey ? { "x-api-key": config.jupiterKey } : {}, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as JupToken[];
    });
    for (const t of got) if (batch.includes(t.id)) out.set(t.id, t);
    await sleep(1500);
  }
  return out;
}

/**
 * The tokens Sunrise brought to Solana, from the token list its own app publishes: the mints it marks as its own
 * launches that aren't stocks (those are Backpack's, listed under their issuer). Empty when the page can't be read
 * or has changed shape, which the summary says.
 */
async function sunrise() {
  const out = new Set<string>();
  try {
    const page = (await (await fetch("https://app.sunrise.xyz/tokens", { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) })).text()).split('\\"').join('"');
    for (const m of page.matchAll(/"tokenAddress":"([1-9A-HJ-NP-Za-km-z]{32,44})"((?:(?!"tokenAddress").){0,700}?)"assetClass":"(\w+)","categories":\[([^\]]*)\]/g))
      if (m[4]!.includes('"sunrise"') && m[3] !== "stock" && m[3] !== "stablecoin") out.add(m[1]!);
  } catch {
    // reported below as zero found
  }
  return out;
}

// ---------------------------------------------------------------- read

const span = LaunchpadConfig.span;
const found = await retry("configs", () => conn.getProgramAccounts(launchLab, { filters: [{ dataSize: span }] }));
const configs = new Map<string, LaunchpadConfigInfo>();
for (const a of found) {
  const c = LaunchpadConfig.decode(a.account.data);
  // one constant-product config per quote mint is the one launches here use: curve type 0, index 0
  if (c.curveType === 0 && c.index === 0) configs.set(c.mintB.toBase58(), c);
}
const mints = [...configs.keys()];
const keys = mints.flatMap((m) => [new PublicKey(m), PublicKey.findProgramAddressSync([Buffer.from("support_mint"), new PublicKey(m).toBuffer()], cpmm)[0]]);
const infos = await accounts(keys);
const epoch = (await conn.getEpochInfo()).epoch;
const tokens = await jupiter(mints);
const onSunrise = await sunrise();

// ---------------------------------------------------------------- sort and write

type Row = { group: QuoteGroup; symbol: string; name: string; mint: string; decimals: number; usd: number; minRaise: string; liquidity: number; scale: number; feeBps: number; feeMax: string; blocked: string };
const rows: Row[] = [];
const count: Record<string, Record<string, number>> = {};
const note = (group: string, what: string) => ((count[group] ??= {})[what] = (count[group]![what] ?? 0) + 1);

for (const [i, mint] of mints.entries()) {
  const [info, registry] = [infos[i * 2], infos[i * 2 + 1]];
  const t = tokens.get(mint);
  const tags = t?.tags ?? [];
  if (!info) continue;
  const m = unpackMint(new PublicKey(mint), info, info.owner);
  const issuer = ISSUERS.find((x) => (x.over === "mint" ? m.mintAuthority : m.freezeAuthority)?.toBase58() === x.authority);
  // the group it belongs to, by what can be checked: its issuer, Sunrise's own list, where it was minted, Jupiter's tags
  const group: QuoteGroup = issuer ? issuer.group : onSunrise.has(mint) ? "sunrise" : tags.includes("meme") || MEME_LAUNCHPADS.has(t?.launchpad ?? "") ? "memes" : "crypto";
  note(group, "configured on-chain");
  if (PINNED.has(mint)) {
    note(group, "listed");
    continue;
  }
  if (NOT_OFFERED.has(mint)) {
    note(group, "left out: not offered");
    continue;
  }
  if (!t?.symbol || !t.name) {
    note(group, "left out: Jupiter has no record of it");
    continue;
  }
  if (!issuer && !tags.includes("verified")) {
    note(group, "left out: not verified on Jupiter, so its ticker proves nothing");
    continue;
  }
  const symbol = t.symbol.trim();
  const state = inspectMint(symbol, new PublicKey(mint), info, !!registry?.owner.equals(cpmm), epoch);
  const blocked = state.trouble ?? shapeTrouble(symbol, launchLimits(configs.get(mint)!)) ?? "";
  note(group, "listed");
  if (blocked) note(group, `listed, off for now: ${blocked.replace(symbol, "it")}`);
  else if (!(t.usdPrice && t.usdPrice > 0)) note(group, "listed, off for now: no market price");
  rows.push({
    group,
    symbol,
    name: (issuer ? t.name.replace(issuer.suffix, "") : t.name).trim(),
    mint,
    decimals: m.decimals,
    // Jupiter prices a token as wallets show it: times the mint's display multiplier, that is a whole raw unit's price
    usd: Number(((t.usdPrice ?? 0) * state.scale).toPrecision(6)),
    minRaise: configs.get(mint)!.minFundRaisingB.toString(),
    liquidity: Math.round(t.liquidity ?? 0),
    scale: Number(state.scale.toFixed(9)),
    feeBps: state.fee?.bps ?? 0,
    // a cap at the largest amount there is, is no cap
    feeMax: state.fee && state.fee.max < 2n ** 63n ? state.fee.max.toString() : "",
    blocked,
  });
}

const order = quoteGroups.map((g) => g.key);
rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.liquidity - a.liquidity || a.symbol.localeCompare(b.symbol));
const line = (r: Row) => {
  const cells: (string | number)[] = [r.group, r.symbol, r.name, r.mint, r.decimals, r.usd, r.minRaise, r.liquidity];
  const extra: (string | number)[] = [r.scale, r.feeBps, r.feeMax, r.blocked];
  // the trailing cells are written only as far as one of them says something
  let n = extra.length;
  while (n > 0 && (extra[n - 1] === "" || extra[n - 1] === 0 || (n === 1 && extra[0] === 1))) n--;
  return `  ${JSON.stringify([...cells, ...extra.slice(0, n)])},`;
};
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/shared/src/quotes.generated.ts");
writeFileSync(
  file,
  `// Written by \`pnpm --filter @gantry/backend quotes:sync\` (backend/src/scripts/quotes.ts) from LaunchLab's global
// configs on mainnet and Jupiter's token records. Not edited by hand: run the script again to refresh it.

/**
 * A quote LaunchLab has a constant-product config for: its group in the pair picker, ticker, name, mint, decimals,
 * USD price of a whole raw unit and the config's floor on a curve's raise (raw) and its DEX liquidity in USD when
 * this was written, then, where they aren't the usual: its display multiplier, its transfer fee in bps, that fee's
 * cap (raw), and why it couldn't be launched on.
 */
export type GeneratedQuote = [group: string, symbol: string, name: string, mint: string, decimals: number, usd: number, minRaise: string, liquidity: number, scale?: number, feeBps?: number, feeMax?: string, blocked?: string];

export const generatedOn = ${JSON.stringify(new Date().toISOString().slice(0, 10))};

export const generatedQuotes: GeneratedQuote[] = [
${rows.map(line).join("\n")}
];
`,
);

console.log(`${configs.size} constant-product configs on mainnet; ${rows.length} quotes written to ${path.relative(process.cwd(), file)} (${PINNED.size} more are kept by hand)`);
console.log(`Sunrise's list names ${onSunrise.size} token(s) of its own${onSunrise.size ? "" : ": its page couldn't be read, so none are grouped under it"}`);
for (const g of order) {
  if (!count[g]) continue;
  console.log(`\n${quoteGroups.find((x) => x.key === g)!.label}`);
  for (const [what, n] of Object.entries(count[g]!)) console.log(`  ${String(n).padStart(4)}  ${what}`);
}
process.exit(0);
