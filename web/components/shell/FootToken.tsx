"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useStats } from "@/lib/data";
import { explorerToken } from "@/lib/explorer";

/** The platform token's ticker in the footer, once its mint is set: to its page here, or to the block explorer. */
export function FootToken({ className }: { className?: string }) {
  const { data } = useStats();
  const t = data?.platformToken;
  if (!t) return null;
  if (t.listed)
    return (
      <Link href={`/token/${t.address}`} className={className}>
        ${t.symbol}
      </Link>
    );
  return (
    <a href={explorerToken(t.address)} target="_blank" rel="noreferrer" className={className}>
      ${t.symbol} <ArrowUpRight size={13} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
