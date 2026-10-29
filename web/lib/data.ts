"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type CoinSort } from "@cook/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:42069";
export const client = api(API_URL);

const live = { refetchInterval: 10_000, retry: 1 } as const;

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: client.stats, ...live });
export const useQuotes = () => useQuery({ queryKey: ["quotes"], queryFn: client.quotes, staleTime: 60_000, retry: 1 });
export const useTrending = () => useQuery({ queryKey: ["trending"], queryFn: client.trending, ...live });
export const useCoins = (q: { sort?: CoinSort; quote?: string; limit?: number; search?: string }) =>
  useQuery({ queryKey: ["coins", q], queryFn: () => client.coins(q), ...live, placeholderData: (prev) => prev });
export const useCoin = (address?: string) =>
  useQuery({ queryKey: ["coin", address], queryFn: () => client.coin(address!), enabled: !!address, ...live });
export const useCandles = (address: string | undefined, interval: "1m" | "5m" | "15m" | "1h") =>
  useQuery({
    queryKey: ["candles", address, interval],
    queryFn: () => client.candles(address!, interval),
    enabled: !!address,
    ...live,
  });
export const useTrades = (address?: string) =>
  useQuery({ queryKey: ["trades", address], queryFn: () => client.trades(address!, 60), enabled: !!address, ...live });
export const useHolders = (address?: string) =>
  useQuery({ queryKey: ["holders", address], queryFn: () => client.holders(address!), enabled: !!address, ...live });
export const useWalletSummary = (address?: string) =>
  useQuery({ queryKey: ["wallet", address], queryFn: () => client.wallet(address!), enabled: !!address, ...live });
/** Native SOL (lamports) and SPL balances by mint, from the chain or the demo ledger. */
export const useBalances = (address?: string) =>
  useQuery({ queryKey: ["balances", address], queryFn: () => client.balances(address!), enabled: !!address, ...live });
export const useProtection = () => useQuery({ queryKey: ["protection"], queryFn: client.protection, ...live });
export const useOtc = () => useQuery({ queryKey: ["otc"], queryFn: client.otc, ...live });
/** One coin's OTC limits, including this wallet's remaining daily allowance. */
export const useOtcCoin = (coin?: string, wallet?: string) =>
  useQuery({ queryKey: ["otc", coin, wallet], queryFn: () => client.otcCoin(coin!, wallet), enabled: !!coin, ...live });
export const useActivity = () =>
  useQuery({ queryKey: ["activity"], queryFn: () => client.activity(40), refetchInterval: 6_000, retry: 1 });

/** USD per SOL from the backend's price feed (0 until stats load). */
export const useSolUsd = () => useStats().data?.solUsd ?? 0;
