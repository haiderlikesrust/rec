"use client";

import { ArrowLeftRight, ArrowUpRight, Flame, Gift, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand, type TreasuryWallet } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useStats } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { short, sol, tokens, units, usd } from "@/lib/format";
import { AnimatedNumber, Card, IconTile, SectionHeading, Skeleton } from "@/components/ui";

const roleColor: Record<TreasuryWallet["role"], string> = {
  fees: "var(--accent)",
  otc: bucketColor.otcReserve,
  protection: bucketColor.protection,
  airdrop: bucketColor.airdrop,
};

const roleLabel: Record<TreasuryWallet["role"], string> = {
  fees: "Fees",
  otc: "OTC reserve",
  protection: "Protection",
  airdrop: "Airdrops",
};

/** The backend-controlled wallets, with live balances and Solscan links, so anyone can audit them. */
export function TreasuryWallets({ wallets, solUsd, className }: { wallets: TreasuryWallet[]; solUsd: number; className?: string }) {
  if (!wallets.length) return null;
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {wallets.map((w) => (
          <a
            key={w.role}
            href={explorerAddress(w.address)}
            target="_blank"
            rel="noreferrer"
            title={w.label}
            className="surface surface-hover group flex items-center gap-3 rounded-2xl px-4 py-3"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: roleColor[w.role], boxShadow: `0 0 10px ${roleColor[w.role]}` }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{roleLabel[w.role]}</div>
              <div className="num truncate text-xs text-faint">{short(w.address)}</div>
            </div>
            <div className="text-right">
              <div className="num text-[13px]">{usd(w.sol * solUsd)}</div>
              <div className="num text-[11px] text-faint">{sol(w.sol)}</div>
            </div>
            <ArrowUpRight size={13} className="shrink-0 text-faint transition-colors group-hover:text-fg" />
          </a>
        ))}
      </div>
    </div>
  );
}

type Bucket = {
  key: string;
  icon: typeof ShieldCheck;
  color: string;
  pct: string;
  title: string;
  value: ReactNode;
  sub: string;
  body: string;
  href: string;
  meter?: number;
};

/**
 * Where every 3% goes, live: what the buckets hold and have paid, each with a one-line explanation. One section
 * for the numbers and the why (the hero ring is the summary; the full comparison lives in the docs).
 */
