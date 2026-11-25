/** Solana constants shared by the backend and the web app. No web3.js import, so this stays browser-light. */

export type Cluster = "mainnet-beta" | "devnet";

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** Wrapped SOL. SOL-quoted coins use it as their quote mint. */
export const NATIVE_MINT = "So11111111111111111111111111111111111111112";

/** Raydium LaunchLab: every launch is a bonding-curve pool here until it graduates. */
export const LAUNCHLAB_PROGRAM_ID: Record<Cluster, string> = {
  "mainnet-beta": "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
  devnet: "DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6",
};
/** Raydium CPMM: the constant-product pool a curve's liquidity moves to when it completes. */
export const CPMM_PROGRAM_ID: Record<Cluster, string> = {
  "mainnet-beta": "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  devnet: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
};
/** Raydium's LP lock ("Burn & Earn"): holds a graduated pool's LP for good; its Fee Key NFT collects the LP's fees. */
export const LP_LOCK_PROGRAM_ID: Record<Cluster, string> = {
  "mainnet-beta": "LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE",
  devnet: "DRay25Usp3YJAi7beckgpGUC7mGJ2cR1AVPxhYfwVCUX",
};

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
