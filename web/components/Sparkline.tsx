import { useId } from "react";

export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  strokeWidth = 1.6,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const pts = data.filter((d) => Number.isFinite(d));
  if (pts.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line-strong)" strokeDasharray="2 4" />
      </svg>
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const coords = pts.map((p, i) => [i * step, height - 2 - ((p - min) / span) * (height - 4)] as const);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const up = pts[pts.length - 1] >= pts[0];
  const color = up ? "var(--up)" : "var(--down)";
  const [lx, ly] = coords[coords.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden overflow="visible">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#sg${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  );
}
