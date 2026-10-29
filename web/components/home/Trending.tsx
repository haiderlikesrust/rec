"use client";

import clsx from "clsx";
import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { useTrending } from "@/lib/data";
import { usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteChip } from "@/components/QuoteChip";
import { Sparkline } from "@/components/Sparkline";
import { Change, SectionHeading, Skeleton } from "@/components/ui";

export function Trending() {
  const { data, isLoading, isError } = useTrending();

  if (isError || (!isLoading && (!data || data.length === 0))) return null;

  return (
    <section>
      <SectionHeading
        eyebrow={
          <>
            <TrendingUp size={12} className="text-accent" /> Trending
          </>
        }
        title="Hot right now"
        aside={<span className="text-xs text-faint">Ranked by 24h volume</span>}
      />
      <div className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <ol className="flex gap-3.5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[178px] w-[244px] shrink-0 rounded-[22px]" />)
            : data!.slice(0, 10).map((c, i) => (
                <li key={c.address} className="shrink-0">
                  <Link
                    href={`/token/${c.address}`}
                    className={clsx(
                      "surface-hover relative flex w-[244px] flex-col overflow-hidden rounded-[22px] p-5",
                      i === 0 ? "ring-spectrum shadow-card" : "surface",
                    )}
                  >
                    <span className="font-display absolute top-3 right-4 text-5xl leading-none font-semibold text-fg/[0.06]">
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <CoinAvatar src={c.image} symbol={c.symbol} seed={c.address} size={42} />
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold">${c.symbol}</div>
                        <div className="truncate text-xs text-muted">{c.name}</div>
                      </div>
                    </div>
                    <Sparkline data={c.spark} width={204} height={44} strokeWidth={2} className="mt-4" />
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <div className="num text-base font-medium">{usd(c.marketCapUsd)}</div>
                        <div className="mt-1">
                          <QuoteChip symbol={c.quote.symbol} logo={c.quote.logo} />
                        </div>
                      </div>
                      <Change value={c.change24h} pill className="text-xs" />
                    </div>
                  </Link>
                </li>
              ))}
        </ol>
      </div>
    </section>
  );
}
