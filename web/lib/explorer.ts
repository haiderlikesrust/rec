import { clusters, explorer, type Cluster } from "@cook/shared";

/** The cluster the app talks to. The backend reports it too (`stats.cluster`); both come from deployment config. */
export const CLUSTER: Cluster = process.env.NEXT_PUBLIC_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC || clusters[CLUSTER].rpc;
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const links = explorer(CLUSTER);

export const explorerAddress = (a: string) => links.address(a);
export const explorerToken = (m: string) => links.token(m);
export const explorerTx = (sig: string) => links.tx(sig);
export const hasExplorer = true;
