/** Solana constants shared by the backend and the web app. No web3.js import, so this stays browser-light. */

export type Cluster = "mainnet-beta" | "devnet";

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Wrapped SOL. SOL-quoted coins use it as their quote mint. */
export const NATIVE_MINT = "So11111111111111111111111111111111111111112";

/** Meteora Dynamic Bonding Curve: every launch is a DBC pool until it graduates. */
export const DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
/** Meteora DAMM v2: where a pool migrates to when its curve completes. */
export const DAMM_V2_PROGRAM_ID = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

export const clusters: Record<Cluster, { label: string; rpc: string }> = {
  "mainnet-beta": { label: "Solana", rpc: "https://api.mainnet-beta.solana.com" },
  devnet: { label: "Solana Devnet", rpc: "https://api.devnet.solana.com" },
};

export const explorer = (cluster: Cluster) => {
  const q = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return {
    address: (a: string) => `https://solscan.io/account/${a}${q}`,
    token: (m: string) => `https://solscan.io/token/${m}${q}`,
    tx: (sig: string) => `https://solscan.io/tx/${sig}${q}`,
  };
};

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isSolanaAddress = (s: string | undefined | null): s is string => !!s && BASE58.test(s);
