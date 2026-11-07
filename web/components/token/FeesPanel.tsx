"use client";

import { ArrowLeftRight, Egg, PieChart, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { CoinDetail } from "@cook/shared";
import { brand, buckets } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { sol, tokens, units, usd } from "@/lib/format";
import { IconTile } from "@/components/ui";

const pct = (key: "protection" | "otcReserve") => `${(buckets.find((b) => b.key === key)?.bps ?? 0) / 100}%`;

/** A coin's 3% so far: Meteora's share, the two halves it funded, and what moved through its Nest. */
export function FeesPanel({ coin, solUsd }: { coin: CoinDetail; solUsd: number }) {
  const b = coin.buckets;
  const q = coin.quote;
  const meteoraUsd = units(b.meteoraQuote, q.decimals) * q.usdPerUnit;
  const leader = coin.bloodline && coin.bloodline.leader.address !== coin.address ? coin.bloodline.leader : null;
  const p = coin.protection;
  const halves = [
    {
      key: "protection" as const,
      icon: ShieldCheck,
      label: "Protection pot",
      value: usd(b.solToProtection * solUsd),
      rows: [
        ["Paid in", sol(p.contributedSol)],
        ["Paid to sellers", sol(p.paidSol)],
        ["Left for losses", sol(p.potSol)],
      ],
    },
    {
      key: "otcReserve" as const,
      icon: ArrowLeftRight,
      label: "OTC reserve",
      value: usd(b.solToOtc * solUsd),
      rows: [
        ["Paid in", sol(b.solToOtc)],
        ["Sell credit", sol(coin.otc.creditSol)],
        ["Sell limit now", sol(coin.otc.sellLimitSol)],
      ],
    },
  ];

  return (
    <section className="surface rounded-[24px] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile size={40}>
            <PieChart size={18} />
          </IconTile>
          <div>
            <h3 className="font-display text-[17px] font-semibold">Where its fees went</h3>
            <p className="text-xs text-muted">0% to the creator, 0% to the team</p>
          </div>
        </div>
        <div className="text-right">
          <div className="num font-display text-2xl font-bold">{usd(coin.feesUsd)}</div>
          <div className="num text-[11px] text-faint">{tokens(coin.feesQuote, q.decimals, q.symbol)} lifetime</div>
        </div>
      </div>

      {leader ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-nest-soft px-4 py-3.5 text-sm leading-relaxed text-muted">
          <Egg size={17} className="mt-0.5 shrink-0 text-nest" />
          <p>
            This coin is a copy, so its whole split goes to{" "}
            <Link href={`/token/${leader.address}`} className="font-bold text-nest hover:underline">
              ${leader.symbol}
            </Link>
            , which leads its {brand.nest}: <span className="num font-bold text-fg">{usd(b.sentToLeaderSol * solUsd)}</span> sent so far.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex h-2.5 gap-1" aria-hidden>
            {halves.map((h) => (
              <div key={h.key} className="h-full flex-1 rounded-full" style={{ background: bucketColor[h.key], boxShadow: `0 0 12px -3px ${bucketColor[h.key]}` }} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {halves.map((h) => (
              <div key={h.key} className="rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="flex items-center gap-2.5">
                  <IconTile color={bucketColor[h.key]} size={30} className="rounded-xl">
                    <h.icon size={14} />
                  </IconTile>
                  <span className="font-display text-sm font-semibold">{h.label}</span>
                  <span className="font-display ml-auto text-sm font-bold" style={{ color: bucketColor[h.key] }}>
                    {pct(h.key)}
                  </span>
                </div>
                <div className="num font-display mt-3 text-2xl font-bold">{h.value}</div>
                <dl className="mt-2 space-y-1">
                  {h.rows.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 text-xs">
                      <dt className="text-faint">{k}</dt>
                      <dd className="num font-semibold text-muted">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {b.receivedFromCopiesSol > 0 && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-nest-soft px-3.5 py-2.5 text-xs text-muted">
              <Egg size={14} className="shrink-0 text-nest" />
              <span>
                Includes <span className="num font-bold text-nest">{usd(b.receivedFromCopiesSol * solUsd)}</span> from copies in its {brand.nest}.
              </span>
            </p>
          )}
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Meteora&apos;s protocol share: <span className="num text-muted">{usd(meteoraUsd)}</span>. Everything else is converted to SOL and split
        in half.
      </p>
      {units(b.pendingQuote, q.decimals) > 0 && (
        <p className="mt-2 rounded-2xl bg-sunk px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
          <span className="num text-fg">{tokens(b.pendingQuote, q.decimals, q.symbol)}</span> collected, waiting for the next split.
        </p>
      )}
    </section>
  );
}
