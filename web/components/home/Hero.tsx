"use client";

import { ArrowRight, Check, Rocket } from "lucide-react";
import Link from "next/link";
import { brand } from "@cook/shared";
import { useStats } from "@/lib/data";
import { tokens, units, usd } from "@/lib/format";
import { AnimatedNumber, ButtonLink } from "@/components/ui";
import { FeeRing } from "./FeeRing";

export function Hero() {
  const { data: s } = useStats();
  const ethUsd = s?.ethUsd ?? 0;
  const values = s
    ? {
        protection: `${units(s.protectionFundEth).toFixed(2)} ETH`,
        otcReserve: `${units(s.otcReserveEth).toFixed(2)} ETH`,
        mainBuyback: `${tokens(s.mainBurned)} burned`,
        coinBuyback: `${usd(s.coinsBurnedEth * ethUsd)} burned`,
        airdrop: `${usd(s.airdroppedEth * ethUsd)} paid`,
      }
    : undefined;

  return (
    <section className="relative grid grid-cols-1 items-center gap-14 pt-4 pb-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:pt-10">
      <div className="animate-fade-up">
        <Link
          href="/docs"
          className="group inline-flex items-center gap-2.5 rounded-full border border-line bg-elev/70 py-1.5 pr-3 pl-2.5 text-xs text-muted shadow-card transition-colors hover:border-line-strong hover:text-fg"
        >
          <span className="live-dot" />
          <span>Live on Robinhood Chain</span>
          <span className="h-3 w-px bg-line-strong" />
          <span className="text-fg">How it works</span>
          <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </Link>

        <h1 className="font-display mt-7 text-[52px] leading-[0.92] font-semibold sm:text-7xl lg:text-[88px]">
          Every fee
          <br />
          <span className="text-spectrum">comes back.</span>
        </h1>

        <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
          Launch a coin in one transaction. Every buy and sell pays 3%, and all of it returns to the people trading:
          buybacks and burns, an ETH exit reserve, loss protection, and airdrops to holders who bought high.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink href="/launch" size="lg">
            <Rocket size={17} /> Launch a coin
          </ButtonLink>
          <ButtonLink href="#coins" size="lg" variant="secondary">
            Explore coins
          </ButtonLink>
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
          {["0% to creators", "0% to the team", "100% to the community"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-up-soft text-up">
                <Check size={12} strokeWidth={3} />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mx-auto w-full max-w-[460px] animate-fade-up [animation-delay:120ms]">
        <div className="ring-spectrum shadow-pop rounded-[32px] p-6 sm:p-8">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Where every 3% goes</span>
            <span className="num text-xs text-faint">live</span>
          </div>
          <FeeRing
            size={280}
            values={values}
            center={
              <>
                <span className="eyebrow">Returned</span>
                <span className="font-display mt-1 text-[42px] leading-none font-semibold">
                  {s ? <AnimatedNumber value={s.totalFeesEth * ethUsd} format={usd} /> : "—"}
                </span>
                <span className="mt-2 text-xs text-muted">to {brand.name} traders &amp; holders</span>
              </>
            }
          />
        </div>
      </div>
    </section>
  );
}
