"use client";

import clsx from "clsx";
import { useState } from "react";
import { imageUrl } from "@/lib/images";

/*
 * Soft fills for coins without an image. They only tell one monogram from another: they are deliberately muted so
 * they never read as one of the meaning colours.
 */
const fills = ["#2b3a45", "#35402f", "#453c2c", "#2e3550", "#45303c", "#3a3552", "#46382c", "#2c4239"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A coin's image in a circle, or a soft monogram when it has none or it fails to load. */
export function CoinAvatar({
  src,
  symbol,
  seed,
  size = 36,
  className,
}: {
  src?: string | null;
  symbol: string;
  seed?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = imageUrl(src);
  const style = { width: size, height: size };
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={symbol} style={style} onError={() => setFailed(true)} className={clsx("shrink-0 rounded-full bg-raise object-cover", className)} />
    );
  }
  return (
    <div
      role="img"
      aria-label={symbol}
      style={{ ...style, background: fills[hash(seed ?? symbol) % fills.length], fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={clsx("flex shrink-0 items-center justify-center rounded-full leading-none font-semibold text-ink", className)}
    >
      {(symbol || "?").replace(/^\$/, "").slice(0, 2).toUpperCase()}
    </div>
  );
}
