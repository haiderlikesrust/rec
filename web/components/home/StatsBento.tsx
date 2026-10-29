"use client";

import { ArrowLeftRight, ArrowUpRight, Flame, Gift, ShieldCheck } from "lucide-react";
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
            className="surface surface-hover group flex items-center gap-3 rounded-2xl px-4 py-3"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: roleColor[w.role], boxShadow: `0 0 10px ${roleColor[w.role]}` }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{w.label}</div>
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

export function StatsBento() {
  const { data: s, isError } = useStats();
  const solUsd = s?.solUsd ?? 0;
  const burnedPct =
    s && Number(s.mainSupply) > 0 ? (units(s.mainBurned, 6) / (units(s.mainSupply, 6) + units(s.mainBurned, 6))) * 100 : 0;
  const fund = s?.protectionFundSol ?? 0;
  const paid = s?.protectionPaidSol ?? 0;
  const returnedSol = s ? s.totalFeesSol - s.meteoraFeesSol : 0;

  const tiles = [
    {
      key: "protection",
      icon: ShieldCheck,
      color: bucketColor.protection,
      label: "Protection fund",
      value: s ? usd(fund * solUsd) : null,
      sub: s ? `${sol(fund)} · ${usd(paid * solUsd)} paid out` : "",
      meter: fund + paid > 0 ? paid / (fund + paid) : 0,
      meterLabel: "paid out",
    },
    {
      key: "otc",
      icon: ArrowLeftRight,
      color: bucketColor.otcReserve,
      label: "OTC reserve",
      value: s ? usd(s.otcReserveSol * solUsd) : null,
      sub: s ? `${sol(s.otcReserveSol)} of slippage-free exit liquidity` : "",
    },
    {
      key: "burn",
      icon: Flame,
      color: bucketColor.mainBuyback,
      label: `$${brand.mainTicker} burned`,
      value: s ? tokens(s.mainBurned, 6) : null,
      sub: s ? `${burnedPct.toFixed(2)}% of supply, gone forever` : "",
      meter: burnedPct / 100,
      meterLabel: "of supply",
    },
    {
      key: "airdrop",
      icon: Gift,
      color: bucketColor.airdrop,
      label: "Airdropped to holders",
      value: s ? usd(s.airdroppedSol * solUsd) : null,
      sub: s ? "to holders who bought above the current price" : "",
    },
  ];

  return (
    <section>
      <SectionHeading eyebrow="Live" title="What the 3% has done so far" />
      <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div className="text-xs text-muted">Coins burned back</div>
              <div className="num mt-1.5 text-2xl font-medium">{s ? usd(s.coinsBurnedSol * solUsd) : "—"}</div>
              <div className="num mt-0.5 text-xs text-faint">bought in their own pools</div>
            </div>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-faint">
            Creators take 0%. The team takes 0%. Meteora keeps its protocol share
            {s ? ` (${usd(s.meteoraFeesSol * solUsd)} so far)` : ""}; everything else is split into the five buckets.
          </p>
        </Card>

        {tiles.map((t) => (
          <Card key={t.key} hover className="flex flex-col p-5">
            <div className="flex items-center gap-3">
              <IconTile color={t.color} size={36}>
                <t.icon size={17} />
              </IconTile>
              <span className="text-sm text-muted">{t.label}</span>
            </div>
            <div className="num mt-5 text-2xl font-medium">{t.value ?? (isError ? "—" : <Skeleton className="h-7 w-28" />)}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-faint">{t.sub}</p>
            {t.meter !== undefined && (
              <div className="mt-auto pt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, Math.max(t.meter * 100, t.meter > 0 ? 3 : 0))}%`, background: t.color }}
                  />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      {s && s.treasury.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs text-muted">
            The funds are plain Solana wallets run by the {brand.name} backend. Every balance and transfer is public.
          </p>
          <TreasuryWallets wallets={s.treasury} solUsd={solUsd} />
        </div>
      )}
    </section>
  );
}
