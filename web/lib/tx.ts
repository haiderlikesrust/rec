"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { TxEnvelope } from "@cook/shared";
import { client } from "./data";

export type TxState = { status: "idle" | "pending" | "success" | "error"; message?: string; signature?: string };

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Readable message from a backend `{error}`, a wallet rejection or a failed send. */
export function errorMessage(e: unknown): string {
  if (!e) return "";
  const err = e as { message?: string; error?: { message?: string } };
  const msg = err.message ?? err.error?.message ?? String(e);
  if (/reject|denied|declined|cancel/i.test(msg)) return "Transaction rejected in wallet.";
  if (/block height exceeded|blockhash not found|expired/i.test(msg)) return "The transaction expired before it confirmed. Try again.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(msg)) return "Not enough balance to cover this and the network fee.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Can't reach the Recur API right now. Try again in a moment.";
  return msg.split("\n")[0].slice(0, 180);
}

/**
 * Backend builds → wallet signs → send → confirm → tell the backend to index it → refresh every query.
 * In demo mode the backend applies the action itself and returns `demo: true`, so there is nothing to sign.
 * `after` runs once the transaction is confirmed on-chain (OTC and protection confirmations).
 */
export function useSolanaTx() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async <T extends TxEnvelope>(
      label: string,
      build: () => Promise<T>,
      after?: (signature: string, res: T) => Promise<unknown>,
    ): Promise<{ res: T; signature: string } | null> => {
      if (!publicKey) {
        setState({ status: "error", message: "Connect a wallet first." });
        return null;
      }
      setState({ status: "pending", message: `${label}: preparing…` });
      try {
        const res = await build();
        if (res.demo || !res.tx) {
          const signature = res.signature ?? "demo";
          setState({ status: "success", message: `${label}: done (demo, nothing sent on-chain)` });
          queryClient.invalidateQueries();
          return { res, signature };
        }
        if (!signTransaction) throw new Error("This wallet can't sign transactions.");

        setState({ status: "pending", message: `${label}: confirm in your wallet…` });
        const tx = VersionedTransaction.deserialize(fromBase64(res.tx));
        const signed = await signTransaction(tx);
        const signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });

        setState({ status: "pending", message: `${label}: waiting for confirmation…`, signature });
        const confirmation = res.lastValidBlockHeight
          ? await connection.confirmTransaction(
              { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: res.lastValidBlockHeight },
              "confirmed",
            )
          : await connection.confirmTransaction(signature, "confirmed");
        if (confirmation.value.err) throw new Error("The transaction failed on-chain.");

        await client.ingest(signature).catch(() => undefined);
        if (after) await after(signature, res);
        setState({ status: "success", message: `${label}: done`, signature });
        queryClient.invalidateQueries();
        return { res, signature };
      } catch (e) {
        setState({ status: "error", message: errorMessage(e) });
        return null;
      }
    },
    [connection, publicKey, signTransaction, queryClient],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { run, state, reset, busy: state.status === "pending" };
}
