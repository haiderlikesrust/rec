"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { brand, type CoinDetail } from "@gantry/shared";
import { bucketColor } from "@/lib/buckets";
import { tokens, units, usd } from "@/lib/format";
import { PanelBody } from "@/components/ui";

type Part = { key: string; name: ReactNode; label: string; note: string; color: string; value: number; amount: string };

/**
 * Where this coin's trading fees have gone so far: one figure, one bar and a short list. The bar is drawn from what
 * actually moved, in USD at today's prices.
 */
export function FeesTab({ coin, solUsd }: { coin: CoinDetail; solUsd: number }) {
  const b = coin.buckets;
  const q = coin.quote;
  // a copy passes its whole split to the coin that leads its family
  const leader = coin.fleet && coin.fleet.leader.address !== coin.address ? coin.fleet.leader : null;

  const burned = units(b.feeBurned, coin.decimals);
  const pendingUsd = units(b.pendingQuote, q.decimals) * q.usdPerUnit;

  const parts: Part[] = [
    ...(leader
      ? [
          {
            key: "leader",
            name: (
              <>
                Sent to{" "}
                <Link href={`/token/${leader.address}`} className="link">
                  ${leader.symbol}
                </Link>
              </>
            ),
            label: `Sent to ${leader.symbol}`,
            note: `This coin is a copy, so its share goes to the coin that leads its ${brand.fleet}.`,
            color: "var(--fleet)",
            value: b.sentToLeaderSol * solUsd,
            amount: usd(b.sentToLeaderSol * solUsd),
          },
        ]
      : [
          {
            key: "otc",
            name: "OTC reserve",
            label: "OTC reserve",
            note: "A SOL wallet you can sell this coin into with no slippage.",
            color: bucketColor.otcReserve,
            value: b.solToOtc * solUsd,
            amount: usd(b.solToOtc * solUsd),
          },
          {
            key: "shield",
            name: brand.shield,
            label: brand.shield,
            note: "Pays back part of a loss when a holder sells below their entry.",
            color: bucketColor.protection,
            value: b.solToProtection * solUsd,
            amount: usd(b.solToProtection * solUsd),
          },
        ]),
    {
      key: "raydium",
      name: "Raydium",
      label: "Raydium",
      note: "The protocol fee of the exchange the coin trades on.",
      color: "var(--ink-3)",
      value: units(b.protocolQuote, q.decimals) * q.usdPerUnit,
      amount: usd(units(b.protocolQuote, q.decimals) * q.usdPerUnit),
    },
    ...(burned > 0
      ? [
          {
            key: "burned",
            name: "Burned",
            label: "Burned",
            note: `Pool fees that came back as ${coin.symbol} and were destroyed.`,
            color: "var(--ink)",
            value: burned * coin.priceUsd,
            amount: `${tokens(b.feeBurned, coin.decimals)} ${coin.symbol}`,
          },
        ]
      : []),
    ...(pendingUsd > 0
      ? [
          {
            key: "pending",
            name: "Not split yet",
            label: "Not split yet",
            note: "Collected and waiting for the next split.",
            color: "var(--edge)",
            value: pendingUsd,
            amount: usd(pendingUsd),
          },
        ]
      : []),
  ];
  const drawn = parts.filter((p) => p.value > 0);
  const sum = drawn.reduce((s, p) => s + p.value, 0);

  return (
    <PanelBody className="space-y-5">
      <p className="text-[15px] leading-relaxed text-ink-2">
        Traders have paid <span className="num text-lg font-semibold text-ink">{usd(coin.feesUsd)}</span> in fees on this coin. None of it went to
        the creator.
      </p>

      {sum > 0 ? (
        <div
          role="img"
          aria-label={drawn.map((p) => `${p.label} ${Math.round((p.value / sum) * 100)}%`).join(", ")}
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        >
          {drawn.map((p) => (
            <span key={p.key} className="h-full min-w-[3px]" style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} />
          ))}
        </div>
      ) : (
        <div className="h-2.5 w-full rounded-full bg-white/8" aria-hidden />
      )}

      <ul className="space-y-3.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-3">
            <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium text-ink">{p.name}</span>
                <span className="num shrink-0 text-ink">{p.amount}</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{p.note}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[13px]">
        <Link href={`${brand.docsPath}#fees`} className="link">
          How fees work
        </Link>
      </p>
    </PanelBody>
  );
}
