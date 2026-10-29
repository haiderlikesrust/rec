"use client";

import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { bucketColor } from "@/lib/buckets";
import { useOtc, useStats } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { sol, usd } from "@/lib/format";
import { AnimatedNumber, IconTile, Skeleton } from "@/components/ui";

/** Live USD value of the OTC reserve wallet, for the page header. */
export function ReserveMetric() {
  const { data: otc } = useOtc();
  const { data: stats } = useStats();
  const solUsd = stats?.solUsd ?? 0;
  const reserve = otc?.reserveSol ?? stats?.otcReserveSol;
  return (
    <div className="ring-spectrum shadow-card relative min-w-[260px] overflow-hidden rounded-[22px] p-5 sm:p-6">
      <div
        className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ background: bucketColor.otcReserve }}
        aria-hidden
      />
      <div className="flex items-center gap-2.5">
        <IconTile color={bucketColor.otcReserve} size={32}>
          <ArrowLeftRight size={15} />
        </IconTile>
        <span className="eyebrow">Reserve balance</span>
      </div>
      <div className="font-display mt-4 text-4xl leading-none font-semibold sm:text-5xl">
        {reserve !== undefined && solUsd > 0 ? (
          <AnimatedNumber value={reserve * solUsd} format={usd} />
        ) : (
          <Skeleton className="inline-block h-10 w-32 align-middle" />
        )}
      </div>
      <div className="num mt-2 text-sm text-muted">{reserve !== undefined ? `${sol(reserve)} of exit liquidity` : " "}</div>
      {otc?.wallet && (
        <a
          href={explorerAddress(otc.wallet)}
          target="_blank"
          rel="noreferrer"
          className="num mt-3 inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-fg"
        >
          Reserve wallet {otc.wallet.slice(0, 4)}…{otc.wallet.slice(-4)} <ArrowUpRight size={11} />
        </a>
      )}
    </div>
  );
}
