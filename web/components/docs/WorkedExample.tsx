"use client";

import clsx from "clsx";
import { ArrowLeftRight, Flame, Gift, ShieldCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { brand, communityShareBps, protectionTiers, splitFees, volumeForFees, type BucketKey } from "@cook/shared";
import { buckets } from "@/lib/buckets";
import { IconTile, Segmented } from "@/components/ui";

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const TOP_TIER_PCT = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 100;

const icon: Record<BucketKey, LucideIcon> = {
  protection: ShieldCheck,
  otcReserve: ArrowLeftRight,
  mainBuyback: Flame,
  coinBuyback: Flame,
  airdrop: Gift,
};

const meaning: Record<BucketKey, (amount: number) => string> = {
  protection: (a) =>
    `Pays back realized losses on this coin, drawn in proportion to what it paid in. At the ${TOP_TIER_PCT}% tier, ${$(a)} covers about ${$(a / (TOP_TIER_PCT / 100))} of losses.`,
  otcReserve: (a) => `SOL in the reserve wallet. This coin earns ${$(a * 2)} of no-slippage sell capacity (2× credit).`,
  mainBuyback: () => `Buys ${brand.mainTicker} on its pool and burns it.`,
  coinBuyback: () => `Buys this coin in its own pool and burns it. Supply only goes down.`,
  airdrop: () => `Shared by holders whose average entry is above the price, weighted by how far underwater they are.`,
};

/** $10k / $20k toggle showing exactly where a coin's fees go. */
export function WorkedExample() {
  const [fees, setFees] = useState<"10000" | "20000">("10000");
  const total = Number(fees);
  const share = communityShareBps(false) / 10_000;
  const community = total * share;
  const meteora = total - community;
  const meteoraWithReferral = total - total * (communityShareBps(true) / 10_000);
  const split = splitFees(community);
  const other = splitFees((total === 10_000 ? 20_000 : 10_000) * share);

  return (
    <div className="ring-spectrum shadow-card my-8 rounded-[22px] p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="eyebrow">A coin that generated</span>
          <div className="font-display mt-2 text-5xl leading-none font-semibold text-fg">{$(total)}</div>
          <div className="num mt-2 text-sm text-muted">in fees ≈ {$(volumeForFees(total))} of trading volume at 3%</div>
          <div className="num mt-1 text-sm text-muted">
            {$(meteora)} Meteora protocol fee → <span className="text-fg">{$(community)} split below</span>
          </div>
        </div>
        <Segmented
          value={fees}
          onChange={setFees}
          options={[
            { value: "10000", label: "$10k fees" },
            { value: "20000", label: "$20k fees" },
          ]}
        />
      </div>

      <div className="mt-7 flex h-9 w-full gap-1 overflow-hidden rounded-xl">
        <div
          className="flex min-w-0 items-center justify-center rounded-lg bg-line-strong text-[11px] font-semibold text-muted"
          style={{ width: `${(1 - share) * 100}%` }}
          title={`Meteora protocol fee: ${$(meteora)}`}
        >
          <span className="num hidden truncate px-1 sm:inline">Meteora</span>
        </div>
        {buckets.map((b) => (
          <div
            key={b.key}
            className="flex min-w-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white/95"
            style={{ width: `${(b.bps / 100) * share}%`, background: b.color }}
            title={`${b.label}: ${$(split[b.key])}`}
          >
            <span className="num hidden truncate px-1 sm:inline">{$(split[b.key])}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {buckets.map((b, i) => {
          const Icon = icon[b.key];
          return (
            <div
              key={b.key}
              className={clsx("rounded-2xl border border-line bg-sunk/60 p-4 sm:p-5", i === 0 && "sm:col-span-2")}
            >
              <div className="flex items-center gap-3">
                <IconTile color={b.color} size={34}>
                  <Icon size={16} />
                </IconTile>
                <span className="text-sm font-medium text-fg">{b.label}</span>
                <span className="num ml-auto text-xs text-faint">{b.bps / 100}%</span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold" style={{ color: b.color }}>
                  {$(split[b.key])}
                </span>
                <span className="num text-xs text-faint">
                  {total === 10_000 ? "→" : "←"} {$(other[b.key])} at {total === 10_000 ? "$20k" : "$10k"}
                </span>
              </div>
              <p className="!mt-2 text-[13px] leading-relaxed text-muted">{meaning[b.key](split[b.key])}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-up-soft px-4 py-3.5 text-sm">
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-up" />
        <p className="!mt-0 text-fg">
          <strong>Everything {brand.name} collects stays with the community.</strong>{" "}
          <span className="text-muted">
            $0 goes to the creator and $0 goes to the team. Meteora keeps {$(meteora)} as its protocol fee ({$(meteoraWithReferral)}{" "}
            if every trade went through {brand.name}). The {$(split.protection + split.otcReserve)} for the fund and reserve lands
            as SOL even if the coin trades against USDC or a stock token.
          </span>
        </p>
      </div>
    </div>
  );
}
