import { ArrowLeftRight, Flame, Gift, Repeat, ShieldCheck, type LucideIcon } from "lucide-react";
import { brand, type BucketKey } from "@cook/shared";
import { buckets } from "@/lib/buckets";

const meta: Record<BucketKey, { icon: LucideIcon; sub: string; dest: string }> = {
  protection: { icon: ShieldCheck, sub: "converted to ETH", dest: "Loss claims · ETH" },
  otcReserve: { icon: ArrowLeftRight, sub: "converted to ETH", dest: "No-slippage exits" },
  mainBuyback: { icon: Flame, sub: `quote → ETH → $${brand.mainTicker}`, dest: `$${brand.mainTicker} burned` },
  coinBuyback: { icon: Flame, sub: "quote → this coin", dest: "Coin burned" },
  airdrop: { icon: Gift, sub: "kept in the quote asset", dest: "Underwater holders" },
};

const flowCss = `.cook-flow{stroke-dasharray:3 9;animation:cook-flow 1.4s linear infinite}@keyframes cook-flow{to{stroke-dashoffset:-12}}`;

/** Five-arc ring (the brand mark) drawn inside an SVG. */
function Ring({ cx, cy, r, width }: { cx: number; cy: number; r: number; width: number }) {
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <g transform={`rotate(-90 ${cx} ${cy})`}>
      {buckets.map((b) => {
        const len = (b.bps / 10_000) * c;
        const el = (
          <circle
            key={b.key}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={b.color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(len - width * 0.9, 0.1)} ${c}`}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
    </g>
  );
}

function Node({ x, y, w, h, children, accent }: { x: number; y: number; w: number; h: number; children?: React.ReactNode; accent?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="18" fill="var(--bg-elev)" stroke={accent ?? "var(--line-strong)"} strokeWidth={accent ? 1.5 : 1} />
      {children}
    </g>
  );
}

function BucketNode({ k, x, y, w, h }: { k: BucketKey; x: number; y: number; w: number; h: number }) {
  const b = buckets.find((bb) => bb.key === k)!;
  const Icon = meta[k].icon;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="16" fill="var(--bg-elev)" stroke="var(--line-strong)" />
      <rect x={x} y={y + 14} width="3.5" height={h - 28} rx="1.75" fill={b.color} />
      <rect x={x + 14} y={y + h / 2 - 16} width="32" height="32" rx="10" fill={b.color} fillOpacity="0.14" />
      <Icon x={x + 21} y={y + h / 2 - 9} width={18} height={18} stroke={b.color} strokeWidth={2} />
      <text x={x + 58} y={y + 24} fontSize="13.5" fontWeight="600" fill="var(--fg)">
        {b.label}
      </text>
      <text x={x + 58} y={y + 41} fontSize="11" fill="var(--muted)">
        {meta[k].sub}
      </text>
      <text x={x + 58} y={y + 58} fontSize="11" fontWeight="600" fill={b.color}>
        → {meta[k].dest}
      </text>
      <text x={x + w - 14} y={y + 24} textAnchor="end" fontSize="14" fontWeight="600" fill={b.color} className="num">
        {b.bps / 100}%
      </text>
    </g>
  );
}

/** The fee flow: trade → hook (3%) → five buckets → where each ends up. Wide on large screens, stacked below. */
export function FeeFlowDiagram() {
  const bx = 446;
  const bw = 334;
  const bh = 70;
  const by = (i: number) => 2 + i * 82;
  return (
    <figure className="surface my-8 overflow-hidden rounded-[22px] p-4 sm:p-7">
      {/* wide */}
      <svg viewBox="0 0 780 400" className="hidden w-full xl:block" role="img" aria-label="How the 3% fee flows from every trade to five destinations">
        <style>{flowCss}</style>
        <Node x={0} y={150} w={160} h={100}>
          <rect x="14" y="166" width="30" height="30" rx="9" fill="var(--bg-sunk)" />
          <Repeat x={21} y={173} width={16} height={16} stroke="var(--muted)" strokeWidth={2} />
          <text x="14" y="219" fontSize="13.5" fontWeight="600" fill="var(--fg)">
            Every buy &amp; sell
          </text>
          <text x="14" y="236" fontSize="11" fill="var(--muted)">
            any coin, pair or router
          </text>
        </Node>

        <path d="M160 200 L222 200" stroke="var(--accent)" strokeOpacity="0.35" strokeWidth="2" fill="none" />
        <path d="M160 200 L222 200" stroke="var(--accent)" strokeWidth="2" fill="none" className="cook-flow" />
        <rect x="170" y="170" width="42" height="20" rx="10" fill="var(--accent-soft)" />
        <text x="191" y="184" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--accent)" className="num">
          3%
        </text>

        <Node x={222} y={116} w={170} h={168} accent="var(--accent)">
          <Ring cx={307} cy={164} r={20} width={6} />
          <circle cx="307" cy="164" r="4" fill="var(--fg)" />
          <text x="307" y="216" textAnchor="middle" fontSize="14.5" fontWeight="600" fill="var(--fg)">
            {brand.name} hook
          </text>
          <text x="307" y="235" textAnchor="middle" fontSize="11" fill="var(--muted)">
            3% of the quote side
          </text>
          <text x="307" y="262" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--accent)">
            0% creator · 0% team
          </text>
        </Node>

        {buckets.map((b, i) => {
          const y = by(i) + bh / 2;
          const d = `M392 200 C 420 200, 420 ${y}, ${bx} ${y}`;
          return (
            <g key={b.key}>
              <path d={d} stroke={b.color} strokeOpacity="0.35" strokeWidth="2" fill="none" />
              <path d={d} stroke={b.color} strokeWidth="2" fill="none" className="cook-flow" />
              <BucketNode k={b.key} x={bx} y={by(i)} w={bw} h={bh} />
            </g>
          );
        })}
      </svg>

      {/* stacked */}
      <svg viewBox="0 0 360 724" className="mx-auto w-full max-w-[440px] xl:hidden" role="img" aria-label="How the 3% fee flows from every trade to five destinations">
        <style>{flowCss}</style>
        <Node x={50} y={0} w={260} h={60}>
          <text x="180" y="26" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--fg)">
            Every buy &amp; sell
          </text>
          <text x="180" y="44" textAnchor="middle" fontSize="11" fill="var(--muted)">
            any coin, pair or router
          </text>
        </Node>
        <path d="M180 60 L180 100" stroke="var(--accent)" strokeWidth="2" className="cook-flow" />
        <rect x="192" y="70" width="42" height="20" rx="10" fill="var(--accent-soft)" />
        <text x="213" y="84" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--accent)" className="num">
          3%
        </text>
        <Node x={30} y={100} w={300} h={92} accent="var(--accent)">
          <Ring cx={78} cy={146} r={17} width={5} />
          <circle cx="78" cy="146" r="3.5" fill="var(--fg)" />
          <text x="110" y="134" fontSize="14" fontWeight="600" fill="var(--fg)">
            {brand.name} hook
          </text>
          <text x="110" y="152" fontSize="11" fill="var(--muted)">
            3% of the quote side
          </text>
          <text x="110" y="171" fontSize="11" fontWeight="600" fill="var(--accent)">
            0% creator · 0% team
          </text>
        </Node>
        <path d="M180 192 L180 210 Q180 216 174 216 L22 216 Q16 216 16 222 L16 627" stroke="var(--line-strong)" strokeWidth="1.5" fill="none" />
        {buckets.map((b, i) => {
          const y = 232 + i * 90;
          const cy = y + 35;
          return (
            <g key={b.key}>
              <path d={`M16 ${cy} L32 ${cy}`} stroke={b.color} strokeWidth="2" className="cook-flow" />
              <BucketNode k={b.key} x={32} y={y} w={326} h={70} />
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <span className="spectrum mt-1.5 h-1 w-6 shrink-0 rounded-full" />
        Fees are collected in the coin&apos;s quote asset. The protection fund and OTC reserve always receive ETH, whatever
        the pair.
      </figcaption>
    </figure>
  );
}