export function FeeBuckets() {
  const { data: s, isError } = useStats();
  const solUsd = s?.solUsd ?? 0;
  const loading = isError ? "—" : <Skeleton className="h-7 w-28" />;
  const burnedPct =
    s && Number(s.mainSupply) > 0 ? (units(s.mainBurned, 6) / (units(s.mainSupply, 6) + units(s.mainBurned, 6))) * 100 : 0;
  const fund = s?.protectionFundSol ?? 0;
  const paid = s?.protectionPaidSol ?? 0;
  const returnedSol = s ? s.totalFeesSol - s.meteoraFeesSol : 0;

  const buckets: Bucket[] = [
    {
      key: "protection",
      icon: ShieldCheck,
      color: bucketColor.protection,
      pct: "40%",
      title: "Protection fund",
      value: s ? usd(fund * solUsd) : loading,
      sub: s ? `${sol(fund)} in the fund · ${usd(paid * solUsd)} paid out` : "",
      body: "Sold at a loss? Get up to 70% back automatically, by how long you held and what that coin paid in.",
      href: "/protection",
    },
    {
      key: "otc",
      icon: ArrowLeftRight,
      color: bucketColor.otcReserve,
      pct: "30%",
      title: "OTC exit reserve",
      value: s ? usd(s.otcReserveSol * solUsd) : loading,
      sub: s ? `${sol(s.otcReserveSol)} of slippage-free exit liquidity` : "",
      body: "Sell into a SOL reserve with zero slippage. Coins that pay more fees earn bigger limits.",
      href: "/otc",
    },
    {
      key: "burn",
      icon: Flame,
      color: bucketColor.mainBuyback,
      pct: "10% + 10%",
      title: "Buyback & burn",
      value: s ? `${tokens(s.mainBurned, 6)} $${brand.mainTicker}` : loading,
      sub: s ? `${burnedPct.toFixed(2)}% of $${brand.mainTicker} burned · ${usd(s.coinsBurnedSol * solUsd)} of coins burned` : "",
      body: `Half buys the coin itself and burns it, half buys $${brand.mainTicker} and burns it, within seconds of every trade.`,
      href: "/docs#split",
      meter: burnedPct / 100,
    },
    {
      key: "airdrop",
      icon: Gift,
      color: bucketColor.airdrop,
      pct: "10%",
      title: "Airdrops to high entries",
      value: s ? usd(s.airdroppedSol * solUsd) : loading,
      sub: "paid to holders who bought above the price",
      body: "Paid out continuously, weighted by how far underwater each holder is. As price moves, recipients rotate.",
      href: "/docs#airdrops",
    },
  ];

  return (
    <section>
      <SectionHeading
        eyebrow="Where every 3% goes"
        title={
          <>
            One tax, five ways <span className="text-spectrum">back to you</span>
          </>
        }
        sub={`No creator fees and no team cut. Meteora keeps its protocol share; ${brand.name}'s fee wallet claims the rest from every pool and splits it into SOL reserves, burns and airdrops.`}
      />

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card featured className="relative overflow-hidden p-6 md:col-span-2 lg:row-span-2 lg:p-8">
          <div className="spectrum absolute -top-24 -right-24 h-56 w-56 rounded-full opacity-25 blur-3xl" aria-hidden />
          <span className="eyebrow">Fees returned to the community</span>
          <div className="font-display mt-4 text-5xl leading-none font-semibold sm:text-6xl">
            {s ? <AnimatedNumber value={returnedSol * solUsd} format={usd} /> : isError ? "—" : <Skeleton className="h-14 w-48" />}
          </div>
          <p className="num mt-3 text-sm text-muted">{s ? `from ${s.coins} coins · ${usd(s.totalFeesUsd)} in total fees` : " "}</p>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line pt-6">
            <div>
              <div className="text-xs text-muted">24h volume</div>
              <div className="num mt-1.5 text-2xl font-medium">{s ? usd(s.volume24hUsd) : "—"}</div>
              <div className="num mt-0.5 text-xs text-faint">across every pair</div>
            </div>
            <div>
              <div className="text-xs text-muted">Meteora&apos;s share</div>
              <div className="num mt-1.5 text-2xl font-medium">{s ? usd(s.meteoraFeesSol * solUsd) : "—"}</div>
              <div className="num mt-0.5 text-xs text-faint">its protocol fee, 16–20% of the 3%</div>
            </div>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-faint">
            Creators take 0%. The team takes 0%. Everything {brand.name} collects is split into the buckets you see here.{" "}
            <Link href="/docs#compare" className="text-muted underline-offset-2 hover:text-fg hover:underline">
              How that compares to Pons and pump.fun
            </Link>
          </p>
        </Card>

        {buckets.map((b) => (
          <Link key={b.key} href={b.href} className="surface surface-hover group relative flex flex-col overflow-hidden rounded-[22px] p-5">
            <div
              className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-35"
              style={{ background: b.color }}
              aria-hidden
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile color={b.color} size={36}>
                  <b.icon size={17} />
                </IconTile>
                <span className="text-sm font-medium">{b.title}</span>
              </div>
              <span className="num shrink-0 text-sm font-medium whitespace-nowrap" style={{ color: b.color }}>
                {b.pct}
              </span>
            </div>
            <div className="num mt-5 truncate text-2xl font-medium">{b.value}</div>
            <p className="mt-1 text-xs text-faint">{b.sub}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{b.body}</p>
            {b.meter !== undefined && (
              <div className="mt-auto pt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(b.meter * 100, b.meter > 0 ? 3 : 0))}%`, background: b.color }}
                  />
                </div>
              </div>
            )}
            <span className="inline-flex items-center gap-1 pt-4 text-xs font-medium text-muted transition-colors group-hover:text-fg">
              Learn more <ArrowUpRight size={13} />
            </span>
          </Link>
        ))}
      </div>

      {s && s.treasury.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs text-muted">
            The buckets are plain Solana wallets run by the {brand.name} backend. Every balance and transfer is public.
          </p>
          <TreasuryWallets wallets={s.treasury} solUsd={solUsd} />
        </div>
      )}
    </section>
  );
}
