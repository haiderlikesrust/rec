import clsx from "clsx";
import { ArrowUpRight, Check, Minus, Plus, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  LAUNCH_FEE_SOL,
  METEORA_PROTOCOL_SHARE_BPS,
  PROTECTION_CAP_X_TAX,
  PROTECTION_PAYOUT_BPS,
  RUG_COVERAGE_BPS,
  brand,
  buyTaxBpsAt,
  communityShareBps,
  protectionPayout,
  protectionTiers,
  splitFees,
} from "@cook/shared";
import { buckets } from "@/lib/buckets";
import { LogoMark } from "@/components/LogoMark";
import { IconTile } from "@/components/ui";

// Everything here renders inside `.prose-docs`, whose unlayered rules (p, li, ul, a, h2, h3) beat Tailwind
// utilities. Blocks use divs for their own text, or `!` utilities where a prose element is kept on purpose.

/** Meteora's cut of the one-off launch fee (the rest is split like any fee). */
export const LAUNCH_FEE_METEORA_SHARE = 0.1;

export const bucketPct = (key: (typeof buckets)[number]["key"]) => (buckets.find((b) => b.key === key)?.bps ?? 0) / 100;

/**
 * Numbered section heading with an eyebrow. The `id` sits on the wrapper so anchors land with the eyebrow in view and
 * the nav's scroll tracking sees the whole heading.
 */
export function H2({ id, n, eyebrow, children }: { id: string; n: number; eyebrow?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="mt-20 scroll-mt-36 sm:mt-24 lg:scroll-mt-28">
      <div className="eyebrow flex items-center gap-2.5">
        <span className="num">{String(n).padStart(2, "0")}</span>
        <span className="h-px w-5 bg-line-strong" aria-hidden />
        {eyebrow}
      </div>
      <h2 className="!mt-2.5 !mb-0 !text-[27px] !leading-[1.12] sm:!text-[34px]">{children}</h2>
    </div>
  );
}

export function QuickJump({ items }: { items: { href: string; icon: LucideIcon; color: string; title: string; body: string }[] }) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="surface surface-hover group relative grid grid-cols-[auto_1fr] items-center gap-x-4 overflow-hidden rounded-[24px] p-4 sm:block sm:p-5"
        >
          <div
            className="absolute -top-14 -right-14 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
            style={{ background: it.color }}
            aria-hidden
          />
          <div className="row-span-2 sm:flex sm:items-center sm:justify-between">
            <IconTile color={it.color} size={40}>
              <it.icon size={18} />
            </IconTile>
            <ArrowUpRight size={16} className="hidden text-faint transition-colors group-hover:text-fg sm:block" />
          </div>
          <div className="font-display text-[16px] font-semibold sm:mt-5">{it.title}</div>
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted sm:mt-1">{it.body}</div>
        </Link>
      ))}
    </div>
  );
}

