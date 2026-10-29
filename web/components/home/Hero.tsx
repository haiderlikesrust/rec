"use client";

import { Check, Rocket } from "lucide-react";
import { brand } from "@cook/shared";
import { useStats } from "@/lib/data";
import { tokens, usd } from "@/lib/format";
import { AnimatedNumber, ButtonLink } from "@/components/ui";
import { ContractAddress } from "./ContractAddress";
import { FeeRing } from "./FeeRing";

export function Hero() {
  const { data: s } = useStats();
  const solUsd = s?.solUsd ?? 0;
  const values = s
    ? {
        protection: usd(s.protectionFundSol * solUsd),
        otcReserve: usd(s.otcReserveSol * solUsd),
        mainBuyback: `${tokens(s.mainBurned)} burned`,
        coinBuyback: `${usd(s.coinsBurnedSol * solUsd)} burned`,
        airdrop: `${usd(s.airdroppedSol * solUsd)} paid`,
      }
    : undefined;

  return (
    <section className="relative grid grid-cols-1 items-center gap-14 pt-4 pb-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:pt-10">
      <div className="animate-fade-up">
        <h1 className="font-display text-[52px] leading-[0.92] font-semibold sm:text-7xl lg:text-[88px]">
          Every fee
          <br />
          <span className="text-spectrum">comes back.</span>
        </h1>

        <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-muted">
          Launch a coin in one transaction, paired with SOL, a stablecoin or a tokenized stock. Every buy and sell pays
          3%, and creators and the team take none of it: buybacks and burns, a SOL exit reserve, loss protection, and
          airdrops to holders who bought high.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink href="/launch" size="lg">
            <Rocket size={17} /> Launch a coin
          </ButtonLink>
          <ButtonLink href="#coins" size="lg" variant="secondary">
            Explore coins
          </ButtonLink>
        </div>

        <ContractAddress className="mt-6" />

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
          {["0% to creators", "0% to the team", "Every fee we collect goes back"].map((t) => (
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
                  {s ? <AnimatedNumber value={(s.totalFeesSol - s.meteoraFeesSol) * solUsd} format={usd} /> : "—"}
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
