"use client";

import clsx from "clsx";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { brand, type PlatformToken } from "@gantry/shared";
import { CoinAvatar } from "@/components/CoinAvatar";
import { ButtonLink, Change, buttonClass } from "@/components/ui";
import { useStats } from "@/lib/data";
import { short } from "@/lib/format";
import { shortUsd } from "./money";

/**
 * The platform token in one card: its picture and ticker, its address with a tap to copy, its market cap and day,
 * and the way to buy it. Nothing at all is rendered until a mint is configured, so a look-alike can never stand in
 * for it.
 */
export function TokenCard({ className }: { className?: string }) {
  const { data } = useStats();
  return data?.platformToken ? <Card t={data.platformToken} className={className} /> : null;
}

function Card({ t, className }: { t: PlatformToken; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(t.address).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };
  const ticker = `$${t.symbol}`;

  return (
    <section
      aria-label={`${ticker}, the ${brand.name} token`}
      className={clsx("flex max-w-xl items-center gap-3 rounded-[20px] max-[359px]:gap-2 bg-panel p-3 sm:gap-4 sm:p-4", className)}
    >
      <CoinAvatar src={t.image} symbol={t.symbol} seed={t.address} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] font-medium text-ink">{ticker}</span>
          <span className="shrink-0 text-[13px] text-ink-3 max-[479px]:hidden">{brand.name} token</span>
        </p>
        <button
          type="button"
          onClick={copy}
          title={t.address}
          aria-label={`Copy the ${ticker} contract address, ${t.address}`}
          className="-my-1 inline-flex h-9 items-center gap-1 rounded-sm text-[13px] whitespace-nowrap text-ink-2 transition-colors hover:text-ink"
        >
          <span className="tabular-nums">{short(t.address, 4)}</span>
          {copied ? <Check size={14} className="text-gain" aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
        <span role="status" className="sr-only">
          {copied ? "Address copied" : ""}
        </span>
      </div>
      {t.marketCapUsd !== null && (
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-medium text-ink tabular-nums">
            <span className="sr-only">Market cap </span>
            {shortUsd(t.marketCapUsd)}
          </p>
          {t.change24h !== null && (
            <p className="text-[13px]">
              <span className="sr-only">Change in 24 hours </span>
              <Change value={t.change24h} />
            </p>
          )}
        </div>
      )}
      {t.listed ? (
        <ButtonLink href={`/token/${t.address}`} variant="secondary" className="shrink-0">
          Buy
        </ButtonLink>
      ) : (
        <a href={`https://jup.ag/tokens/${t.address}`} target="_blank" rel="noreferrer" className={clsx(buttonClass({ variant: "secondary" }), "shrink-0")}>
          Buy <ArrowUpRight size={15} aria-hidden />
          <span className="sr-only">on Jupiter (opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}
