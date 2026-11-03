import { VersionedTransaction, type PublicKey } from "@solana/web3.js";
import { config } from "../config";

/**
 * Jupiter swap API: the fee wallet converts quote assets (USDC, xStocks, Backpack stocks, ...) to SOL and back,
 * and launchers paying a first buy in SOL swap into the pair's quote. Set JUPITER_API / JUPITER_API_KEY for a paid tier; the default is the keyless lite host.
 */
const headers = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(config.jupiterKey ? { "x-api-key": config.jupiterKey } : {}),
});

export type JupQuote = { inAmount: string; outAmount: string; otherAmountThreshold: string; priceImpactPct: string };

export async function jupQuote(inputMint: string, outputMint: string, amount: bigint, slippageBps = 100): Promise<JupQuote> {
  const url = `${config.jupiterApi}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as JupQuote;
}

/** The swap as an unsigned transaction for `user` to sign, and the block height it stays valid until. */
export async function jupSwapTx(quote: JupQuote, user: PublicKey): Promise<{ tx: VersionedTransaction; lastValidBlockHeight?: number }> {
  const res = await fetch(`${config.jupiterApi}/swap/v1/swap`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: user.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Jupiter swap ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { swapTransaction, lastValidBlockHeight } = (await res.json()) as { swapTransaction: string; lastValidBlockHeight?: number };
  return { tx: VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64")), lastValidBlockHeight };
}
