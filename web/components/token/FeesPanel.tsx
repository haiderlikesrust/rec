"use client";

import { ArrowLeftRight, Flame, Gift, PieChart, ShieldCheck } from "lucide-react";
import type { CoinDetail } from "@cook/shared";
import { brand } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { eth, tokens, units, usd } from "@/lib/format";
import { IconTile } from "@/components/ui";

export function FeesPanel({ coin, ethUsd }: { coin: CoinDetail; ethUsd: number }) {
  const b = coin.buckets;
  const q = coin.quote;
  const coinBurnedEth = units(b.coinBurned) * coin.priceEth;
  const airdropEth = units(coin.airdropsPaid, q.decimals) * q.ethPerUnit;
  const rows = [
    {
      icon: ShieldCheck,
      color: bucketColor.protection,
      label: "Protection fund",
      eth: units(b.ethToProtection),
      value: eth(units(b.ethToProtection)),
      sub: usd(units(b.ethToProtection) * ethUsd),
    },
    {
      icon: ArrowLeftRight,
      color: bucketColor.otcReserve,
      label: "OTC reserve",
      eth: units(b.ethToOtc),
      value: eth(units(b.ethToOtc)),
      sub: usd(units(b.ethToOtc) * ethUsd),
    },
    {
      icon: Flame,
      color: bucketColor.mainBuyback,
      label: `$${brand.mainTicker} bought & burned`,
      eth: units(b.ethToMainBuyback),
      value: eth(units(b.ethToMainBuyback)),
      sub: usd(units(b.ethToMainBuyback) * ethUsd),
    },
    {
      icon: Flame,
      color: bucketColor.coinBuyback,
      label: `$${coin.symbol} bought & burned`,
      eth: coinBurnedEth,
      value: tokens(b.coinBurned, 18),
      sub: `${((units(b.coinBurned) / 1e9) * 100).toFixed(3)}% of supply`,
    },
    {
      icon: Gift,
      color: bucketColor.airdrop,
      label: "Airdropped to holders",
      eth: airdropEth,
      value: tokens(coin.airdropsPaid, q.decimals, q.symbol),
      sub: `${tokens(b.airdropQuote, q.decimals, q.symbol)} allocated`,
    },
  ];
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.eth) ? r.eth : 0), 0);

  return (
    <section className="surface rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile size={36}>
            <PieChart size={17} />
          </IconTile>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">Where its fees went</h3>
            <p className="text-xs text-muted">100% back to the community</p>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-lg font-medium">{usd(coin.feesEth * ethUsd)}</div>
          <div className="num text-[11px] text-faint">{eth(coin.feesEth)}</div>
        </div>
      </div>

      <div className="mt-5 flex h-2.5 w-full gap-1">
        {total > 0
          ? rows.map((r) =>
              r.eth > 0 ? (
                <div
                  key={r.label}
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((r.eth / total) * 100, 1.5)}%`,
                    background: r.color,
                    boxShadow: `0 0 12px -2px color-mix(in srgb, ${r.color} 55%, transparent)`,
                  }}
                  title={r.label}
                />
              ) : null,
            )
          : (
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
      {units(b.pendingQuote, q.decimals) > 0 && (
        <p className="mt-3 rounded-xl bg-sunk px-3 py-2 text-[11px] leading-relaxed text-muted">
          <span className="num text-fg">{tokens(b.pendingQuote, q.decimals, q.symbol)}</span> collected, waiting for the next keeper run.
        </p>
      )}
    </section>
  );
}
