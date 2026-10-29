import clsx from "clsx";
import { AlertTriangle, ArrowUpRight, Check, Minus, Plus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  PROTECTION_CAP_X_TAX,
  PROTECTION_EPOCH_BPS,
  RUG_COVERAGE_BPS,
  brand,
  buyTaxBpsAt,
  coinAllocationSol,
  protectionTiers,
} from "@cook/shared";
import { buckets, bucketColor } from "@/lib/buckets";
import { LogoMark } from "@/components/LogoMark";
import { IconTile } from "@/components/ui";

/** Numbered section heading. Keeps the `id` on the h2 so anchors and the nav observer work. */
export function H2({ id, n, children }: { id: string; n: number; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-baseline gap-3">
      <span className="num text-sm font-medium text-faint">{String(n).padStart(2, "0")}</span>
      <span>{children}</span>
    </h2>
  );
}

export function QuickJump({ items }: { items: { href: string; icon: LucideIcon; color: string; title: string; body: string }[] }) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="surface surface-hover group relative grid grid-cols-[auto_1fr] items-center gap-x-4 overflow-hidden rounded-[22px] p-4 sm:block sm:p-5"
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
          <div className="text-[15px] font-semibold sm:mt-5">{it.title}</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted sm:mt-1">{it.body}</p>
        </Link>
      ))}
    </div>
  );
}

