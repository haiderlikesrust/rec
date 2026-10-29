"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState } from "react";
import { brand } from "@cook/shared";
import { LogoMark } from "@/components/LogoMark";
import { ButtonLink } from "@/components/ui";
import { useCoin, useStats } from "@/lib/data";
import { explorerToken } from "@/lib/explorer";
import { short, usd } from "@/lib/format";

/**
 * The platform token's contract address, front and center. Before $RECR launches (no MAIN_TOKEN_MINT yet) it
 * says so instead of showing anything copyable, so nobody can be fooled by a lookalike.
 */
export function ContractAddress({ className = "" }: { className?: string }) {
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
    <div
      className={`flex w-full max-w-2xl items-center gap-3 rounded-2xl border border-line bg-elev/70 p-2 pl-3 shadow-card ${className}`}
    >
      <LogoMark size={30} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide whitespace-nowrap text-faint uppercase">
          <span>
            ${brand.mainTicker} <span className="hidden sm:inline">contract address</span>
            <span className="sm:hidden">CA</span>
          </span>
          {coin && <span className="num text-muted normal-case">· {usd(coin.marketCapUsd)} mcap</span>}
        </div>
        {mint ? (
          <button
            type="button"
            onClick={copy}
            title="Copy contract address"
            className="num block w-full truncate text-left text-[13px] text-fg transition-colors hover:text-accent sm:text-sm"
          >
            {/* phones show both ends of the address (what people compare); wider screens show all of it */}
            <span className="sm:hidden">{short(mint, 8)}</span>
            <span className="hidden sm:inline">{mint}</span>
          </button>
        ) : (
          <div className="text-sm text-muted">{stats ? "Launching soon. Only trust the address posted here." : "…"}</div>
        )}
      </div>
      {mint && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={copy}
            aria-label="Copy contract address"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunk hover:text-fg"
          >
            {copied ? <Check size={16} className="text-up" /> : <Copy size={16} />}
          </button>
          <a
            href={explorerToken(mint)}
            target="_blank"
            rel="noreferrer"
            aria-label="View on Solscan"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-sunk hover:text-fg"
          >
            <ArrowUpRight size={16} />
          </a>
          <span className="ml-1 hidden sm:block">
            <ButtonLink href={`/token/${mint}`} size="sm">
              Trade ${brand.mainTicker}
            </ButtonLink>
          </span>
        </div>
      )}
    </div>
  );
}
