import generated from "./generated/brand.json";

/** Brand strings, product numbers and the logo, copied from the monorepo by scripts/sync-brand.mjs. */
export const brand = generated.brand;
export const facts = generated.facts;
export const logo = generated.logo;

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const withStop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const usdShort = (n: number) => (n >= 1000 ? `$${+(n / 1000).toFixed(1)}k` : `$${n}`);
const holdLabel = (seconds: number) => {
  if (seconds % 3600 === 0) return `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`;
  return `${Math.round(seconds / 60)} min`;
};

const topTier = facts.tiers[facts.tiers.length - 1]!;

/**
 * Every line of copy in the film, in one place. Numbers come from `facts`, names from `brand`, so a change in the
 * product flows through on the next render. The demo figures (a sale, a loss) are illustrations and are kept
 * consistent with the rules: the payout is the loss times the top tier.
 */
export const demo = {
  /** OTC sale shown on the sell card */
  sellAmount: 500_000,
  sellGetsSol: 3.1,
  reserveBeforeSol: 104.42,
  /** the loss in the Heat Shield scene, and what the top tier pays back on it */
  lossSol: 0.75,
  walletBeforeSol: 2.31,
} as const;
export const payoutSol = +(demo.lossSol * (topTier.coveragePct / 100)).toFixed(2);

export const copy = {
  open: { line: "A Solana launchpad built for holders." },
  fee: {
    headline: ["Every trade", `pays ${facts.feePct}%.`],
    none: ["0% to creators.", "0% to the team."],
    raydium: `Raydium ${facts.raydiumPct}%`,
    half: "Half",
    shield: brand.shield,
    reserve: "OTC reserve",
  },
  otc: {
    headline: ["Sell into the reserve.", "No slippage."],
    vessel: "OTC reserve",
    cardTitle: "Sell to the OTC reserve",
    youSell: "You sell",
    youGet: "You get",
    coins: "coins",
    chips: ["Posted price", "0% slippage"],
  },
  shield: {
    headline: [`Held ${holdLabel(topTier.minHoldSeconds)}?`, `Up to ${topTier.coveragePct}% of the loss comes back.`],
    tiers: facts.tiers.map((t) => ({ hold: holdLabel(t.minHoldSeconds), pct: `up to ${t.coveragePct}%` })),
    loss: `−${demo.lossSol.toFixed(2)} SOL`,
    payout: `+${payoutSol.toFixed(2)} SOL paid back`,
    wallet: "Your wallet",
    name: brand.shield,
  },
  launch: {
    headline: [`Start at ${usdShort(facts.startMcapUsd)}.`, `Graduate to Raydium at ${usdShort(facts.graduationMcapUsd)}.`],
    rent: `About ${facts.launchRentSol} SOL in network rent. No platform fee.`,
    pairs: facts.hasStocks ? [...facts.pairs, "tokenized stocks"] : facts.pairs,
    pairsLabel: "Pair with",
    graduated: "Graduated",
    marketCap: "Market cap",
  },
  end: {
    slogan: withStop(sentence(brand.slogan)),
    disclaimer: "Payouts are capped. Not insurance. Crypto is risky.",
  },
} as const;

export const fmt = {
  sol: (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  int: (n: number) => Math.round(n).toLocaleString("en-US"),
  usd: (n: number) => `$${Math.round(n).toLocaleString("en-US")}`,
};
