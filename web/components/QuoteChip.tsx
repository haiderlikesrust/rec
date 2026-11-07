"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

const tint: Record<string, string> = {
  SOL: "var(--b-protection)",
  USDC: "var(--b-otc)",
  USDT: "var(--b-otc)",
  EURC: "var(--b-otc)",
};

export const quoteTint = (symbol: string) => tint[symbol] ?? "var(--accent-2)";

// IPFS logos (pump.fun's, for one) also try other gateways: ipfs.io is down or blocked on some networks
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://4everland.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
const logoSources = (logo: string) => {
  const cid = logo.match(/^(?:ipfs:\/\/|https?:\/\/[^/]+\/ipfs\/)(.+)$/)?.[1];
  return cid ? [...new Set([logo.startsWith("ipfs://") ? IPFS_GATEWAYS[0] + cid : logo, ...IPFS_GATEWAYS.map((g) => g + cid)])] : [logo];
};

/**
 * A quote asset's official logo. Issuer logos are often large images on slow hosts, so a tinted ticker monogram shows
 * until the image has loaded, and stays if it can't load.
 */
export function QuoteLogo({ symbol, logo, size = 20, className }: { symbol: string; logo?: string | null; size?: number; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const sources = useMemo(() => (logo ? logoSources(logo) : []), [logo]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt(0);
    setState("loading");
  }, [logo]);
  const color = quoteTint(symbol);
  const monogram = (
    <span
      aria-hidden
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, transparent)`, color, fontSize: Math.max(7, size * 0.38) }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
    >
      {symbol.replace(/^\$/, "").slice(0, size >= 24 ? 3 : 2).toUpperCase()}
    </span>
  );
  if (!logo || state === "failed") return monogram;
  return (
    <span className={clsx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {state === "loading" && <span className="absolute inset-0">{monogram}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sources[attempt] ?? logo}
        alt=""
        width={size}
        height={size}
        onLoad={() => setState("loaded")}
        onError={() => (attempt + 1 < sources.length ? setAttempt(attempt + 1) : setState("failed"))}
        className={clsx(
          "relative h-full w-full rounded-full bg-sunk object-cover shadow-[0_0_0_1px_var(--line)] transition-opacity",
          state === "loading" ? "opacity-0" : "opacity-100",
        )}
      />
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
