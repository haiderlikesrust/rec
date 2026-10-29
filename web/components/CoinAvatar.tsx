"use client";

import clsx from "clsx";
import { useState } from "react";
import { imageUrl } from "@/lib/images";

const palette = ["#7C6CFF", "#12B5A0", "#F29D0C", "#E8455F", "#3A86FF", "#0FA97C", "#E25FB8", "#9B6CFF"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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
      <img
        src={url}
        alt={symbol}
        style={style}
        onError={() => setFailed(true)}
        className={clsx("shrink-0 rounded-full bg-sunk object-cover shadow-[0_0_0_1px_var(--line-strong),0_6px_16px_-8px_rgba(0,0,0,0.5)]", className)}
      />
    );
  }
  const color = palette[hash(seed ?? symbol) % palette.length];
  return (
    <div
      aria-label={symbol}
      style={{ ...style, background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))`, fontSize: Math.max(10, size * 0.36) }}
      className={clsx("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
    >
      {(symbol || "?").replace(/^\$/, "").slice(0, 2).toUpperCase()}
    </div>
  );
}
