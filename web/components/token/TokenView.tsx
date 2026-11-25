"use client";

import { useState, type ReactNode } from "react";
import { isSolanaAddress } from "@gantry/shared";
import { useCoin, useStats } from "@/lib/data";
import { useStickyTop } from "@/lib/useStickyTop";
import { ButtonLink, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { CoinHeader } from "./CoinHeader";
import { CoinTabs } from "./CoinTabs";
import { MobileTradeBar } from "./MobileTradeBar";
import { PositionCard } from "./PositionCard";
import { PriceChart } from "./PriceChart";
import { TradePanel } from "./TradePanel";

/*
 * The coin page: a compact header, then two columns from 1024px.
 *
 *   left (wide)     the price chart, and under it the tabs (trades, holders, fees, about)
 *   right (360px)   the buy/sell box, and under it the wallet's position when it holds the coin; sticks while scrolling
 *
 * Below 1024px it is one column: header, chart, position, tabs. The buy/sell box moves into the sheet that the
 * Buy and Sell buttons docked at the bottom open. The side column dissolves (`contents`), so the position card
 * takes its place under the chart and a wallet that holds nothing leaves no gap.
 */
const columns = "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6";
const cell = {
  chart: "min-w-0 lg:col-start-1 lg:row-start-1",
  side: "max-lg:contents lg:sticky lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:space-y-6",
  tabs: "min-w-0 lg:col-start-1 lg:row-start-2",
};

const browse = (
  <ButtonLink href="/" variant="secondary" size="sm">
    Browse coins
  </ButtonLink>
);

/** The page when there is no coin to show: a title for the page, then what happened and the way back. */
function NoCoin({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl pt-6">
      <h1 className="sr-only">{title}</h1>
      {children}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the coin">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-[52px]" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-7 w-48 sm:w-64" />
            <Skeleton className="h-4 w-56 sm:w-80" />
          </div>
          <Skeleton className="hidden h-12 w-40 sm:block" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      <div className={columns}>
        <Skeleton className={`${cell.chart} h-[360px] sm:h-[440px] lg:h-[500px]`} />
        <Skeleton className="hidden h-[420px] lg:col-start-2 lg:row-start-1 lg:block" />
      </div>
    </div>
  );
}

export function TokenView({ address }: { address: string }) {
  const valid = isSolanaAddress(address);
  const { data: coin, isLoading, isError, error } = useCoin(valid ? address : undefined);
  const { data: stats } = useStats();
  const solUsd = stats?.solUsd ?? 0;
  const [side, setSide] = useState<HTMLElement | null>(null);
  // where the side column's top sits once its end is in view; its resting place under the navbar comes from the
  // shell's own metrics in CSS, so the hook's fixed offset is set out of reach
  const sideEnd = useStickyTop(side, 100_000);

  if (!valid)
    return (
      <NoCoin title="Not a coin address">
        <EmptyState title="That is not a coin address" detail="A coin page needs the coin's full Solana address in the link." action={browse} />
      </NoCoin>
    );
  if (isLoading) return <PageSkeleton />;
  if (isError || !coin) {
    // the backend answers an unknown mint with 404 and `{ error: "not found" }`
    const missing = /404|not found/i.test(String(error));
    return (
      <NoCoin title={missing ? "Coin not found" : "Coin did not load"}>
        {missing ? (
          <EmptyState
            title="No coin at this address"
            detail="A coin launched seconds ago can take a moment to show up. This page keeps checking."
            action={browse}
          />
        ) : (
          <ErrorState title="This coin did not load" />
        )}
      </NoCoin>
    );
  }

  return (
    <div className="space-y-6">
      <CoinHeader coin={coin} />

      <div className={columns}>
        <div className={cell.chart}>
          <PriceChart coin={coin} />
        </div>

        {/* sticks under the navbar; a column taller than the window scrolls until its end is in view */}
        <aside ref={setSide} style={{ top: `min(calc(var(--chrome-top) + 20px), ${sideEnd}px)` }} aria-label="Trade" className={cell.side}>
          <TradePanel coin={coin} className="max-lg:hidden" />
          <PositionCard coin={coin} />
        </aside>

        <CoinTabs coin={coin} solUsd={solUsd} className={cell.tabs} />
      </div>

      <MobileTradeBar coin={coin} />
    </div>
  );
}
