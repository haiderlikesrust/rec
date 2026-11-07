/** Brand in one place: rename the launchpad by editing this file. */
export const brand = {
  name: "Cushion",
  /** The platform token's ticker. Its mint comes from MAIN_TOKEN_MINT; it's featured on the home page, and no fees go to it. */
  mainTicker: "CUSHION",
  tagline: "Launch on Solana. Every fee cushions the holders.",
  /** Short line for titles and link previews. */
  slogan: "every fee cushions the fall",
  // the site still runs on the old domain until a new one is set up
  domain: "recur.lol",
  url: "https://recur.lol",
  chainLabel: "Built on Solana",
  poolsLabel: "Pools on Meteora",
  x: "https://x.com/launchoncushion",
  xHandle: "@launchoncushion",
  docsPath: "/docs",
  /** What Bloodline (packages/shared/src/bloodline.ts) is called on the site. */
  nest: "Nest",
  /** What the protection fund is called on the site. */
  landing: "Soft Landing",
} as const;
