"use client";

import { ArrowLeftRight, Flame, Gift, PieChart, ShieldCheck } from "lucide-react";
import type { CoinDetail } from "@cook/shared";
import { brand } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { sol, tokens, units, usd } from "@/lib/format";
import { IconTile } from "@/components/ui";

export function FeesPanel({ coin, solUsd }: { coin: CoinDetail; solUsd: number }) {
  const b = coin.buckets;
  const q = coin.quote;
  const quoteUsd = q.usdPerUnit;
  const coinBurnedUsd = units(b.coinBurned, coin.decimals) * coin.priceUsd;
  const airdropUsd = units(coin.airdropsPaid, q.decimals) * quoteUsd;
  const meteoraUsd = units(b.meteoraQuote, q.decimals) * quoteUsd;
  const rows = [
    {
      icon: ShieldCheck,
      color: bucketColor.protection,
      label: "Protection fund",
      usd: b.solToProtection * solUsd,
      value: usd(b.solToProtection * solUsd),
      sub: sol(b.solToProtection),
    },
    {
      icon: ArrowLeftRight,
      color: bucketColor.otcReserve,
      label: "OTC reserve",
      usd: b.solToOtc * solUsd,
      value: usd(b.solToOtc * solUsd),
      sub: sol(b.solToOtc),
    },
    {
      icon: Flame,
      color: bucketColor.mainBuyback,
      label: `$${brand.mainTicker} bought & burned`,
      usd: b.solToMainBuyback * solUsd,
      value: usd(b.solToMainBuyback * solUsd),
      sub: sol(b.solToMainBuyback),
    },
    {
      icon: Flame,
      color: bucketColor.coinBuyback,
      label: `$${coin.symbol} bought & burned`,
      usd: coinBurnedUsd,
      value: tokens(b.coinBurned, coin.decimals),
      sub: `${((units(b.coinBurned, coin.decimals) / 1e9) * 100).toFixed(3)}% of supply`,
    },
    {
      icon: Gift,
      color: bucketColor.airdrop,
      label: "Airdropped to holders",
      usd: airdropUsd,
      value: usd(airdropUsd),
      sub: `${tokens(b.airdropQuote, q.decimals, q.symbol)} allocated`,
    },
  ];
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.usd) ? r.usd : 0), 0);

  return (
    <section className="surface rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile size={36}>
            <PieChart size={17} />
          </IconTile>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">Where its fees went</h3>
            <p className="text-xs text-muted">0% to the creator, 0% to the team</p>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-lg font-medium">{usd(coin.feesUsd)}</div>
          <div className="num text-[11px] text-faint">{tokens(coin.feesQuote, q.decimals, q.symbol)}</div>
        </div>
      </div>

      <div className="mt-5 flex h-2.5 w-full gap-1">
        {total > 0 ? (
          rows.map((r) =>
            r.usd > 0 ? (
              <div
                key={r.label}
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((r.usd / total) * 100, 1.5)}%`,
                  background: r.color,
                  boxShadow: `0 0 12px -2px color-mix(in srgb, ${r.color} 55%, transparent)`,
                }}
                title={r.label}
              />
            ) : null,
          )
        ) : (
          <div className="h-full w-full rounded-full bg-sunk" />
        )}
      </div>

      <ul className="mt-4 space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 rounded-xl py-2">
            <IconTile color={r.color} size={30} className="rounded-lg">
              <r.icon size={14} />
            </IconTile>
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{r.label}</span>
            <span className="shrink-0 text-right">
              <span className="num block text-[13px]">{r.value}</span>
              <span className="num block text-[11px] text-faint">{r.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Meteora&apos;s protocol share: <span className="num text-muted">{usd(meteoraUsd)}</span>. Everything else is split
        into the buckets above.
      </p>
      {units(b.pendingQuote, q.decimals) > 0 && (
        <p className="mt-3 rounded-xl bg-sunk px-3 py-2 text-[11px] leading-relaxed text-muted">
          <span className="num text-fg">{tokens(b.pendingQuote, q.decimals, q.symbol)}</span> collected, waiting for the next
          split.
        </p>
      )}
    </section>
  );
}
