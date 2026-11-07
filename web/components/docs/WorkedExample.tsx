"use client";

import { ArrowLeftRight, Egg, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  PROTECTION_PAYOUT_BPS,
  TAX_BPS,
  brand,
  communityShareBps,
  otcPolicy,
  protectionTiers,
  splitFees,
  volumeForFees,
  type BucketKey,
} from "@cook/shared";
import { buckets } from "@/lib/buckets";
import { IconTile, Segmented } from "@/components/ui";

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const TOP_TIER = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 10_000;
const CREDIT_X = otcPolicy.creditMultiplierBps / 10_000;
const PAYOUT = PROTECTION_PAYOUT_BPS / 10_000;

const icon: Record<BucketKey, LucideIcon> = { protection: ShieldCheck, otcReserve: ArrowLeftRight };

const meaning: Record<BucketKey, (amount: number) => string> = {
  otcReserve: (a) =>
    `SOL in the shared reserve, credited to this coin: ${$(a * CREDIT_X)} of no-slippage sell capacity (${CREDIT_X}× credit), at most ${otcPolicy.maxShareOfReserveBps / 100}% of the reserve at a time. Every coin sold into it is burned.`,
  protection: (a) =>
    `This coin's pot for its sellers' realized losses. One payout takes at most ${PAYOUT * 100}% of what's left (the first up to ${$(a * PAYOUT)}), so it lasts across many sellers; at the ${TOP_TIER * 100}% tier it can pay back about ${$(a / TOP_TIER)} of losses in all.`,
};

const options = [10_000, 20_000] as const;
type Fees = `${(typeof options)[number]}`;

/** $10k / $20k toggle: the volume behind the fees, Meteora's share, and what reaches each half. All from shared helpers. */
export function WorkedExample() {
  const [fees, setFees] = useState<Fees>("10000");
  const total = Number(fees);
  const otherTotal = total === options[0] ? options[1] : options[0];
  const share = communityShareBps(false) / 10_000;
  const shareRef = communityShareBps(true) / 10_000;
  const community = total * share;
  const meteora = total - community;
  const meteoraRef = total - total * shareRef;
  const split = splitFees(community);
  const other = splitFees(otherTotal * share);
  const k = (n: number) => `$${n / 1000}k`;

  const stats = [
    { label: "Trading volume", value: $(volumeForFees(total)), sub: `at the ${TAX_BPS / 100}% fee` },
    { label: "Fees", value: $(total), sub: "from buys and sells" },
    { label: "Meteora keeps", value: $(meteora), sub: `${Math.round((1 - share) * 100)}% protocol share` },
    { label: "Split in SOL", value: $(community), sub: "50 / 50 below" },
  ];

  return (
    <div className="ring-spectrum shadow-card my-8 rounded-[32px] p-5 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">A coin that generated</span>
          <div className="num font-display mt-2 text-5xl leading-none font-semibold text-fg sm:text-6xl">{$(total)}</div>
          <div className="mt-2 text-sm text-muted">in fees</div>
        </div>
        <Segmented
          value={fees}
          onChange={setFees}
          options={options.map((o) => ({ value: `${o}` as Fees, label: `${k(o)} fees` }))}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line shadow-[inset_0_0_0_1px_var(--line)] lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 bg-sunk p-4">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="num font-display mt-1.5 truncate text-xl font-semibold text-fg sm:text-2xl">{s.value}</div>
            <div className="mt-0.5 truncate text-[11px] text-faint">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex h-9 w-full gap-1" aria-hidden>
        <div
          className="flex min-w-0 items-center justify-center rounded-l-xl rounded-r-[4px] bg-line-strong text-[11px] font-semibold text-muted"
          style={{ width: `${(1 - share) * 100}%` }}
        >
          <span className="num truncate px-1">Meteora</span>
        </div>
        {buckets.map((b, i) => (
          <div
            key={b.key}
            className={`flex min-w-0 items-center justify-center text-[12px] font-bold text-[#0b1124] ${i === buckets.length - 1 ? "rounded-l-[4px] rounded-r-xl" : "rounded-[4px]"}`}
            style={{ width: `${(b.bps / 10_000) * share * 100}%`, background: b.color }}
          >
            <span className="num truncate px-1">{$(split[b.key])}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {buckets.map((b) => {
          const Icon = icon[b.key];
          return (
            <div key={b.key} className="rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
              <div className="flex items-center gap-3">
                <IconTile color={b.color} size={36}>
                  <Icon size={17} />
                </IconTile>
                <span className="font-display text-[15px] font-semibold text-fg">{b.label}</span>
                <span className="num ml-auto text-xs text-faint">{b.bps / 100}%</span>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num font-display text-3xl font-semibold" style={{ color: b.color }}>
                  {$(split[b.key])}
                </span>
                <span className="num text-xs text-faint">
                  {$(other[b.key])} at {k(otherTotal)}
                </span>
              </div>
              <div className="mt-2 text-[13px] leading-relaxed text-muted">{meaning[b.key](split[b.key])}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-nest-soft px-4 py-3.5 text-[13px] leading-relaxed">
        <Egg size={16} className="mt-0.5 shrink-0 text-nest" />
        <div className="text-muted">
          <span className="font-semibold text-fg">If this coin were a copy that doesn&apos;t lead its {brand.nest},</span> both
          halves would go to the leader instead: {$(split.otcReserve)} to the leader&apos;s OTC credit and {$(split.protection)} to its{" "}
          {brand.landing} pot.
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-2xl bg-up-soft px-4 py-3.5 text-[13px] leading-relaxed">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-up" />
        <div className="text-muted">
          <span className="font-semibold text-fg">$0 to the creator, $0 to the team.</span> Meteora keeps {$(meteora)} ({$(meteoraRef)}{" "}
          if every trade went through {brand.name}, which would put {$(splitFees(total * shareRef).otcReserve)} in each half). Both
          halves land as SOL even if the coin trades against USDC or a stock token.
        </div>
      </div>
    </div>
  );
}
