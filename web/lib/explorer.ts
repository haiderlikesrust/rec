import { chainsById } from "@cook/shared";
import { CHAIN_ID } from "./contracts";

const chain = (chainsById as Record<number, { blockExplorers?: { default: { url: string } } }>)[CHAIN_ID];
const base = chain?.blockExplorers?.default.url;

export const explorerAddress = (a: string) => (base ? `${base}/address/${a}` : undefined);
export const explorerTx = (h: string) => (base ? `${base}/tx/${h}` : undefined);
export const hasExplorer = !!base;
