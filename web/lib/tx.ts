"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Abi, Address, ContractFunctionArgs, ContractFunctionName, Hash } from "viem";
import { erc20Abi, maxUint256 } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { CHAIN_ID, errorMessage } from "./contracts";

export type TxState = { status: "idle" | "pending" | "success" | "error"; message?: string; hash?: Hash };

/** Write → wait for receipt → refresh every query. Exposes a single status line for the UI. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async <const abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      label: string,
      req: {
        address: Address;
        abi: abi;
        functionName: fn;
        args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
        value?: bigint;
      },
    ) => {
      setState({ status: "pending", message: `${label}: confirm in your wallet…` });
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hash = await writeContractAsync({ ...(req as any), chainId: CHAIN_ID });
        setState({ status: "pending", message: `${label}: waiting for confirmation…`, hash });
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setState({ status: "success", message: `${label}: done`, hash });
        queryClient.invalidateQueries();
        return receipt;
      } catch (e) {
        setState({ status: "error", message: errorMessage(e) });
        return null;
      }
    },
    [writeContractAsync, publicClient, queryClient],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { send, state, reset, busy: state.status === "pending" };
}

/** Approve `spender` for `amount` of `token` if the current allowance is short. */
export function useEnsureAllowance() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const tx = useTx();

  const ensure = useCallback(
    async (token: Address, spender: Address, amount: bigint, label = "Approve") => {
      if (!address || !publicClient) return false;
      const allowance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, spender],
      });
      if (allowance >= amount) return true;
      const r = await tx.send(label, { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
      return !!r;
    },
    [address, publicClient, tx],
  );
  return { ensure, state: tx.state, busy: tx.busy, maxUint256 };
}

/** True when the wallet is connected to a different chain than the app's deployment. */
export function useWrongChain() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  return {
    wrong: isConnected && chainId !== CHAIN_ID,
    switchToApp: () => switchChain({ chainId: CHAIN_ID }),
    switching: isPending,
  };
}
