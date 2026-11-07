"use client";

import { ArrowLeftRight, ArrowUpRight, Egg, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BLOODLINE,
  PROTECTION_CAP_X_TAX,
  PROTECTION_PAYOUT_BPS,
  RUG_COVERAGE_BPS,
  brand,
  buckets,
  otcPolicy,
  protectionTiers,
  type TreasuryWallet,
} from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useStats } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { short, sol, usd } from "@/lib/format";
import { IconTile, SectionHeading, Skeleton } from "@/components/ui";

const roleColor: Record<TreasuryWallet["role"], string> = {
  fees: "var(--accent)",
  otc: bucketColor.otcReserve,
  protection: bucketColor.protection,
  airdrop: "var(--nest)",
};

const roleLabel: Record<TreasuryWallet["role"], string> = {
  fees: "Fee wallet",
  otc: "OTC reserve",
  protection: brand.landing,
  airdrop: `${brand.nest} entries`,
};

/** The backend-controlled wallets, with live balances and Solscan links, so anyone can audit them. */
export function TreasuryWallets({ wallets, solUsd, className }: { wallets: TreasuryWallet[]; solUsd: number; className?: string }) {
  if (!wallets.length) return null;
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {wallets.map((w) => (
          <a
            key={w.role}
            href={explorerAddress(w.address)}
            target="_blank"
            rel="noreferrer"
            title={w.label}
            className="surface surface-hover group flex items-center gap-3 rounded-2xl px-4 py-3"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor[w.role], boxShadow: `0 0 10px ${roleColor[w.role]}` }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[13px] font-semibold whitespace-nowrap">{roleLabel[w.role]}</span>
                <span className="num text-[13px] font-bold">{usd(w.sol * solUsd)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="num truncate text-xs text-faint">{short(w.address)}</span>
                <span className="num shrink-0 text-[11px] text-faint">{sol(w.sol)}</span>
              </div>
            </div>
            <ArrowUpRight size={13} className="shrink-0 text-faint transition-colors group-hover:text-fg" />
          </a>
        ))}
      </div>
    </div>
  );
}

const bps = (n: number) => `${n / 100}%`;
const topTier = Math.max(...protectionTiers.map((t) => t.coverageBps));
const share = (key: "protection" | "otcReserve") => bps(buckets.find((b) => b.key === key)?.bps ?? 0);

function Half({
  icon: Icon,
  color,
  pct,
  title,
  value,
  sub,
  body,
  facts,
  href,
  cta,
}: {
  icon: typeof ShieldCheck;
  color: string;
  pct: string;
  title: string;
  value: ReactNode;
  sub: ReactNode;
  body: string;
  facts: string[];
  href: string;
  cta: string;
}) {
  return (
    <Link href={href} className="surface surface-hover group relative flex flex-col overflow-hidden rounded-[32px] p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-35" style={{ background: color }} aria-hidden />
      <div className="relative flex items-center justify-between gap-3">
        <IconTile color={color} size={48}>
          <Icon size={22} />
        </IconTile>
        <span className="font-display rounded-full px-3 py-1 text-sm font-bold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          {pct} of every fee
        </span>
      </div>
      <h3 className="font-display relative mt-6 text-2xl font-semibold sm:text-[28px]">{title}</h3>
      <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num font-display text-4xl font-bold">{value}</span>
        <span className="text-sm text-faint">{sub}</span>
      </div>
      <p className="relative mt-4 text-[15px] leading-relaxed text-muted">{body}</p>
      <ul className="relative mt-5 space-y-2.5">
        {facts.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm text-fg/90">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
            {f}
          </li>
        ))}
      </ul>
      <span className="font-display relative mt-auto inline-flex items-center gap-1 pt-6 text-sm font-semibold text-muted transition-colors group-hover:text-fg">
        {cta} <ArrowUpRight size={15} />
      </span>
    </Link>
  );
}

/**
 * Where every 3% goes: the two halves with their rules and live balances, the Nest, and the wallets that hold it
 * all. The hero card is the live summary; the full walk-through lives in the docs.
 */
