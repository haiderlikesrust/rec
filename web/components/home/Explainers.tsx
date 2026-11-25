"use client";

import { ArrowUpRight, HandCoins, Shield, Vault, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand, feeBreakdown, type PlatformStats } from "@gantry/shared";
import { useStats } from "@/lib/data";
import { runtime } from "@/lib/explorer";
import { bps } from "@/lib/format";
import { IconTile, Panel, Skeleton, toneVar, type Tone } from "@/components/ui";
import { shortUsd } from "./money";

type Card = {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: ReactNode;
  /** the one live figure under the sentence */
  figure: string;
  value: (s: PlatformStats) => number;
};

/**
 * The idea in three cards: the fee and who doesn't get it, the reserve it fills, the fund it fills. Each card ends
 * in one live figure and opens the page that has the rest.
 */
export function Explainers() {
  const { data: stats, isError } = useStats();
  const cluster = stats?.cluster ?? runtime.cluster;
  const curve = feeBreakdown("curve", cluster);
  const pool = feeBreakdown("cpmm", cluster);

  const cards: Card[] = [
    {
      href: brand.docsPath,
      icon: HandCoins,
      tone: "neutral",
      title: "No cut for creators",
      text: `Every trade pays a ${bps(curve.taxBps)} fee (${bps(pool.taxBps)} after a coin graduates), and none of it goes to the creator or a team.`,
      figure: "Paid to holders so far",
      value: (s) => (s.otcPaidSol + s.protectionPaidSol) * s.solUsd,
    },
    {
      href: "/otc",
      icon: Vault,
      tone: "desk",
      title: "Sell with no slippage",
      text: "Half of the fee fills the OTC reserve, a SOL wallet that buys your coins at a posted price.",
      figure: "In the reserve now",
      value: (s) => s.otcReserveSol * s.solUsd,
    },
    {
      href: "/shield",
      icon: Shield,
      tone: "shield",
      title: "Losses partly paid back",
      text: `The other half fills ${brand.shield}, a fund that automatically pays back part of a loss, depending on how long you held.`,
      figure: "In the fund now",
      value: (s) => s.protectionFundSol * s.solUsd,
    },
  ];

  return (
    <section aria-labelledby="home-how">
      <h2 id="home-how" className="sr-only">
        How the fee works
      </h2>
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.title} className="min-w-0">
            <Link href={card.href} className="group block h-full rounded-xl">
              <Panel interactive className="relative flex h-full flex-col p-5 sm:p-6">
                {/* stacked cards set the icon beside the title to stay short; side by side, from 1024px, the icon sits above it */}
                <div className="flex items-center gap-3 lg:block">
                  <IconTile color={toneVar[card.tone]} size={44}>
                    <card.icon size={20} aria-hidden />
                  </IconTile>
                  <h3 className="min-w-0 flex-1 text-[17px] leading-snug font-semibold text-ink lg:mt-5">{card.title}</h3>
                  <ArrowUpRight
                    size={18}
                    aria-hidden
                    className="shrink-0 text-ink-3 transition-colors group-hover:text-ink lg:absolute lg:top-6 lg:right-6"
                  />
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2 lg:mt-2">{card.text}</p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-[13px] text-ink-3 lg:pt-6">
                  <span>{card.figure}</span>
                  <div className="text-[15px] font-medium text-ink tabular-nums">
                    {stats ? shortUsd(card.value(stats)) : isError ? "—" : <Skeleton className="h-4 w-14" />}
                  </div>
                </div>
              </Panel>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
