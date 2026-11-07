"use client";

import clsx from "clsx";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { brand } from "@cook/shared";
import { LogoMark } from "@/components/LogoMark";
import { useCoin, useStats } from "@/lib/data";
import { explorerToken } from "@/lib/explorer";
import { short, usd } from "@/lib/format";

/**
 * The platform token's contract address, front and center. Until MAIN_TOKEN_MINT is set it says so instead of showing
 * anything copyable, so nobody can be fooled by a lookalike.
 */
export function ContractAddress({ className }: { className?: string }) {
  const { data: stats } = useStats();
  const mint = stats?.mainToken ?? null;
  const { data: coin } = useCoin(mint ?? undefined);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!mint) return;
    navigator.clipboard?.writeText(mint).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };

  return (
    <div className={clsx("surface flex w-full max-w-xl items-center gap-3 rounded-[22px] p-2 pl-2.5", className)}>
      <LogoMark size={38} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-display flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-faint uppercase">
          <span>
            ${brand.mainTicker} <span className="hidden sm:inline">contract address</span>
            <span className="sm:hidden">CA</span>
          </span>
          {coin && <span className="num tracking-normal text-muted normal-case">· {usd(coin.marketCapUsd)} mcap</span>}
        </div>
        {mint ? (
          <button
            type="button"
            onClick={copy}
            title="Copy contract address"
            className="num block w-full truncate text-left text-[13px] font-bold text-fg transition-colors hover:text-accent-2 sm:text-sm"
          >
            {/* both ends (what people compare) wherever the whole address won't fit: phones, and the two-column hero below xl */}
            <span className="sm:hidden lg:inline xl:hidden">{short(mint, 8)}</span>
            <span className="hidden sm:inline lg:hidden xl:inline">{mint}</span>
          </button>
        ) : (
          <div className="text-sm font-semibold text-muted">{stats ? "Launching soon. Only trust the address posted here." : "…"}</div>
        )}
      </div>
      {mint && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            aria-label="Copy contract address"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-elev-2 hover:text-fg"
          >
            {copied ? <Check size={16} className="text-up" /> : <Copy size={16} />}
          </button>
          <a
            href={explorerToken(mint)}
            target="_blank"
            rel="noreferrer"
            aria-label="View on Solscan"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-elev-2 hover:text-fg"
          >
            <ArrowUpRight size={16} />
          </a>
          {coin && (
            <Link
              href={`/token/${mint}`}
              className="btn-primary font-display ml-1 hidden h-10 items-center rounded-full px-4 text-sm font-semibold sm:inline-flex"
            >
              Trade
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
