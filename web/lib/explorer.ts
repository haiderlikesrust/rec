import { clusters, explorer, type Cluster } from "@cook/shared";

/**
 * Cluster, demo flag and browser RPC. Build-time env gives the first render; the backend's /api/config replaces
 * them at runtime (Providers), so one Docker image serves demo, devnet and mainnet.
 */
const envCluster: Cluster = process.env.NEXT_PUBLIC_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";

export type RuntimeConfig = { cluster: Cluster; demo: boolean; rpc: string };

export const runtime: RuntimeConfig = {
  cluster: envCluster,
  demo: process.env.NEXT_PUBLIC_DEMO === "1",
  rpc: process.env.NEXT_PUBLIC_SOLANA_RPC || clusters[envCluster].rpc,
};

export function setRuntime(next: Partial<RuntimeConfig>) {
  Object.assign(runtime, next);
}

export const explorerAddress = (a: string) => explorer(runtime.cluster).address(a);
export const explorerToken = (m: string) => explorer(runtime.cluster).token(m);
export const explorerTx = (sig: string) => explorer(runtime.cluster).tx(sig);
export const hasExplorer = true;
