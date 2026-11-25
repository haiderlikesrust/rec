"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

// IPFS logos also try other gateways: ipfs.io is down or blocked on some networks
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://4everland.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
const logoSources = (logo: string) => {
  const cid = logo.match(/^(?:ipfs:\/\/|https?:\/\/[^/]+\/ipfs\/)(.+)$/)?.[1];
  return cid ? [...new Set([logo.startsWith("ipfs://") ? IPFS_GATEWAYS[0] + cid : logo, ...IPFS_GATEWAYS.map((g) => g + cid)])] : [logo];
};

/**
 * A quote asset's official logo in a circle. Issuer logos are often large images on slow hosts, so a ticker
 * monogram shows until the image has loaded, and stays if it can't load.
 */
export function QuoteLogo({ symbol, logo, size = 20, className }: { symbol: string; logo?: string | null; size?: number; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const sources = useMemo(() => (logo ? logoSources(logo) : []), [logo]);
  const [attempt, setAttempt] = useState(0);
  // a different logo starts over. Done while rendering, not in an effect: an image already in the browser's cache
  // can report that it loaded before an effect would run, and the effect would then hide it again
  const [current, setCurrent] = useState(logo);
  if (current !== logo) {
    setCurrent(logo);
    setAttempt(0);
    setState("loading");
  }
  const monogram = (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.36)) }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 leading-none font-semibold text-ink-2", className)}
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
        // a long list of pairs only fetches the logos that are on screen or about to be
        loading="lazy"
        decoding="async"
        src={sources[attempt] ?? logo}
        alt=""
        width={size}
        height={size}
        onLoad={() => setState("loaded")}
        onError={() => (attempt + 1 < sources.length ? setAttempt(attempt + 1) : setState("failed"))}
        className={clsx("relative h-full w-full rounded-full bg-raise object-cover transition-opacity", state === "loading" ? "opacity-0" : "opacity-100")}
      />
    </span>
  );
}

/** A pair label as a small pill, with the quote's logo when it has one: `DOGE/SOL`, or just `SOL`. */
export function QuoteChip({ symbol, logo, className, pair }: { symbol: string; logo?: string | null; className?: string; pair?: string }) {
  return (
    <span
      className={clsx(
        "num inline-flex h-[22px] items-center gap-1.5 rounded-full bg-white/8 text-xs leading-none whitespace-nowrap text-ink-2",
        logo ? "pr-2 pl-1" : "px-2",
        className,
      )}
    >
      {logo && <QuoteLogo symbol={symbol} logo={logo} size={14} />}
      {pair ? `${pair}/${symbol}` : symbol}
    </span>
  );
}
