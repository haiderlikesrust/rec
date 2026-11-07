"use client";

import { ArrowLeftRight, Check, Rocket, ShieldCheck } from "lucide-react";
import { brand, buckets } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useStats } from "@/lib/data";
import { sol, usd } from "@/lib/format";
import { LogoMark } from "@/components/LogoMark";
import { AnimatedNumber, ButtonLink, IconTile, Skeleton } from "@/components/ui";

const pct = (key: "protection" | "otcReserve") => `${(buckets.find((b) => b.key === key)?.bps ?? 0) / 100}%`;

export function Hero() {
  const { data: s, isError } = useStats();
  const solUsd = s?.solUsd ?? 0;
  const wait = isError ? "—" : <Skeleton className="h-7 w-24" />;
  const halves = [
    {
      key: "protection" as const,
      icon: ShieldCheck,
      title: brand.landing,
      value: s ? usd(s.protectionFundSol * solUsd) : wait,
      sub: s ? `${usd(s.protectionPaidSol * solUsd)} paid back on losses` : "",
    },
    {
      key: "otcReserve" as const,
      icon: ArrowLeftRight,
      title: "OTC reserve",
      value: s ? usd(s.otcReserveSol * solUsd) : wait,
      sub: s ? `${sol(s.otcReserveSol)} to sell into, no slippage` : "",
    },
  ];

  return (
    <section className="relative grid grid-cols-1 items-center gap-12 pt-2 pb-4 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:pt-8">
      <div className="animate-fade-up">
        <h1 className="font-display text-[52px] leading-[0.95] font-bold sm:text-7xl lg:text-[84px]">
          Launch coins
          <br />
          that <span className="text-spectrum">land soft.</span>
        </h1>

        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
          Every buy and sell pays 3%, and none of it goes to creators or the team. Half fills a SOL reserve you can sell
          into without slippage. Half pays back part of your losses, automatically. Copies of a coin feed the original.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="/launch" size="lg">
            <Rocket size={18} /> Launch a coin
          </ButtonLink>
          <ButtonLink href="#coins" size="lg" variant="secondary">
            Explore coins
          </ButtonLink>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted">
          {["Sell into SOL, no slippage", "Losses partly paid back", `Copies feed the original (${brand.nest})`].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-up-soft text-up">
                <Check size={12} strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mx-auto w-full max-w-[480px] animate-fade-up [animation-delay:120ms]">
        <LogoMark size={92} className="animate-float absolute -top-9 -right-3 z-10 drop-shadow-[0_18px_30px_rgba(255,122,69,0.35)] sm:-right-7" />
        <div className="ring-spectrum shadow-pop relative overflow-hidden rounded-[32px] p-6 sm:p-7">
          <div className="spectrum pointer-events-none absolute -top-24 -left-20 h-52 w-52 rounded-full opacity-[0.14] blur-3xl" aria-hidden />
          <span className="eyebrow relative">Where every 3% goes · live</span>
          <div className="relative mt-3">
            <div className="font-display text-[44px] leading-none font-bold sm:text-[52px]">
              {s ? <AnimatedNumber value={(s.totalFeesSol - s.meteoraFeesSol) * solUsd} format={usd} /> : isError ? "—" : <Skeleton className="h-12 w-44" />}
            </div>
            <p className="mt-2 text-sm text-muted">
              returned to holders{s ? ` from ${s.coins} ${s.coins === 1 ? "coin" : "coins"}` : ""}, after Meteora&apos;s share
            </p>
          </div>

          {/* the split itself: one bar, two halves */}
          <div className="relative mt-6 flex h-3 gap-1.5" aria-hidden>
            {halves.map((h) => (
              <div
                key={h.key}
                className="h-full flex-1 rounded-full"
                style={{ background: bucketColor[h.key], boxShadow: `0 0 16px -2px ${bucketColor[h.key]}` }}
              />
            ))}
          </div>

          <div className="relative mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {halves.map((h) => (
              <div key={h.key} className="rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="flex items-center justify-between gap-2">
                  <IconTile color={bucketColor[h.key]} size={34}>
                    <h.icon size={16} />
                  </IconTile>
                  <span className="font-display text-lg font-bold" style={{ color: bucketColor[h.key] }}>
                    {pct(h.key)}
                  </span>
                </div>
                <div className="font-display mt-3 text-[15px] font-semibold">{h.title}</div>
                <div className="num mt-1 truncate text-2xl font-extrabold">{h.value}</div>
                <div className="mt-0.5 text-xs text-faint">{h.sub}</div>
              </div>
            ))}
          </div>

          <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
            <span>24h volume</span>
            <span className="num font-bold text-fg">{s ? usd(s.volume24hUsd) : "—"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
