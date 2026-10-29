import { bucketHex, buckets } from "@/lib/buckets";

/** The fee split drawn as a five-arc ring: the brand mark. */
export function LogoMark({ size = 28, className, live }: { size?: number; className?: string; live?: boolean }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const gap = 2.2;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <g transform="rotate(-90 16 16)">
        {buckets.map((b) => {
          const len = (b.bps / 10_000) * c;
          const el = (
            <circle
              key={b.key}
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke={live ? b.color : bucketHex[b.key]}
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(len - gap, 0.1)} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </g>
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}
