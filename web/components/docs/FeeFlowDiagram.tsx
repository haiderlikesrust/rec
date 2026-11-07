import type { ReactNode } from "react";
import { ArrowLeftRight, Repeat, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { METEORA_PROTOCOL_SHARE_BPS, TAX_BPS, brand, communityShareBps, splitFees, type BucketKey } from "@cook/shared";
import { buckets } from "@/lib/buckets";
import { IconTile } from "@/components/ui";

const meta: Record<BucketKey, { icon: LucideIcon; dest: string }> = {
  protection: { icon: ShieldCheck, dest: "Pays back part of realized losses, automatically" },
  otcReserve: { icon: ArrowLeftRight, dest: "SOL to sell into with no slippage; what it buys is burned" },
};

// dashed lines that drift in the direction the money moves (reduced motion is handled globally)
const flowCss = `
.cushion-flow-y{background-image:repeating-linear-gradient(to bottom,currentColor 0 5px,transparent 5px 11px);background-size:100% 11px;animation:cushion-flow-y 1s linear infinite}
.cushion-flow-r{background-image:repeating-linear-gradient(to right,currentColor 0 5px,transparent 5px 11px);background-size:11px 100%;animation:cushion-flow-r 1s linear infinite}
.cushion-flow-l{background-image:repeating-linear-gradient(to right,currentColor 0 5px,transparent 5px 11px);background-size:11px 100%;animation:cushion-flow-l 1s linear infinite}
@keyframes cushion-flow-y{to{background-position:0 11px}}
@keyframes cushion-flow-r{to{background-position:11px 0}}
@keyframes cushion-flow-l{to{background-position:-11px 0}}`;

function FlowNode({ icon: Icon, color, title, sub, value, valueSub }: { icon: LucideIcon; color: string; title: string; sub: string; value: ReactNode; valueSub: string }) {
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-[520px] items-center gap-3 rounded-2xl bg-elev-2 p-3.5 shadow-[inset_0_0_0_1px_var(--line-strong)] sm:gap-4 sm:p-4">
      <IconTile color={color} size={40}>
        <Icon size={18} />
      </IconTile>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[15px] leading-tight font-semibold text-fg sm:text-base">{title}</div>
        <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num font-display text-2xl leading-none font-semibold" style={{ color }}>
          {value}
        </div>
        <div className="mt-1 text-[11px] text-faint">{valueSub}</div>
      </div>
    </div>
  );
}

/** A vertical connector on the center line, with an optional pill label sitting on it. */
function Trunk({ color, label, className }: { color: string; label?: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className ?? "h-12"}`}>
      <div className="cushion-flow-y absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full" style={{ color }} aria-hidden />
      {label && (
        <span
          className="num font-display absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-elev px-3 py-1 text-[12px] font-semibold whitespace-nowrap"
          style={{ color, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 45%, transparent)` }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * The fee flow, as one tree that reads the same at every width: a trade pays 3% → Meteora keeps its share → the fee
 * wallet converts the rest to SOL → half to the OTC reserve, half to the protection fund. Then the same split on a
 * $100 trade, in dollars.
 */
