"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { explorerTx } from "@/lib/explorer";
import { age, tokens, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Button, DataTable, Td, Th } from "@/components/ui";
import type { WalletTrade } from "./useWalletTrades";

const PAGE = 20;

/** The wallet's buys, sells and sales to the reserve as one list, newest first. */
export function ActivityTable({ trades }: { trades: WalletTrade[] }) {
  const [limit, setLimit] = useState(PAGE);
  const shown = trades.slice(0, limit);
  return (
    <>
      <DataTable caption="Your recent trades">
        <thead>
          <tr>
            <Th>Trade</Th>
            <Th num className="hidden sm:table-cell">
              Amount
            </Th>
            <Th num>Value</Th>
            <Th num>When</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const q = t.coin.quote;
            const amount = tokens(t.tokenAmount, t.coin.decimals);
            const hasTx = !!t.tx && t.tx !== "demo";
            return (
              <tr key={`${t.coin.address}:${t.id}`}>
                <Td className="py-2.5 max-sm:w-full max-sm:max-w-0">
                  <Link href={`/token/${t.coin.address}`} className="flex min-w-0 items-center gap-3">
                    <CoinAvatar src={t.coin.image} symbol={t.coin.symbol} seed={t.coin.address} size={32} />
                    <span className="min-w-0 max-sm:flex-1">
                      <span className="block truncate font-medium text-ink">
                        {t.kind === "otc" ? "Sold to the reserve" : t.isBuy ? "Bought" : "Sold"}
                      </span>
                      <span className="block truncate text-[13px] text-ink-3">
                        <span className="num sm:hidden">{amount} </span>
                        {t.coin.symbol}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td num className="hidden text-ink-2 sm:table-cell">
                  {amount}
                </Td>
                <Td num>{q.usdPerUnit > 0 ? usd(t.valueUsd) : tokens(t.quoteAmount, q.decimals, q.symbol)}</Td>
                <Td num className="text-ink-3">
                  {hasTx ? (
                    <a
                      href={explorerTx(t.tx)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Transaction, ${age(t.t)} ago`}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {age(t.t)} <ArrowUpRight size={13} aria-hidden />
                    </a>
                  ) : (
                    age(t.t)
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {trades.length > limit && (
        <div className="px-[calc(var(--card-pad)-12px)] pb-1">
          <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
            Show {Math.min(PAGE, trades.length - limit)} more
          </Button>
        </div>
      )}
    </>
  );
}
