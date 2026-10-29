"use client";

import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { CoinDetail } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { age, sol, tokens, usd } from "@/lib/format";
import { IconTile } from "@/components/ui";

export function OtcPanel({ coin, solUsd }: { coin: CoinDetail; solUsd: number }) {
  const otc = coin.otc;
  const activity = otc.activityBps;
  const color = bucketColor.otcReserve;

  return (
    <section className="surface rounded-[22px] p-5">
      <div className="flex items-center gap-3">
        <IconTile color={color} size={36}>
          <ArrowLeftRight size={16} />
        </IconTile>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">OTC exit</h3>
          <p className="text-xs text-muted">Sell into SOL with zero slippage</p>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-wider text-faint uppercase">Sell limit now</div>
          <div className="num mt-1 text-2xl font-medium">{usd(otc.sellLimitSol * solUsd)}</div>
          <div className="num text-xs text-faint">{sol(otc.sellLimitSol)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] tracking-wider text-faint uppercase">Activity</div>
          <div className="num mt-1 text-2xl font-medium" style={{ color }}>
            {`${(activity / 100).toFixed(0)}%`}
          </div>
          <div className="num text-xs text-faint">{otc.lastContribution ? `last fee ${age(otc.lastContribution)} ago` : "no fees yet"}</div>
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
          <div className="num mt-0.5 text-fg">{usd(otc.contributedSol * solUsd)}</div>
        </div>
        <div className="text-right">
          <div className="text-muted">Burned via OTC</div>
          <div className="num mt-0.5 text-fg">{tokens(otc.burned, coin.decimals, coin.symbol)}</div>
        </div>
      </div>
      {!otc.twapReady && (
        <p className="mt-3 text-[11px] leading-relaxed text-faint">OTC opens once the coin has 30 minutes of price history.</p>
      )}
      <Link
        href={`/otc?coin=${coin.address}`}
        className="mt-4 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elev text-sm font-medium transition-colors hover:bg-elev-2"
      >
        Open OTC desk <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}
