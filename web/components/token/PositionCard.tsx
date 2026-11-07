"use client";

import clsx from "clsx";
import { ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { coverageBpsForHold, PROTECTION_CAP_X_TAX, protectionTiers, RUG_COVERAGE_BPS, type CoinDetail } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useSolUsd, useWalletSummary } from "@/lib/data";
import { bps, duration, tokens, units, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { IconTile, Row, Skeleton } from "@/components/ui";
import { TinyPrice } from "./TinyPrice";

export function PositionCard({ coin }: { coin: CoinDetail }) {
  const address = useAddress();
  const { data, isLoading } = useWalletSummary(address);
  const solUsd = useSolUsd();
  if (!address) return null;
  const pos = data?.positions.find((p) => p.coin.address === coin.address);
  const q = coin.quote;

  if (isLoading) return <Skeleton className="h-44 rounded-[24px]" />;
  if (!pos || units(pos.balance, coin.decimals) === 0) {
    return (
      <section className="surface flex items-start gap-3 rounded-[24px] p-5">
        <IconTile size={36}>
          <Wallet size={16} />
        </IconTile>
        <div>
          <h3 className="font-display text-[17px] font-semibold">Your position</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            You don&apos;t hold ${coin.symbol} yet. Buys through any app count toward your entry price.
          </p>
        </div>
      </section>
    );
  }

  const hold = pos.firstBuyAt ? Date.now() / 1000 - pos.firstBuyAt : 0;
  const tierBps = coverageBpsForHold(hold);
  const maxPayoutSol = coin.protection?.maxPayoutSol ?? 0;
  const nextTier = protectionTiers.find((t) => t.minHold > hold);
  const basis = units(pos.costBasis, q.decimals);
  const pnlPct = basis > 0 ? (pos.unrealized / basis) * 100 : 0;
  const up = pos.unrealizedUsd >= 0;

  return (
    <section className="surface rounded-[24px] p-5">
      <div className="flex items-center gap-3">
        <IconTile size={36}>
          <Wallet size={16} />
        </IconTile>
        <h3 className="font-display text-[17px] font-semibold">Your position</h3>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="num font-display truncate text-[28px] leading-tight font-bold">{tokens(pos.balance, coin.decimals)}</div>
          <div className="num text-xs text-muted">
            ${coin.symbol} ≈ {usd(pos.valueUsd)}
          </div>
        </div>
        <div className={clsx("num shrink-0 rounded-2xl px-3 py-1.5 text-right text-sm font-bold", up ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
          {up ? "+" : ""}
          {usd(pos.unrealizedUsd)}
          <div className="text-[11px]">
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(1)}%
          </div>
        </div>
      </div>
      <div className="mt-4 divide-y divide-line border-t border-line">
        <Row
          label="Avg entry"
          value={
            q.usdPerUnit > 0 ? (
              <>
                $<TinyPrice value={pos.avgEntry * q.usdPerUnit} />
              </>
            ) : (
              <>
                <TinyPrice value={pos.avgEntry} /> {q.symbol}
              </>
            )
          }
        />
        <Row label="Realized P/L" value={usd(pos.realizedPnlUsd)} />
        <Row label="Tax paid" value={tokens(pos.taxPaid, q.decimals, q.symbol)} />
      </div>

      <div className="mt-3 rounded-2xl bg-sunk px-3.5 py-3 text-xs shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={14} style={{ color: bucketColor.protection }} className="shrink-0" />
          <span className="text-muted">
            Loss cover if sold now: <span className="num font-bold text-fg">{bps(tierBps)}</span>
          </span>
          <Link href="/soft-landing" className="font-display ml-auto font-semibold text-accent-2 hover:underline">
            Rules
          </Link>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1">
          {protectionTiers.map((t) => (
            <div
              key={t.minHold}
              className="h-1.5 rounded-full"
              style={{ background: hold >= t.minHold && t.coverageBps > 0 ? bucketColor.protection : "var(--line-strong)" }}
              title={`${t.label}: ${bps(t.coverageBps)}`}
            />
          ))}
        </div>
        <p className="num mt-2.5 text-[11px] text-muted">
          {bps(tierBps)} of your loss, up to {usd(maxPayoutSol * solUsd)} from this coin&apos;s pot and {PROTECTION_CAP_X_TAX}× the tax you paid
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Held {duration(hold)}.{nextTier && ` Rate rises to ${bps(nextTier.coverageBps)} after ${duration(nextTier.minHold - hold)} more.`} Rugs
          get {bps(RUG_COVERAGE_BPS)}. Paid to your wallet automatically about a minute after you sell.
        </p>
      </div>
    </section>
  );
}
