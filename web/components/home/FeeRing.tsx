"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { buckets, type BucketKey } from "@/lib/buckets";

/**
 * The 3% drawn as a ring of five arcs. Arcs draw in on mount; hovering an arc (or its legend row)
 * highlights it. `values` are optional live labels per bucket.
 */
export function FeeRing({
  center,
  values,
  size = 300,
  className,
}: {
  center?: React.ReactNode;
  values?: Partial<Record<BucketKey, string>>;
  size?: number;
  className?: string;
}) {
  const [drawn, setDrawn] = useState(false);
  const [hover, setHover] = useState<BucketKey | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 80);
    return () => clearTimeout(t);
  }, []);

  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = 1.6;
  let offset = 0;
  const active = hover ? buckets.find((b) => b.key === hover) : null;

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <div className="absolute inset-[12%] animate-spin-slow rounded-full opacity-60 blur-2xl spectrum" aria-hidden />
        <svg viewBox="0 0 100 100" className="relative h-full w-full" aria-label="Fee split: 40% protection, 30% OTC reserve, 10% platform burn, 10% coin burn, 10% airdrop">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
          <g transform="rotate(-90 50 50)">
            {buckets.map((b, i) => {
              const len = (b.bps / 10_000) * c;
              const dash = Math.max(len - gap, 0.1);
              const el = (
                <circle
                  key={b.key}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={b.color}
                  strokeWidth={hover === b.key ? 11 : 9}
                  strokeLinecap="round"
                  strokeDasharray={`${drawn ? dash : 0} ${c}`}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setHover(b.key)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    transition: `stroke-dasharray 1.1s cubic-bezier(0.2,0.7,0.2,1) ${i * 0.12}s, stroke-width 0.2s, opacity 0.2s`,
                    opacity: hover && hover !== b.key ? 0.35 : 1,
                    filter: `drop-shadow(0 0 3px color-mix(in srgb, ${b.color} 60%, transparent))`,
                    cursor: "pointer",
                  }}
                />
              );
              offset += len;
              return el;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="num text-4xl font-medium" style={{ color: active.color }}>
                {active.bps / 100}%
              </span>
              <span className="mt-1 max-w-[9rem] text-xs leading-snug text-muted">{active.label}</span>
              {values?.[active.key] && <span className="num mt-1.5 text-sm">{values[active.key]}</span>}
            </>
          ) : (
            center
          )}
        </div>
      </div>
      <ul className="mt-6 grid w-full grid-cols-1 gap-0.5">
        {buckets.map((b) => (
          <li
            key={b.key}
            onMouseEnter={() => setHover(b.key)}
            onMouseLeave={() => setHover(null)}
            className={clsx(
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors",
              hover === b.key ? "bg-elev-2" : "",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: b.color }} />
            <span className="truncate text-muted">{b.label}</span>
            <span className="num ml-auto shrink-0 font-medium">{values?.[b.key] ?? `${b.bps / 100}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