export function StepCards({ steps }: { steps: { icon: LucideIcon; title: string; body: ReactNode }[] }) {
  return (
    <ol className="!mt-6 !list-none !pl-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.title} className="surface !mt-0 rounded-[22px] p-5">
          <div className="flex items-center gap-3">
            <IconTile size={38}>
              <s.icon size={17} />
            </IconTile>
            <span className="num text-xs text-faint">0{i + 1}</span>
            <span className="text-[15px] font-semibold text-fg">{s.title}</span>
          </div>
          <p className="!mt-3 text-[13.5px]">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

const topTierPct = Math.max(...protectionTiers.map((t) => t.coverageBps)) / 100;
const protectionBlurb = `Covers part of realized losses: up to ${topTierPct}% by hold time (${RUG_COVERAGE_BPS / 100}% on rugs), scaled by how much the coin paid into the fund.`;

/** The five buckets with share, what they're paid in and what they do. */
export function SplitList() {
  return (
    <div className="surface my-6 overflow-hidden rounded-[22px]">
      <div className="flex h-2 w-full">
        {buckets.map((b) => (
          <div key={b.key} style={{ width: `${b.bps / 100}%`, background: b.color }} />
        ))}
      </div>
      <ul className="!mt-0 !list-none divide-y divide-line !pl-0">
        {buckets.map((b) => (
          <li key={b.key} className="!mt-0 grid grid-cols-[auto_1fr_auto] items-start gap-x-4 gap-y-1 px-5 py-4 sm:grid-cols-[auto_200px_1fr_auto]">
            <span className="num mt-0.5 w-12 text-lg font-semibold" style={{ color: b.color }}>
              {b.bps / 100}%
            </span>
            <span className="text-sm font-semibold text-fg">{b.label}</span>
            <span className="col-span-2 col-start-2 text-[13px] leading-relaxed sm:col-span-1 sm:col-start-3">
              {b.key === "protection" ? protectionBlurb : b.blurb}
            </span>
            <span className="col-start-3 row-start-1 shrink-0 rounded-full border border-line bg-sunk px-2.5 py-0.5 text-[11px] whitespace-nowrap text-muted sm:col-start-4">
              {b.paidIn}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Personas({ people }: { people: { who: string; k: keyof typeof bucketColor; icon: LucideIcon; tag: string; text: string }[] }) {
  return (
    <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {people.map((p, i) => {
        const color = bucketColor[p.k];
        return (
          <div key={p.who} className={clsx("surface rounded-[22px] p-5", i === people.length - 1 && people.length % 2 === 1 && "sm:col-span-2")}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}
              >
                {p.who[0]}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg">{p.who}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px]" style={{ color }}>
                  <p.icon size={11} /> {p.tag}
                </div>
              </div>
            </div>
            <p className="!mt-3 text-[13.5px]">{p.text}</p>
          </div>
        );
      })}
    </div>
  );
}

type Tone = "good" | "bad" | "neutral";
export type CompareRow = { label: string; cells: [ReactNode, ReactNode, ReactNode, ReactNode]; tones?: [Tone, Tone, Tone, Tone] };

function Mark({ tone }: { tone?: Tone }) {
  if (tone === "good")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-up-soft text-up">
        <Check size={10} strokeWidth={3} />
      </span>
    );
  if (tone === "bad")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-down-soft text-down">
        <X size={10} strokeWidth={3} />
      </span>
    );
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sunk text-faint">
      <Minus size={10} strokeWidth={3} />
    </span>
  );
}

/** Comparison grid with the Cook column wrapped in a spectrum ring. */
export function CompareTable({ head, rows }: { head: [string, string, string, string]; rows: CompareRow[] }) {
  const cols = "minmax(150px,0.9fr) repeat(4, minmax(170px,1fr))";
  return (
    <div className="scroll-x -mx-4 my-6 px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="surface relative grid min-w-[880px] rounded-[22px] p-2" style={{ gridTemplateColumns: cols }}>
        <div
          className="ring-spectrum shadow-pop rounded-2xl"
          style={{ gridColumn: 2, gridRow: `1 / span ${rows.length + 1}` }}
          aria-hidden
        />
        <div style={{ gridColumn: 1, gridRow: 1 }} />
        {head.map((h, j) => (
          <div key={h} className="relative z-10 px-4 pt-4 pb-3" style={{ gridColumn: j + 2, gridRow: 1 }}>
            {j === 0 ? (
              <div className="flex items-center gap-2">
                <LogoMark size={22} live className="text-fg" />
                <span className="font-display text-lg font-semibold text-fg">{h}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-muted">{h}</span>
            )}
          </div>
        ))}
        {rows.map((r, i) => (
          <div key={r.label} className="contents">
            <div
              className="relative z-10 border-t border-line px-3 py-3.5 text-[13px] font-medium text-fg"
              style={{ gridColumn: 1, gridRow: i + 2 }}
            >
              {r.label}
            </div>
            {r.cells.map((c, j) => (
              <div
                key={j}
                className={clsx(
                  "relative z-10 flex gap-2 border-t px-4 py-3.5 text-[13px] leading-snug",
                  j === 0 ? "border-line font-medium text-fg" : "border-line text-muted",
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

export function ShareBars({ rows }: { rows: { name: string; pct: number; note: string; highlight?: boolean }[] }) {
  return (
    <div className="surface my-6 rounded-[22px] p-5 sm:p-6">
      <span className="eyebrow">Share of fees that comes back to traders and holders</span>
      <ul className="!mt-5 !list-none space-y-5 !pl-0">
        {rows.map((c) => (
          <li key={c.name} className="!mt-0">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className={c.highlight ? "font-semibold text-fg" : "text-muted"}>{c.name}</span>
              <span className={clsx("num", c.highlight ? "text-fg" : "text-muted")}>{c.pct}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-sunk">
              <div
                className={c.highlight ? "spectrum h-full rounded-full" : "h-full rounded-full bg-line-strong"}
                style={{ width: `${c.pct}%` }}
              />
            </div>
            <p className="!mt-1.5 text-xs text-faint">{c.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A rules block: icon, title, then running text or a list. */
export function RuleCard({ icon: Icon, color, title, children }: { icon: LucideIcon; color: string; title: string; children: ReactNode }) {
  return (
    <div className="surface my-6 rounded-[22px] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <IconTile color={color} size={40}>
          <Icon size={18} />
        </IconTile>
        <span className="text-[15px] font-semibold text-fg">{title}</span>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Buy tax by second after launch, as bars. */
export function SnipeChart() {
  const rates = Array.from({ length: 7 }, (_, s) => Math.round(buyTaxBpsAt(s) / 100));
  return (
    <div className="mt-5 grid grid-cols-7 items-end gap-1.5 sm:gap-2.5">
      {rates.map((r, s) => (
        <div key={s} className="flex flex-col items-center gap-2">
          <span className="num text-[11px] text-fg sm:text-xs">{r}%</span>
          <div className="flex h-28 w-full items-end overflow-hidden rounded-lg bg-sunk">
            <div
              className="w-full rounded-lg"
              style={{
                height: `${Math.max(r, 3)}%`,
                background: s === 6 ? "var(--up)" : `color-mix(in srgb, var(--b-coin) ${40 + r * 0.6}%, var(--b-protection))`,
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
    <div className={clsx("mt-5", className)}>
      <div className="grid grid-cols-5 items-end gap-2 sm:gap-3">
        {tiers.map((t) => (
          <div key={t.label} className="flex flex-col items-center gap-2">
            <span className="text-center leading-none">
              <span className="block text-[10px] text-faint">up to</span>
              <span className="num text-sm font-medium text-fg">{t.pct}%</span>
            </span>
            <div className="flex h-32 w-full items-end overflow-hidden rounded-xl bg-sunk">
              <div
                className={clsx("w-full rounded-xl", t.rug && "spectrum")}
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
      <p className="!mt-3 text-center text-[11px] text-faint">
        then × the coin&apos;s funding ratio for that epoch, capped at {PROTECTION_CAP_X_TAX}× the tax you paid
      </p>
    </div>
  );
}

/** How a coin's contributions limit what its traders can draw. Example numbers are illustrative. */
export function FundingRatio({ className }: { className?: string }) {
  const fund = 20;
  const coinA = 2;
  const budget = (fund * PROTECTION_EPOCH_BPS) / 10_000;
  const slice = coinAllocationSol(budget, coinA, fund);
  const requested = slice * 2;
  return (
    <div className={clsx("my-6 rounded-[22px] border border-line bg-sunk/60 p-5 sm:p-6", className)}>
      <span className="eyebrow">Funding ratio, worked through</span>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { k: "Coin A paid in", v: `${coinA * 10} SOL`, s: `of the ${fund * 10} SOL ever paid into the fund` },
          { k: "So it can draw", v: `${((coinA / fund) * 100).toFixed(0)}%`, s: `of each epoch's budget (${PROTECTION_EPOCH_BPS / 100}% of the fund)` },
          { k: "This epoch", v: `${(slice * 10).toFixed(1)} SOL`, s: `for coin A's traders, out of a ${(budget * 10).toFixed(0)} SOL budget` },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl border border-line bg-elev p-4">
            <div className="text-xs text-muted">{x.k}</div>
            <div className="num mt-1.5 text-2xl font-medium text-fg">{x.v}</div>
            <div className="mt-1 text-[11px] leading-snug text-faint">{x.s}</div>
          </div>
        ))}
      </div>
      <p className="!mt-4 text-[13px]">
        If coin A&apos;s traders request {(requested * 10).toFixed(1)} SOL of cover that epoch, each is paid{" "}
        {((slice / requested) * 100).toFixed(0)}% of their request. A coin that paid almost nothing into the fund can cover
        almost nothing, however big the fund is.
      </p>
    </div>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="surface my-6 divide-y divide-line overflow-hidden rounded-[22px]">
      {items.map(([q, a]) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-fg transition-colors hover:bg-elev-2 [&::-webkit-details-marker]:hidden">
            {q}
            <Plus size={16} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" />
          </summary>
          <p className="!mt-0 px-5 pb-5 text-[14px]">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function RiskCallout({ children }: { children: ReactNode }) {
  return (
    <div
      className="my-6 rounded-[22px] border p-5 sm:p-6"
      style={{
        borderColor: "color-mix(in srgb, var(--b-main) 35%, transparent)",
        background: "color-mix(in srgb, var(--b-main) 7%, var(--bg-elev))",
      }}
    >
      <div className="flex items-center gap-3">
        <IconTile color="var(--b-main)" size={40}>
          <AlertTriangle size={18} />
        </IconTile>
        <span className="text-[15px] font-semibold text-fg">Read this before you trade</span>
      </div>
      {children}
      <p className="!mt-4 text-xs">
        {brand.name} is {brand.chainLabel.toLowerCase()} and uses Meteora&apos;s pool programs. It is not affiliated with Meteora or
        with any tokenized-stock issuer.
      </p>
    </div>
  );
}
