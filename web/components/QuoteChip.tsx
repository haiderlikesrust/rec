"use client";

import clsx from "clsx";
import { useState } from "react";

const tint: Record<string, string> = {
  SOL: "var(--b-protection)",
  USDC: "var(--b-otc)",
  USDT: "var(--b-otc)",
  EURC: "var(--b-otc)",
};

export const quoteTint = (symbol: string) => tint[symbol] ?? "var(--b-main)";

/** A quote asset's official logo; falls back to a tinted ticker monogram if the image can't load. */
export function QuoteLogo({ symbol, logo, size = 20, className }: { symbol: string; logo?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        loading="lazy"
        style={style}
        onError={() => setFailed(true)}
        className={clsx("shrink-0 rounded-full bg-sunk object-cover shadow-[0_0_0_1px_var(--line)]", className)}
      />
    );
  }
  const color = quoteTint(symbol);
  return (
    <span
      aria-hidden
      style={{ ...style, background: `color-mix(in srgb, ${color} 18%, transparent)`, color, fontSize: Math.max(7, size * 0.38) }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
    >
      {symbol.replace(/^\$/, "").slice(0, size >= 24 ? 3 : 2).toUpperCase()}
    </span>
  );
}

/** Pair label with the quote's logo (or a tinted dot when there is none). */
export function QuoteChip({ symbol, logo, className, pair }: { symbol: string; logo?: string | null; className?: string; pair?: string }) {
  const color = quoteTint(symbol);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk/70 py-0.5 pr-2.5 text-[11px] font-medium whitespace-nowrap",
        logo ? "pl-1" : "pl-2.5",
        className,
      )}
    >
      {logo ? (
        <QuoteLogo symbol={symbol} logo={logo} size={14} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      )}
      {pair ? `${pair}/${symbol}` : symbol}
    </span>
  );
}