export function FeeBuckets() {
  const { data: s, isError } = useStats();
  const solUsd = s?.solUsd ?? 0;
  const wait = isError ? "—" : <Skeleton className="h-9 w-32" />;

  return (
    <section>
      <SectionHeading
        eyebrow="Where every 3% goes"
        title={
          <>
            One fee, <span className="text-spectrum">two cushions</span>
          </>
        }
        sub={`No creator fees and no team cut. Meteora keeps its protocol share; ${brand.name}'s fee wallet claims the rest from every pool, turns it into SOL and splits it down the middle.`}
      />

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <Half
          icon={ShieldCheck}
          color={bucketColor.protection}
          pct={share("protection")}
          title={brand.landing}
          value={s ? usd(s.protectionFundSol * solUsd) : wait}
          sub={s ? `in the fund · ${usd(s.protectionPaidSol * solUsd)} paid out` : ""}
          body="Sold at a loss? Part of it comes back to your wallet on its own, with nothing to claim."
          facts={[
            `Up to ${bps(topTier)} of a realized loss by how long you held, ${bps(RUG_COVERAGE_BPS)} if the creator rugged`,
            `Capped at ${PROTECTION_CAP_X_TAX}× the tax you paid on that coin`,
            `One payout takes at most ${bps(PROTECTION_PAYOUT_BPS)} of the coin's own pot`,
          ]}
          href="/soft-landing"
          cta="See the fund"
        />
        <Half
          icon={ArrowLeftRight}
          color={bucketColor.otcReserve}
          pct={share("otcReserve")}
          title="OTC exit reserve"
          value={s ? usd(s.otcReserveSol * solUsd) : wait}
          sub={s ? `of SOL · ${usd(s.otcPaidSol * solUsd)} paid to sellers` : ""}
          body="Sell into a SOL wallet instead of the pool: no slippage, and the coins you sell are burned."
          facts={[
            `Priced at the lower of spot and the ${otcPolicy.twapSeconds / 60}-minute average, minus the 3%`,
            `Every SOL a coin pays in gives it ${otcPolicy.creditMultiplierBps / 10_000} SOL of sell limit`,
            `Limits shrink to ${bps(otcPolicy.floorBps)} once a coin goes ${otcPolicy.activeSeconds / 86_400} days without fees`,
          ]}
          href="/otc"
          cta="Open the OTC desk"
        />
      </div>

      <Link
        href="/docs#nest"
        className="surface surface-hover group relative mt-4 grid grid-cols-1 items-center gap-6 overflow-hidden rounded-[32px] p-6 sm:p-8 lg:mt-5 lg:grid-cols-[1fr_1.3fr]"
      >
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-nest opacity-[0.12] blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <IconTile color="var(--nest)" size={48}>
              <Egg size={22} />
            </IconTile>
            <span className="eyebrow">Copies welcome</span>
          </div>
          <h3 className="font-display mt-5 text-2xl font-semibold sm:text-[28px]">
            The {brand.nest}: copies feed the original
          </h3>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Launch CAT, and C4T, C@T or Сat join its {brand.nest}. Copying is allowed, it just pays the coin it copied.
          </p>
          {s && s.nestRoutedSol > 0 ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num font-display text-3xl font-bold text-nest">{usd(s.nestRoutedSol * solUsd)}</span>
              <span className="text-sm text-faint">sent from copies to the coins they copied</span>
            </div>
          ) : (
            <p className="font-display mt-4 text-sm font-semibold text-nest">No copies yet. The first one pays its way in.</p>
          )}
        </div>
        <ol className="relative grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { n: 1, text: `A copy launched while the original is alive pays a $${BLOODLINE.entryUsd} entry it never gets back` },
            { n: 2, text: `Those coins go to up to ${BLOODLINE.recipients} of the original's holders, weighted toward high entries` },
            { n: 3, text: `Every fee the copy makes goes to the original's OTC limit and ${brand.landing} pot` },
          ].map((step) => (
            <li key={step.n} className="rounded-2xl bg-sunk p-4 text-[13px] leading-relaxed text-muted shadow-[inset_0_0_0_1px_var(--line)]">
              <span className="font-display mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-nest-soft text-sm font-bold text-nest">{step.n}</span>
              {step.text}
            </li>
          ))}
        </ol>
      </Link>

      {s && s.treasury.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-sm text-muted">
            The buckets are plain Solana wallets run by the {brand.name} backend. Every balance and transfer is public.
          </p>
          <TreasuryWallets wallets={s.treasury} solUsd={solUsd} />
        </div>
      )}
    </section>
  );
}
