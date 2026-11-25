"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type CoinSort, type QuoteGroup } from "@gantry/shared";

/** The backend API. Empty = same origin: Next proxies /api/* to the backend (next.config.ts). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const client = api(API_URL);

const live = { refetchInterval: 10_000, retry: 1 } as const;

export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: client.stats, ...live });
/** Every quote, or one group of them, or the ones matching a search. */
export const useQuotes = (q: { group?: QuoteGroup; search?: string; available?: boolean; limit?: number } = {}) =>
  useQuery({ queryKey: ["quotes", q], queryFn: () => client.quotes(q), staleTime: 60_000, retry: 1, placeholderData: (prev) => prev });
/** The pair picker's tabs, with their counts. */
export const useQuoteGroups = () => useQuery({ queryKey: ["quote-groups"], queryFn: client.quoteGroups, staleTime: 60_000, retry: 1 });
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
/** Recent trades, optionally one wallet's. */
export const useTrades = (address: string | undefined, limit = 20, trader?: string) =>
  useQuery({
    queryKey: ["trades", address, limit, trader],
    queryFn: () => client.trades(address!, limit, { trader }),
    enabled: !!address,
    ...live,
    placeholderData: (prev) => prev,
  });
export const useHolders = (address?: string) =>
  useQuery({ queryKey: ["holders", address], queryFn: () => client.holders(address!), enabled: !!address, ...live });
export const useWalletSummary = (address?: string) =>
  useQuery({ queryKey: ["wallet", address], queryFn: () => client.wallet(address!), enabled: !!address, ...live });
/** Native SOL (lamports) and SPL balances by mint, from the chain or the demo ledger. */
export const useBalances = (address?: string) =>
  useQuery({ queryKey: ["balances", address], queryFn: () => client.balances(address!), enabled: !!address, ...live });
/** A coin's Fleet: who leads, and what its copies sent it. */
export const useFleet = (address?: string) =>
  useQuery({ queryKey: ["fleet", address], queryFn: () => client.fleet(address!), enabled: !!address, ...live });
/** The Fleet a launch with this ticker and name would join, and its entry on that pair. */
export const useFleetCheck = (q: { symbol: string; name: string; quote?: string }) =>
  useQuery({
    queryKey: ["fleet-check", q],
    queryFn: () => client.fleetCheck({ symbol: q.symbol, name: q.name, quote: q.quote! }),
    enabled: !!q.quote && !!(q.symbol || q.name),
    refetchInterval: 30_000,
    retry: 1,
  });
export const useProtection = () => useQuery({ queryKey: ["protection"], queryFn: client.protection, ...live });
/** One paid loss cover, for its share page. */
export const usePayout = (id?: string) =>
  useQuery({ queryKey: ["payout", id], queryFn: () => client.payout(id!), enabled: !!id, staleTime: 30_000, retry: 1 });
export const useOtc = () => useQuery({ queryKey: ["otc"], queryFn: client.otc, ...live });
/** One coin's OTC limits, including this wallet's remaining daily allowance. */
export const useOtcCoin = (coin?: string, wallet?: string) =>
  useQuery({ queryKey: ["otc", coin, wallet], queryFn: () => client.otcCoin(coin!, wallet), enabled: !!coin, ...live });
export const useActivity = () =>
  useQuery({ queryKey: ["activity"], queryFn: () => client.activity(40), refetchInterval: 6_000, retry: 1 });

/** USD per SOL from the backend's price feed (0 until stats load). */
export const useSolUsd = () => useStats().data?.solUsd ?? 0;
