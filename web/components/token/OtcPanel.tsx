"use client";

import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import type { CoinDetail } from "@cook/shared";
import { CHAIN_ID, abis, addresses } from "@/lib/contracts";
import { bucketColor } from "@/lib/buckets";
import { age, eth, tokens, units, usd } from "@/lib/format";
import { IconTile } from "@/components/ui";

export function useOtcCoin(token?: Address) {
  const enabled = !!token && !!addresses.otcReserve;
  const base = { address: addresses.otcReserve!, abi: abis.otc, chainId: CHAIN_ID } as const;
  const res = useReadContracts({
    contracts: [
      { ...base, functionName: "sellLimit", args: [token!] },
      { ...base, functionName: "activityBps", args: [token!] },
      { ...base, functionName: "coins", args: [token!] },
    ],
    query: { enabled, refetchInterval: 10_000 },
  });
  const [limit, activity, coin] = res.data ?? [];
  const c = coin?.result as readonly [bigint, bigint, number, bigint, bigint, bigint] | undefined;
  return {
    isLoading: res.isLoading,
    limit: limit?.result as bigint | undefined,
    activityBps: activity?.result !== undefined ? Number(activity.result) : undefined,
    credit: c?.[0],
    contributed: c?.[1],
    lastContribution: c ? Number(c[2]) : undefined,
    inventory: c?.[3],
  };
}

export function OtcPanel({ coin, ethUsd }: { coin: CoinDetail; ethUsd: number }) {
  const otc = useOtcCoin(coin.address);
  const limit = otc.limit ?? 0n;
  const activity = otc.activityBps ?? 0;
  const color = bucketColor.otcReserve;

  return (
    <section className="surface rounded-[22px] p-5">
      <div className="flex items-center gap-3">
        <IconTile color={color} size={36}>
          <ArrowLeftRight size={16} />
        </IconTile>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">OTC exit</h3>
          <p className="text-xs text-muted">Sell into ETH with zero slippage</p>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-wider text-faint uppercase">Sell limit now</div>
          <div className="num mt-1 text-2xl font-medium">{otc.isLoading ? "…" : eth(units(limit))}</div>
          <div className="num text-xs text-faint">{usd(units(limit) * ethUsd)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] tracking-wider text-faint uppercase">Activity</div>
          <div className="num mt-1 text-2xl font-medium" style={{ color }}>
            {otc.isLoading ? "…" : `${(activity / 100).toFixed(0)}%`}
          </div>
          <div className="num text-xs text-faint">
            {otc.lastContribution ? `last fee ${age(otc.lastContribution)} ago` : "no fees yet"}
          </div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sunk">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${activity / 100}%`, background: color, boxShadow: `0 0 12px -2px ${color}` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <div>
          <div className="text-muted">Contributed</div>
          <div className="num mt-0.5 text-fg">{otc.contributed !== undefined ? eth(units(otc.contributed)) : "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-muted">Reserve inventory</div>
          <div className="num mt-0.5 text-fg">{otc.inventory !== undefined ? tokens(otc.inventory, 18, coin.symbol) : "—"}</div>
        </div>
      </div>
      <Link
        href={`/otc?coin=${coin.address}`}
        className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elev text-sm font-medium transition-colors hover:bg-elev-2"
      >
        Open OTC desk <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}
