"use client";

import { erc20Abi, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { CHAIN_ID, abis, addresses, isNative } from "./contracts";

export type OnchainQuote = {
  address: Address;
  symbol: string;
  decimals: number;
  enabled: boolean;
  startFdv: bigint;
  graduationThreshold: bigint;
};

/** Approved quote assets straight from the Launchpad, so launching works even when the indexer is down. */
export function useOnchainQuotes() {
  const lp = { address: addresses.launchpad!, abi: abis.launchpad, chainId: CHAIN_ID } as const;
  const count = useReadContract({ ...lp, functionName: "quoteCount", query: { enabled: !!addresses.launchpad } });
  const n = Number(count.data ?? 0n);

  const list = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({ ...lp, functionName: "quoteList" as const, args: [BigInt(i)] as const })),
    query: { enabled: n > 0 },
  });
  const quoteAddrs = (list.data ?? []).map((r) => r.result as Address | undefined).filter(Boolean) as Address[];

  const details = useReadContracts({
    contracts: quoteAddrs.flatMap((a) => [
      { ...lp, functionName: "quotes" as const, args: [a] as const },
      { address: a, abi: erc20Abi, functionName: "symbol" as const, chainId: CHAIN_ID },
      { address: a, abi: erc20Abi, functionName: "decimals" as const, chainId: CHAIN_ID },
    ]),
    query: { enabled: quoteAddrs.length > 0 },
  });

  const quotes: OnchainQuote[] = quoteAddrs.map((a, i) => {
    const cfg = details.data?.[i * 3]?.result as readonly [boolean, bigint, bigint] | undefined;
    const native = isNative(a);
    return {
      address: a,
      symbol: native ? "ETH" : ((details.data?.[i * 3 + 1]?.result as string | undefined) ?? "…"),
      decimals: native ? 18 : Number(details.data?.[i * 3 + 2]?.result ?? 18),
      enabled: cfg?.[0] ?? false,
      startFdv: cfg?.[1] ?? 0n,
      graduationThreshold: cfg?.[2] ?? 0n,
    };
  });

  return {
    quotes: quotes.filter((q) => q.enabled),
    isLoading: count.isLoading || list.isLoading || details.isLoading,
    isError: count.isError || !addresses.launchpad,
  };
}
