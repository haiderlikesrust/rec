"use client";

import { ArrowLeftRight } from "lucide-react";
import { useBalance } from "wagmi";
import { bucketColor } from "@/lib/buckets";
import { CHAIN_ID, addresses } from "@/lib/contracts";
import { useStats } from "@/lib/data";
import { units, usd } from "@/lib/format";
import { AnimatedNumber, IconTile, Skeleton } from "@/components/ui";

/** Big live ETH balance of the OTC reserve, for the page header. */
export function ReserveMetric() {
  const reserve = useBalance({ address: addresses.otcReserve, chainId: CHAIN_ID, query: { refetchInterval: 10_000 } });
  const { data: stats } = useStats();
  const eth = reserve.data ? units(reserve.data.value) : undefined;
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
        {eth !== undefined ? <AnimatedNumber value={eth} format={(n) => `${n.toFixed(3)}`} /> : <Skeleton className="inline-block h-10 w-32 align-middle" />}
        <span className="ml-2 text-xl text-muted">ETH</span>
      </div>
      <div className="num mt-2 text-sm text-muted">
        {eth !== undefined && stats ? `${usd(eth * stats.ethUsd)} of exit liquidity` : " "}
      </div>
    </div>
  );
}
