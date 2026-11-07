"use client";

import clsx from "clsx";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { brand, otcPolicy } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useOtc, useStats } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { bps, short, sol, usd } from "@/lib/format";
import { AnimatedNumber, Eyebrow, IconTile, Skeleton } from "@/components/ui";

const SKY = bucketColor.otcReserve;

/** The OTC reserve at a glance: its live balance, what it has paid sellers, and the desk's terms. */
export function ReservePanel({ className }: { className?: string }) {
  const { data: otc, isError } = useOtc();
  const { data: stats } = useStats();
  const solUsd = stats?.solUsd ?? 0;
  const reserve = otc?.reserveSol ?? stats?.otcReserveSol;
  const coins = otc?.coins ?? [];
  const open = coins.filter((c) => c.sellLimitSol > 0).length;

  const tiles = [
    {
      label: "Paid to sellers",
      value: stats ? usd(stats.otcPaidSol * solUsd) : undefined,
      sub: stats ? sol(stats.otcPaidSol) : " ",
    },
    { label: "Coins open", value: otc ? `${open} / ${coins.length}` : undefined, sub: "earned by their own fees" },
    { label: "Spread", value: bps(otcPolicy.spreadBps), sub: "the same fee as a trade" },
    {
      label: "Per-wallet cap",
      value: otc && solUsd > 0 ? usd(otc.walletDailyCapSol * solUsd) : otc ? sol(otc.walletDailyCapSol) : undefined,
      sub: "per coin, per day",
    },
  ];

  return (
    <div className={clsx("surface relative min-w-0 overflow-hidden rounded-[32px] p-6 sm:p-8", className)}>
      <div className="absolute -top-28 -right-24 h-72 w-72 rounded-full opacity-20 blur-3xl" style={{ background: SKY }} aria-hidden />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconTile color={SKY} size={40}>
              <ArrowLeftRight size={18} />
            </IconTile>
            <Eyebrow>Reserve balance</Eyebrow>
          </div>
          {otc?.wallet && (
            <a
              href={explorerAddress(otc.wallet)}
              target="_blank"
              rel="noreferrer"
              className="num inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-sunk/70 px-3.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Wallet {short(otc.wallet)} <ArrowUpRight size={12} />
            </a>
          )}
        </div>

        <div className="num font-display mt-6 text-5xl leading-none font-semibold sm:text-6xl">
          {reserve !== undefined && solUsd > 0 ? (
            <AnimatedNumber value={reserve * solUsd} format={usd} />
          ) : isError && reserve === undefined ? (
            <span className="text-faint">—</span>
          ) : (
            <Skeleton className="inline-block h-12 w-44 align-middle" />
          )}
        </div>
        <p className="num mt-3 text-sm text-muted">{reserve !== undefined ? `${sol(reserve)} of exit liquidity, ready to buy and burn` : " "}</p>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 bg-sunk p-4">
              <div className="text-xs text-muted">{t.label}</div>
              <div className="num font-display mt-1.5 truncate text-xl font-semibold sm:text-2xl">
                {t.value ?? <Skeleton className="inline-block h-6 w-16 align-middle" />}
              </div>
              <div className="num mt-0.5 text-[11px] leading-snug text-faint">{t.sub}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SKY }} />
          <span>
            Funded by half of every trading fee on every coin, converted to SOL after Meteora&apos;s share. The other half goes to the{" "}
            <Link href="/soft-landing" className="font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-up">
              {brand.landing} fund
            </Link>
            .
          </span>
        </p>
      </div>
    </div>
  );
}