/** At-a-glance numbers for the overview, as one panel of stat tiles. */
export function GlancePanel({ items, className }: { items: { value: ReactNode; label: string; color?: string }[]; className?: string }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-line bg-line shadow-card", className)}>
      {items.map((it) => (
        <div key={it.label} className="bg-elev p-5">
          <div className="num font-display text-3xl leading-none font-semibold" style={{ color: it.color ?? "var(--fg)" }}>
            {it.value}
          </div>
          <div className="mt-2 text-xs leading-snug text-muted">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

export function StepCards({ steps, color }: { steps: { icon: LucideIcon; title: string; body: ReactNode; color?: string }[]; color?: string }) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {steps.map((s, i) => (
        <div key={s.title} className="surface rounded-[24px] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <IconTile color={s.color ?? color} size={40}>
              <s.icon size={18} />
            </IconTile>
            <span className="num text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display text-[16px] font-semibold text-fg">{s.title}</span>
          </div>
          <div className="mt-3 text-[14px] leading-relaxed text-muted">{s.body}</div>
        </div>
      ))}
    </div>
  );
}

const topTierPct = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 100;
const protectionBlurb = `Covers part of realized losses: up to ${topTierPct}% by hold time (${RUG_COVERAGE_BPS / 100}% on rugs), paid from what the coin itself put into the fund.`;

/** The two halves side by side, then Meteora's cut and the launch fee. */
export function SplitCards({ icon }: { icon: Record<(typeof buckets)[number]["key"], LucideIcon> }) {
  const share = communityShareBps(false) / 100;
  const shareRef = communityShareBps(true) / 100;
  const launchRest = LAUNCH_FEE_SOL * (1 - LAUNCH_FEE_METEORA_SHARE);
  const launchSplit = splitFees(launchRest);
  return (
    <div className="my-6">
      <div className="flex h-3 w-full gap-1.5" aria-hidden>
        {buckets.map((b) => (
          <div
            key={b.key}
            className="h-full rounded-full"
            style={{ width: `${b.bps / 100}%`, background: b.color, boxShadow: `0 0 16px -2px ${b.color}` }}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {buckets.map((b) => {
          const Icon = icon[b.key];
          return (
            <div key={b.key} className="surface rounded-[24px] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <IconTile color={b.color} size={40}>
                  <Icon size={18} />
                </IconTile>
                <span className="num font-display text-3xl font-semibold" style={{ color: b.color }}>
                  {b.bps / 100}%
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="font-display text-[17px] font-semibold text-fg">{b.label}</span>
                <span className="rounded-full border border-line bg-sunk px-2.5 py-0.5 text-[11px] text-muted">paid in {b.paidIn}</span>
              </div>
              <div className="mt-2 text-[14px] leading-relaxed text-muted">{b.key === "protection" ? protectionBlurb : b.blurb}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        <div className="bg-sunk p-4 sm:p-5">
          <div className="eyebrow">Before the split</div>
          <div className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Meteora keeps <span className="text-fg">{METEORA_PROTOCOL_SHARE_BPS / 100}%</span> of the fee as its protocol share (
            {100 - shareRef}% on swaps {brand.name} builds, which name the fee wallet as referral). The halves share the other{" "}
            {share}–{shareRef}%.
          </div>
        </div>
        <div className="bg-sunk p-4 sm:p-5">
          <div className="eyebrow">The launch fee</div>
          <div className="mt-2 text-[13.5px] leading-relaxed text-muted">
            Each launch pays <span className="num text-fg">{LAUNCH_FEE_SOL} SOL</span>. Meteora keeps {LAUNCH_FEE_METEORA_SHARE * 100}%;
            the other <span className="num">{launchRest.toFixed(3)}</span> SOL is split like the coin&apos;s fees:{" "}
            <span className="num">{launchSplit.otcReserve.toFixed(4)}</span> to the OTC reserve,{" "}
            <span className="num">{launchSplit.protection.toFixed(4)}</span> to the {brand.landing} fund.
          </div>
        </div>
      </div>
    </div>
  );
}

export type Persona = { who: string; color: string; icon: LucideIcon; tag: string; text: ReactNode };

export function Personas({ people }: { people: Persona[] }) {
  return (
    <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {people.map((p, i) => (
        <div
          key={p.who}
          className={clsx("surface rounded-[24px] p-5 sm:p-6", i === people.length - 1 && people.length % 2 === 1 && "sm:col-span-2")}
        >
          <div className="flex items-center gap-3">
            <span
              className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-[#0b1124]"
              style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 60%, #0b1124))` }}
              aria-hidden
            >
              {p.who[0]}
            </span>
            <div className="min-w-0">
              <div className="font-display text-[16px] font-semibold text-fg">{p.who}</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: p.color }}>
                <p.icon size={12} /> {p.tag}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[14px] leading-relaxed text-muted">{p.text}</div>
        </div>
      ))}
    </div>
  );
}

type Tone = "good" | "bad" | "neutral";
export type CompareRow = { label: string; cells: [ReactNode, ReactNode, ReactNode, ReactNode]; tones?: [Tone, Tone, Tone, Tone] };

function Mark({ tone }: { tone?: Tone }) {
  const label = tone === "good" ? "better" : tone === "bad" ? "worse" : "neutral";
  if (tone === "good")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-up-soft text-up" aria-label={label}>
        <Check size={10} strokeWidth={3} />
      </span>
    );
  if (tone === "bad")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-down-soft text-down" aria-label={label}>
        <X size={10} strokeWidth={3} />
      </span>
    );
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sunk text-faint" aria-label={label}>
      <Minus size={10} strokeWidth={3} />
    </span>
  );
}

type CompareHead = string | { name: string; logo: string };

/** Comparison grid with our column wrapped in a spectrum ring. Other columns can carry their own logo. Scrolls inside itself on phones. */
export function CompareTable({ head, rows }: { head: [string, CompareHead, CompareHead, CompareHead]; rows: CompareRow[] }) {
  const cols = "minmax(140px,0.85fr) repeat(4, minmax(168px,1fr))";
  return (
    <div className="thin-scrollbar -mx-4 my-6 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="surface relative grid min-w-[840px] rounded-[24px] p-2" style={{ gridTemplateColumns: cols }}>
        <div className="ring-spectrum shadow-pop rounded-2xl" style={{ gridColumn: 2, gridRow: `1 / span ${rows.length + 1}` }} aria-hidden />
        <div style={{ gridColumn: 1, gridRow: 1 }} />
        {head.map((h, j) => {
          const name = typeof h === "string" ? h : h.name;
          return (
            <div key={name} className="relative z-10 px-4 pt-4 pb-3" style={{ gridColumn: j + 2, gridRow: 1 }}>
              {j === 0 ? (
                <div className="flex items-center gap-2">
                  <LogoMark size={22} />
                  <span className="font-display text-lg font-semibold text-fg">{name}</span>
                </div>
              ) : typeof h === "string" ? (
                <span className="font-display text-sm font-semibold text-muted">{name}</span>
              ) : (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static logo */}
                  <img src={h.logo} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 object-contain" />
                  <span className="font-display text-sm font-semibold text-muted">{name}</span>
                </div>
              )}
            </div>
          );
        })}
        {rows.map((r, i) => (
          <div key={r.label} className="contents">
            <div className="font-display relative z-10 border-t border-line px-3 py-3.5 text-[13px] font-semibold text-fg" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {r.label}
            </div>
            {r.cells.map((c, j) => (
              <div
                key={j}
                className={clsx(
                  "relative z-10 flex gap-2 border-t border-line px-4 py-3.5 text-[13px] leading-snug",
                  j === 0 ? "font-semibold text-fg" : "text-muted",
                )}
                style={{ gridColumn: j + 2, gridRow: i + 2 }}
              >
                {r.tones && <Mark tone={r.tones[j]} />}
                <span>{c}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShareBars({ title, rows }: { title: string; rows: { name: string; pct: number; note: string; highlight?: boolean }[] }) {
  return (
    <div className="surface my-6 rounded-[24px] p-5 sm:p-6">
      <div className="eyebrow">{title}</div>
      <div className="mt-5 space-y-5">
        {rows.map((c) => (
          <div key={c.name}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className={c.highlight ? "font-display font-semibold text-fg" : "text-muted"}>{c.name}</span>
              <span className={clsx("num font-display", c.highlight ? "text-lg font-semibold text-fg" : "text-muted")}>{c.pct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-sunk">
              <div className={c.highlight ? "spectrum h-full rounded-full" : "h-full rounded-full bg-line-strong"} style={{ width: `${c.pct}%` }} />
            </div>
            <div className="mt-1.5 text-xs leading-relaxed text-faint">{c.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A rules block: icon, title, then running text or a list. */
export function RuleCard({
  icon: Icon,
  color,
  title,
  children,
  flush,
  className,
}: {
  icon: LucideIcon;
  color: string;
  title: ReactNode;
  children: ReactNode;
  /** drop the vertical margin, for cards placed in a grid */
  flush?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("surface rounded-[24px] p-5 sm:p-6", !flush && "my-6", className)}>
      <div className="flex items-center gap-3">
        <IconTile color={color} size={40}>
          <Icon size={18} />
        </IconTile>
        <span className="font-display text-[17px] leading-snug font-semibold text-fg">{title}</span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Rules as a grid of small titled tiles: two columns on wider screens instead of one long list. */
export function RuleGrid({ items, color, className }: { items: { title: string; body: ReactNode; icon?: LucideIcon }[]; color: string; className?: string }) {
  return (
    <div className={clsx("mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
          <div className="flex items-center gap-2">
            {it.icon ? <it.icon size={15} style={{ color }} className="shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
            <span className="font-display text-[15px] font-semibold text-fg">{it.title}</span>
          </div>
          <div className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{it.body}</div>
        </div>
      ))}
    </div>
  );
}

/** Fee by second after launch, as bars. */
export function SnipeChart() {
  const rates = Array.from({ length: 7 }, (_, s) => Math.round(buyTaxBpsAt(s) / 100));
  return (
    <div className="grid grid-cols-7 items-end gap-1.5 sm:gap-2" role="img" aria-label={`Fee by second after launch: ${rates.map((r, s) => `${s}s ${r}%`).join(", ")}`}>
      {rates.map((r, s) => (
        <div key={s} className="flex flex-col items-center gap-2">
          <span className="num text-[11px] text-fg sm:text-xs">{r}%</span>
          <div className="flex h-32 w-full items-end overflow-hidden rounded-lg bg-sunk">
            <div
              className="w-full rounded-t-[4px]"
              style={{
                height: `${Math.max(r, 3)}%`,
                background: s === 6 ? "var(--up)" : `color-mix(in srgb, var(--accent) ${40 + r * 0.6}%, var(--accent-2))`,
              }}
            />
          </div>
          <span className="num text-[11px] text-faint">{s === 6 ? "6s+" : `${s}s`}</span>
        </div>
      ))}
    </div>
  );
}

/** "Up to" protection rates by hold time, plus the rug rate, as a stepped bar chart. Values come from shared. */
export function TierChart({ className }: { className?: string }) {
  const tiers = [
    ...protectionTiers.map((t) => ({ label: t.label, pct: t.coverageBps / 100, rug: false })),
    { label: "Rug-flagged coin", pct: RUG_COVERAGE_BPS / 100, rug: true },
  ];
  const max = Math.max(...tiers.map((t) => t.pct));
  return (
    <div className={clsx("mt-5 rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5", className)}>
      <div className="grid grid-cols-5 items-end gap-2 sm:gap-3">
        {tiers.map((t) => (
          <div key={t.label} className="flex flex-col items-center gap-2" title={`${t.label}: up to ${t.pct}%`}>
            <span className="text-center leading-none">
              <span className="block text-[10px] text-faint">up to</span>
              <span className="num font-display text-[15px] font-semibold text-fg">{t.pct}%</span>
            </span>
            <div className="flex h-32 w-full items-end overflow-hidden rounded-xl bg-elev">
              <div
                className={clsx("w-full rounded-t-[4px]", t.rug && "spectrum")}
                style={{
                  height: `${Math.max((t.pct / max) * 100, 2)}%`,
                  background: t.rug ? undefined : `color-mix(in srgb, var(--b-protection) ${35 + t.pct}%, transparent)`,
                }}
              />
            </div>
            <span className="text-center text-[11px] leading-tight text-muted">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-[11px] text-faint">
        of your loss, capped at {PROTECTION_CAP_X_TAX}× the tax you paid and {PROTECTION_PAYOUT_BPS / 100}% of the coin&apos;s pot
      </div>
    </div>
  );
}

/** How a coin's own pot limits what its sellers are paid. Example numbers are illustrative. */
export function PotExample({ className }: { className?: string }) {
  const paidIn = 20;
  const paidOut = 5;
  const pot = paidIn - paidOut;
  const loss = 10;
  const first = protectionPayout({ lossSol: loss, holdSeconds: 7 * 3600, rugged: false, taxPaidSol: 1, paidOnCoinSol: 0, potSol: pot });
  const nextMax = ((pot - first.payoutSol) * PROTECTION_PAYOUT_BPS) / 10_000;
  return (
    <div className={clsx("my-6 rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5", className)}>
      <div className="eyebrow">A coin&apos;s pot, worked through</div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { k: "Coin A paid in", v: `${paidIn} SOL`, s: `${bucketPct("protection")}% of its fees, converted to SOL` },
          { k: "Already paid out", v: `${paidOut} SOL`, s: "to earlier sellers at a loss" },
          { k: "Next payout up to", v: `${((pot * PROTECTION_PAYOUT_BPS) / 10_000).toFixed(2)} SOL`, s: `${PROTECTION_PAYOUT_BPS / 100}% of the ${pot} SOL left` },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl bg-elev p-4 shadow-card">
            <div className="text-xs text-muted">{x.k}</div>
            <div className="num font-display mt-1.5 text-2xl font-semibold text-fg">{x.v}</div>
            <div className="mt-1 text-[11px] leading-snug text-faint">{x.s}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[13.5px] leading-relaxed text-muted">
        A seller who held 7 hours and lost {loss} SOL earns {first.tierBps / 100}%, so {first.requestedSol} SOL, and is paid{" "}
        {first.payoutSol.toFixed(2)} SOL about a minute later. The pot drops to {(pot - first.payoutSol).toFixed(2)} SOL, so the
        next seller can get up to {nextMax.toFixed(2)} SOL. A coin that paid almost nothing into the fund can pay almost nothing
        out, however big the fund is.
      </div>
    </div>
  );
}

export function Faq({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="surface my-6 divide-y divide-line overflow-hidden rounded-[24px]">
      {items.map(([q, a]) => (
        <details key={q} className="group">
          <summary className="font-display flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15.5px] font-semibold text-fg transition-colors hover:bg-elev-2 sm:px-6 [&::-webkit-details-marker]:hidden">
            {q}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunk text-muted transition-transform duration-200 group-open:rotate-45">
              <Plus size={15} />
            </span>
          </summary>
          <div className="px-5 pb-5 text-[14px] leading-relaxed text-muted sm:px-6">{a}</div>
        </details>
      ))}
    </div>
  );
}

export function RiskCallout({ children }: { children: ReactNode }) {
  return (
    <div
      className="my-6 rounded-[24px] border p-5 sm:p-6"
      style={{
        borderColor: "color-mix(in srgb, var(--down) 30%, transparent)",
        background: "color-mix(in srgb, var(--down) 6%, var(--bg-elev))",
      }}
    >
      <div className="flex items-center gap-3">
        <IconTile color="var(--down)" size={40}>
          <TriangleAlert size={18} />
        </IconTile>
        <span className="font-display text-[17px] font-semibold text-fg">Read this before you trade</span>
      </div>
      {children}
      <p className="!mt-4 text-xs">
        {brand.name} is {brand.chainLabel.toLowerCase()} and uses Meteora&apos;s pool programs. It is not affiliated with Meteora or
        with any tokenized-stock issuer.
      </p>
    </div>
  );
}
