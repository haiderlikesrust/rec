"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Position } from "@gantry/shared";
import { tokens, units, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Change, DataTable, Td, Th } from "@/components/ui";

export const holds = (p: Position) => units(p.balance, p.coin.decimals) > 0;
export const signedUsd = (v: number) => (v === 0 ? usd(0) : `${v > 0 ? "+" : "−"}${usd(Math.abs(v))}`);
const pnlClass = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-ink-2");

const quiet = "text-[13px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline";

/** What the wallet holds, most valuable first: the coin, how much, what it is worth, how it is doing, and where to trade or sell it. */
export function HoldingsTable({ list }: { list: Position[] }) {
  return (
    <DataTable caption="Coins you hold">
      <thead>
        <tr>
          <Th>Coin</Th>
          <Th num className="hidden sm:table-cell">
            Amount
          </Th>
          <Th num>Value</Th>
          <Th num className="hidden sm:table-cell" title="Against what you paid, fees included. Coins that arrived by transfer count as free.">
            Profit / loss
          </Th>
          <Th>
            <span className="sr-only">Trade or sell</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => {
          const c = p.coin;
          const amount = tokens(p.balance, c.decimals);
          const cost = p.value - p.unrealized;
          const pct = cost > 0 ? (p.unrealized / cost) * 100 : null;
          const pnl = <span className={pnlClass(p.unrealizedUsd)}>{signedUsd(p.unrealizedUsd)}</span>;
          return (
            <tr key={c.address}>
              <Td className="py-2.5 max-sm:w-full max-sm:max-w-0">
                <Link href={`/token/${c.address}`} className="flex min-w-0 items-center gap-3">
                  <CoinAvatar src={c.image} symbol={c.symbol} seed={c.address} size={36} />
                  <span className="min-w-0 max-sm:flex-1">
                    <span className="block truncate font-medium text-ink sm:max-w-[14rem]">{c.name}</span>
                    <span className="block truncate text-[13px] text-ink-3">
                      <span className="num sm:hidden">{amount} </span>
                      {c.symbol}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td num className="hidden text-ink-2 sm:table-cell">
                {amount}
              </Td>
              <Td num className="max-sm:py-2.5">
                {usd(p.valueUsd)}
                <span className="block text-[13px] sm:hidden">{pnl}</span>
              </Td>
              <Td num className="hidden sm:table-cell">
                <span className="inline-flex items-center gap-2">
                  {pnl}
                  {pct !== null && <Change value={pct} className="text-[13px]" />}
                </span>
              </Td>
              <Td align="right">
                <span className="inline-flex items-center gap-4">
                  <Link href={`/token/${c.address}`} className={clsx(quiet, "hidden sm:inline")}>
                    Trade
                  </Link>
                  <Link href={`/otc?coin=${c.address}`} className={quiet} aria-label={`Sell ${c.symbol} to the reserve`}>
                    Sell<span className="hidden sm:inline"> to reserve</span>
                  </Link>
                </span>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

/** Coins the wallet has sold out of, with what each made or lost. Closed by default: it is history, not holdings. */
export function SoldCoins({ list }: { list: Position[] }) {
  if (list.length === 0) return null;
  return (
    <details className="group px-[var(--card-pad)] py-4">
      <summary className="inline-flex list-none items-center gap-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        Coins you sold ({list.length})
        <ChevronDown size={16} aria-hidden className="text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-3 max-w-md space-y-3">
        {list.map((p) => (
          <li key={p.coin.address} className="flex items-center justify-between gap-4">
            <Link href={`/token/${p.coin.address}`} className="flex min-w-0 items-center gap-2.5 text-ink hover:underline">
              <CoinAvatar src={p.coin.image} symbol={p.coin.symbol} seed={p.coin.address} size={24} />
              <span className="truncate">{p.coin.name}</span>
            </Link>
            <span className={clsx("num shrink-0", pnlClass(p.realizedPnlUsd))}>{signedUsd(p.realizedPnlUsd)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