export function FeeFlowDiagram() {
  const restPct = communityShareBps(false) / 100;
  const restPctRef = communityShareBps(true) / 100;
  const meteoraPct = METEORA_PROTOCOL_SHARE_BPS / 100;
  const meteoraPctRef = 100 - restPctRef;
  const taxPct = TAX_BPS / 100;

  // the same split, in dollars, on one $100 trade
  const trade = 100;
  const fee = (trade * TAX_BPS) / 10_000;
  const meteora = fee * (1 - restPct / 100);
  const halves = splitFees(fee - meteora);
  const strip = [
    { key: "meteora", label: "Meteora", value: meteora, color: "var(--line-strong)" },
    ...buckets.map((b) => ({ key: b.key, label: b.short, value: halves[b.key], color: b.color })),
  ];
  const d2 = (n: number) => `$${n.toFixed(2)}`;

  return (
    <figure className="surface my-8 rounded-[24px] p-5 sm:p-8">
      <style>{flowCss}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">Where every {taxPct}% goes</span>
        <span className="font-display inline-flex items-center gap-1.5 rounded-full bg-up-soft px-3 py-1 text-[12px] font-semibold text-up">
          0% creator · 0% team
        </span>
      </div>

      <div className="mt-6">
        <FlowNode icon={Repeat} color="var(--accent)" title="Every buy & sell" sub="any coin, pair or app" value={`${taxPct}%`} valueSub="quote-side fee" />

        {/* the trunk, with Meteora's share branching off to the right */}
        <div className="relative h-[72px]">
          <div className="cushion-flow-y absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full text-accent" aria-hidden />
          <div className="cushion-flow-r absolute top-1/2 left-1/2 h-0.5 w-5 -translate-y-1/2 text-faint sm:w-8" aria-hidden />
          <div className="absolute top-1/2 left-[calc(50%+1.25rem)] right-0 -translate-y-1/2 sm:left-[calc(50%+2rem)]">
            <div className="w-fit max-w-full rounded-xl bg-sunk px-3 py-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
              <div className="num font-display text-[13px] leading-tight font-semibold text-fg">{meteoraPct}% to Meteora</div>
              <div className="num mt-0.5 text-[11px] leading-tight text-faint">
                {meteoraPctRef}% on swaps {brand.name} builds
              </div>
            </div>
          </div>
        </div>

        <FlowNode
          icon={Wallet}
          color="var(--violet)"
          title="Fee wallet"
          sub="claims the rest, swaps it to SOL"
          value={`${restPct}%`}
          valueSub={`or ${restPctRef}% via ${brand.name}`}
        />

        <Trunk color="var(--muted)" label="50 / 50" className="h-11" />

        {/* the fork: one line into two, lined up with the two cards below (gap-3 → each center sits 3px off the quarter) */}
        <div className="relative h-7" aria-hidden>
          <div className="absolute top-0 left-1/2 h-1/2 w-0.5 -translate-x-1/2 bg-[var(--muted)] opacity-70" />
          {buckets.map((b, i) => (
            <div key={b.key} style={{ color: b.color }}>
              <div
                className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${i === 0 ? "cushion-flow-l" : "cushion-flow-r"}`}
                style={i === 0 ? { left: "calc(25% - 3px)", right: "50%" } : { left: "50%", right: "calc(25% - 3px)" }}
              />
              <div
                className="cushion-flow-y absolute top-1/2 bottom-0 w-0.5 -translate-x-1/2"
                style={{ left: i === 0 ? "calc(25% - 3px)" : "calc(75% + 3px)" }}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {buckets.map((b) => {
            const Icon = meta[b.key].icon;
            return (
              <div
                key={b.key}
                className="rounded-2xl bg-sunk p-3.5 sm:p-5"
                style={{ boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${b.color} 35%, transparent), 0 14px 34px -22px ${b.color}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <IconTile color={b.color} size={36}>
                    <Icon size={17} />
                  </IconTile>
                  <span className="num font-display text-2xl font-semibold sm:text-3xl" style={{ color: b.color }}>
                    {b.bps / 100}%
                  </span>
                </div>
                <div className="font-display mt-3 text-[14px] leading-tight font-semibold text-fg sm:text-[16px]">{b.label}</div>
                <div className="mt-1 text-[12px] leading-snug text-muted sm:text-[13px]">{meta[b.key].dest}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* the same thing in dollars */}
      <div className="mt-7 rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="eyebrow">On a ${trade} trade</span>
          <span className="num text-xs text-muted">
            <span className="font-semibold text-fg">{d2(fee)}</span> fee
          </span>
        </div>
        <div className="mt-3 flex gap-0.5" aria-hidden>
          {strip.map((s) => (
            <div key={s.key} className="h-3 rounded-[4px] first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / fee) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="mt-2 flex gap-0.5">
          {strip.map((s) => (
            <div key={s.key} className="min-w-0" style={{ width: `${(s.value / fee) * 100}%` }}>
              <div className="num font-display text-[14px] font-semibold text-fg sm:text-[15px]">{d2(s.value)}</div>
              <div className="truncate text-[11px] text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <figcaption className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <span className="spectrum mt-1.5 h-1 w-6 shrink-0 rounded-full" aria-hidden />
        <span>
          Meteora keeps its protocol share ({meteoraPct}% of the fee, {meteoraPctRef}% on swaps built by {brand.name}, because the
          fee wallet is the referral). The fee wallet claims the rest from every pool, converts it to SOL whatever the pair, and
          splits it in half. A copy that doesn&apos;t lead its {brand.nest} sends both halves to the coin that does.
        </span>
      </figcaption>
    </figure>
  );
}
