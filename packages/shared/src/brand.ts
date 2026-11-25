/** Brand in one place: rename the launchpad by editing this file. */
export const brand = {
  name: "Gantry",
  /** The platform token's ticker until its own is read from its mint (MAIN_TOKEN_MINT). The site features it; no fees go to it. */
  mainTicker: "GANTRY",
  tagline: "Launch on Solana. Every fee stays behind to hold the holders up.",
  /** Short line for titles and link previews. */
  slogan: "every fee holds the holders up",
  domain: "gantry.fast",
  url: "https://gantry.fast",
  chainLabel: "Built on Solana",
  poolsLabel: "Pools on Raydium",
  /** The project's X account. Leave both empty to hide the X link everywhere (site footer, link previews, promo). */
  x: "https://x.com/gantryfast" as string,
  xHandle: "@gantryfast" as string,
  docsPath: "/docs",
  /** What a family of same-ticker coins (packages/shared/src/fleet.ts) is called on the site. */
  fleet: "Fleet",
  /** What the protection fund is called on the site. */
  shield: "Heat Shield",
} as const;
