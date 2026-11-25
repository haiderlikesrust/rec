"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brand } from "@gantry/shared";
import { useCoin, useStats } from "@/lib/data";
import { explorerToken } from "@/lib/explorer";
import { short } from "@/lib/format";

const quiet = "inline-flex h-9 items-center gap-1.5 rounded-sm text-ink-2 transition-colors hover:text-ink";

/**
 * The platform token's contract address as one quiet line: its ticker (a link to its page once it trades), the
 * address with a tap to copy, and the block explorer. Nothing at all is rendered until a mint is configured, so a
 * look-alike address can never stand in for it.
 */
export function TokenAddress() {
  const { data: stats } = useStats();
  const mint = stats?.mainToken ?? null;
  const { data: coin } = useCoin(mint ?? undefined);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!mint) return null;

  const copy = () => {
    navigator.clipboard?.writeText(mint).then(
      () => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };
  const ticker = `$${brand.mainTicker}`;

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-3 text-[13px] text-ink-3">
      {coin ? (
        <Link href={`/token/${mint}`} className={quiet}>
          {ticker}
        </Link>
      ) : (
        <span>{ticker}</span>
      )}
      <button type="button" onClick={copy} title={mint} aria-label={`Copy the ${ticker} contract address, ${mint}`} className={quiet}>
        <span className="tabular-nums">{short(mint, 6)}</span>
        {copied ? <Check size={14} className="text-gain" aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
      <a href={explorerToken(mint)} target="_blank" rel="noreferrer" className={quiet}>
        Explorer <ArrowUpRight size={14} aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <span role="status" className="sr-only">
        {copied ? "Address copied" : ""}
      </span>
    </p>
  );
}
