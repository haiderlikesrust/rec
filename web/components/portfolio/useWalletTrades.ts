"use client";

import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Coin, Trade } from "@gantry/shared";
import { client } from "@/lib/data";
import { units } from "@/lib/format";

/** How far back each coin's tape is read, and how many coins are read at once. */
export const TRADES_PER_COIN = 100;
const MAX_COINS = 24;

export type WalletTrade = Trade & { coin: Coin; valueUsd: number };

export type WalletTrades = {
  /** this wallet's trades on the given coins, newest first */
  trades: WalletTrade[];
  loading: boolean;
  /** some coins' tapes did not load: the list is incomplete */
  partial: boolean;
  failed: boolean;
};

/**
 * One wallet's trades across the coins it holds. The API has no wallet-wide tape, so this reads each coin's trades
 * narrowed to the wallet (the same request the coin page's "only mine" filter makes) and merges them. It covers the
 * coins passed in, `TRADES_PER_COIN` trades deep; a coin sold down to nothing drops out with its position.
 */
export function useWalletTrades(wallet: string | undefined, coins: Coin[]): WalletTrades {
  const read = coins.slice(0, MAX_COINS);
  const combine = useCallback(
    (results: UseQueryResult<Trade[]>[]): WalletTrades => {
      const trades: WalletTrade[] = [];
      results.forEach((r, i) => {
        const coin = read[i];
        if (!coin || !r.data) return;
        for (const t of r.data) {
          trades.push({ ...t, coin, valueUsd: units(t.quoteAmount, coin.quote.decimals) * coin.quote.usdPerUnit });
        }
      });
      trades.sort((a, b) => b.t - a.t);
      const failures = results.filter((r) => r.isError).length;
      return {
        trades,
        loading: results.some((r) => r.isLoading),
        partial: failures > 0 && failures < results.length,
        failed: results.length > 0 && failures === results.length,
      };
    },
    // the coins' addresses and quote prices decide the result
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read.map((c) => `${c.address}:${c.quote.usdPerUnit}`).join(",")],
  );
  return useQueries({
    queries: read.map((c) => ({
      queryKey: ["trades", c.address, TRADES_PER_COIN, wallet],
      queryFn: () => client.trades(c.address, TRADES_PER_COIN, { trader: wallet }),
      enabled: !!wallet,
      refetchInterval: 30_000,
      retry: 1,
    })),
    combine,
  });
}
