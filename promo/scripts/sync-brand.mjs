// Copies the brand strings, the product numbers and the logo geometry out of the monorepo into
// src/generated/brand.json, so the film never types them by hand. Runs before `studio`, `render` and `poster`.
//
//   brand strings   <- packages/shared/src/brand.ts
//   fees and tiers  <- packages/shared/src/fees.ts
//   curve, pairs    <- packages/shared/src/quotes.ts
//   logo paths      <- web/components/LogoMark.tsx
//
// If the monorepo is not next to this folder (the project was copied elsewhere), the last generated file is kept.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const shared = path.join(repo, "packages", "shared", "src");
const logoFile = path.join(repo, "web", "components", "LogoMark.tsx");
const outFile = path.join(here, "..", "src", "generated", "brand.json");

if (!fs.existsSync(path.join(shared, "brand.ts"))) {
  if (fs.existsSync(outFile)) {
    console.warn("[sync-brand] monorepo sources not found, keeping the existing src/generated/brand.json");
    process.exit(0);
  }
  console.error("[sync-brand] monorepo sources not found and no generated file exists");
  process.exit(1);
}

const slash = (p) => p.split(path.sep).join("/");
const entry = `
  export { brand } from "${slash(path.join(shared, "brand.ts"))}";
  export * as fees from "${slash(path.join(shared, "fees.ts"))}";
  export * as quotes from "${slash(path.join(shared, "quotes.ts"))}";
`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: here, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const tmp = path.join(here, ".sync-brand.tmp.mjs");
fs.writeFileSync(tmp, bundled.outputFiles[0].text);
let mod;
try {
  mod = await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
} finally {
  fs.rmSync(tmp, { force: true });
}
const { brand, fees, quotes } = mod;

// the mark: every <path d="…" strokeWidth="…"> of LogoMark, in drawing order
const logoSource = fs.existsSync(logoFile) ? fs.readFileSync(logoFile, "utf8") : "";
const markBlock = logoSource.slice(logoSource.indexOf("export function LogoMark"), logoSource.indexOf("export function Wordmark"));
const paths = [...markBlock.matchAll(/<path\s+d="([^"]+)"\s+strokeWidth="([\d.]+)"/g)].map((m) => ({ d: m[1], strokeWidth: Number(m[2]) }));
const viewBox = Number(/viewBox="0 0 (\d+) \d+"/.exec(markBlock)?.[1] ?? 32);
if (paths.length === 0) {
  console.error("[sync-brand] could not read the logo paths from web/components/LogoMark.tsx");
  process.exit(1);
}

const mainnet = quotes.quoteCatalog["mainnet-beta"];
const stockQuotes = mainnet.filter((q) => q.category === "stock");
const pct = (bps) => bps / 100;

const data = {
  generatedFrom: "packages/shared/src/{brand,fees,quotes}.ts and web/components/LogoMark.tsx",
  brand: {
    name: brand.name,
    slogan: brand.slogan,
    tagline: brand.tagline,
    domain: brand.domain,
    xHandle: brand.xHandle,
    shield: brand.shield,
    chainLabel: brand.chainLabel,
    poolsLabel: brand.poolsLabel,
  },
  facts: {
    feePct: pct(fees.TAX_BPS),
    raydiumPct: pct(fees.RAYDIUM_CURVE_FEE_BPS),
    bucketSharePct: pct(fees.buckets[0].bps),
    // hold-time tiers that pay something, shortest first
    tiers: fees.protectionTiers.filter((t) => t.coverageBps > 0).map((t) => ({ minHoldSeconds: t.minHold, coveragePct: pct(t.coverageBps) })),
    startMcapUsd: quotes.START_MCAP_USD,
    graduationMcapUsd: quotes.GRADUATION_MCAP_USD,
    launchRentSol: fees.LAUNCH_RENT_SOL,
    pairs: mainnet.filter((q) => q.category !== "stock").map((q) => q.symbol),
    hasStocks: "stock" in quotes.quoteCategories && stockQuotes.length > 0,
  },
  logo: { viewBox, paths },
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const next = JSON.stringify(data, null, 2) + "\n";
const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
if (prev !== next) fs.writeFileSync(outFile, next);
console.log(`[sync-brand] ${prev === next ? "up to date" : "wrote"} src/generated/brand.json (${data.brand.name}, ${data.brand.domain}, pairs ${data.facts.pairs.join("/")}${data.facts.hasStocks ? " + stocks" : ""})`);
