"use client";

import { ArrowLeftRight, Flame, Gift, ShieldCheck } from "lucide-react";
import { brand } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useStats } from "@/lib/data";
import { tokens, units, usd } from "@/lib/format";
import { AnimatedNumber, Card, IconTile, SectionHeading, Skeleton } from "@/components/ui";

export function StatsBento() {
  const { data: s, isError } = useStats();
  const ethUsd = s?.ethUsd ?? 0;
  const burnedPct = s && Number(s.mainSupply) > 0 ? (units(s.mainBurned) / (units(s.mainSupply) + units(s.mainBurned))) * 100 : 0;
  const fund = s ? units(s.protectionFundEth) : 0;
  const paid = s ? units(s.protectionPaidEth) : 0;

  const tiles = [
    {
      key: "protection",
      icon: ShieldCheck,
      color: bucketColor.protection,
      label: "Protection fund",
      value: s ? `${fund.toFixed(3)} ETH` : null,
      sub: s ? `${usd(fund * ethUsd)} · ${paid.toFixed(3)} ETH paid out` : "",
      meter: fund + paid > 0 ? paid / (fund + paid) : 0,
      meterLabel: "paid out",
    },
    {
      key: "otc",
      icon: ArrowLeftRight,
      color: bucketColor.otcReserve,
      label: "OTC reserve",
      value: s ? `${units(s.otcReserveEth).toFixed(3)} ETH` : null,
      sub: s ? `${usd(units(s.otcReserveEth) * ethUsd)} of slippage-free exit liquidity` : "",
    },
    {
      key: "burn",
      icon: Flame,
      color: bucketColor.mainBuyback,
      label: `$${brand.mainTicker} burned`,
      value: s ? tokens(s.mainBurned) : null,
      sub: s ? `${burnedPct.toFixed(2)}% of supply, gone forever` : "",
      meter: burnedPct / 100,
      meterLabel: "of supply",
    },
    {
      key: "airdrop",
      icon: Gift,
      color: bucketColor.airdrop,
      label: "Airdropped to holders",
      value: s ? usd(s.airdroppedEth * ethUsd) : null,
      sub: s ? `${s.airdroppedEth.toFixed(3)} ETH to holders who bought high` : "",
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
            {s ? <AnimatedNumber value={s.totalFeesEth * ethUsd} format={usd} /> : isError ? "—" : <Skeleton className="h-14 w-48" />}
          </div>
          <p className="num mt-3 text-sm text-muted">{s ? `${s.totalFeesEth.toFixed(3)} ETH from ${s.coins} coins` : " "}</p>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-line pt-6">
            <div>
              <div className="text-xs text-muted">24h volume</div>
              <div className="num mt-1.5 text-2xl font-medium">{s ? usd(s.volume24hEth * ethUsd) : "—"}</div>
              <div className="num mt-0.5 text-xs text-faint">{s ? `${s.volume24hEth.toFixed(2)} ETH` : ""}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Coins burned back</div>
              <div className="num mt-1.5 text-2xl font-medium">{s ? usd(s.coinsBurnedEth * ethUsd) : "—"}</div>
              <div className="num mt-0.5 text-xs text-faint">bought in their own pools</div>
            </div>
          </div>
          <p className="mt-8 text-xs leading-relaxed text-faint">
            Creators take 0%. The team takes 0%. Every unit of tax is split on-chain the moment it is paid.
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
    </section>
  );
}
