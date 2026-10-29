"use client";

import clsx from "clsx";
import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { quoteCategories, type QuoteAsset, type QuoteCategory } from "@cook/shared";
import { usd } from "@/lib/format";
import { QuoteLogo } from "@/components/QuoteChip";

const POPULAR = ["SOL", "USDC", "NVDAX", "TSLAX", "SPYX", "AAPL", "ANTHROPIC"];

function QuotePrice({ q }: { q: QuoteAsset }) {
  return <span className="num text-xs text-muted">{q.usdPerUnit > 0 ? usd(q.usdPerUnit) : "—"}</span>;
}

/**
 * Quote-asset picker for 120+ pairs: popular one-tap chips, then a searchable list grouped by category.
 * Every row shows the token's own logo.
 */
export function QuotePicker({
  quotes,
  value,
  onChange,
}: {
  quotes: QuoteAsset[];
  value?: QuoteAsset;
  onChange: (q: QuoteAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<QuoteCategory | "all">("all");

  const counts = useMemo(() => {
    const c: Partial<Record<QuoteCategory, number>> = {};
    for (const q of quotes) c[q.category] = (c[q.category] ?? 0) + 1;
    return c;
  }, [quotes]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return quotes.filter(
      (q) =>
        (cat === "all" || q.category === cat) &&
        (!s || q.symbol.toLowerCase().includes(s) || q.name.toLowerCase().includes(s) || q.address === search.trim()),
    );
  }, [quotes, search, cat]);

  const popular = POPULAR.map((s) => quotes.find((q) => q.symbol === s)).filter(Boolean) as QuoteAsset[];
  const pick = (q: QuoteAsset) => {
    onChange(q);
    setOpen(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
          open ? "border-accent bg-elev shadow-[0_0_0_4px_var(--accent-soft)]" : "border-line bg-sunk hover:border-line-strong",
        )}
      >
        {value ? (
          <>
            <QuoteLogo symbol={value.symbol} logo={value.logo} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{value.symbol}</span>
                <span className="truncate text-xs text-muted">{value.name}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-faint">
                {quoteCategories[value.category]} · {value.usdPerUnit > 0 ? `${usd(value.usdPerUnit)} each` : "price pending"}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-muted">Choose what your coin trades against</span>
        )}
        <span className="shrink-0 text-xs text-muted">{quotes.length} pairs</span>
        <ChevronDown size={16} className={clsx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {!open && popular.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {popular.map((q) => (
            <button
              key={q.address}
              type="button"
              onClick={() => onChange(q)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs font-medium transition-all",
                value?.address === q.address
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-elev/60 text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <QuoteLogo symbol={q.symbol} logo={q.logo} size={18} />
              {q.symbol}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-elev shadow-card animate-fade-up">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SOL, USDC, NVDA, Tesla, OpenAI…"
                className="h-10 w-full rounded-xl border border-line bg-sunk pr-3 pl-10 text-sm outline-none placeholder:text-faint focus:border-accent"
              />
            </div>
            <div className="no-scrollbar -mx-3 mt-3 overflow-x-auto px-3">
              <div className="inline-flex gap-1.5">
                {(["all", ...(Object.keys(quoteCategories) as QuoteCategory[])] as const).map((c) =>
                  c !== "all" && !counts[c] ? null : (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-all",
                        cat === c ? "border-line-strong bg-elev-2 text-fg shadow-card" : "border-line text-muted hover:text-fg",
                      )}
                    >
                      {c === "all" ? "All" : quoteCategories[c]}
                      <span className="num ml-1.5 text-faint">{c === "all" ? quotes.length : counts[c]}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {list.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">No pair matches “{search}”.</li>}
            {list.map((q) => {
              const selected = value?.address === q.address;
              return (
                <li key={q.address}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(q)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-accent-soft" : "hover:bg-sunk",
                    )}
                  >
                    <QuoteLogo symbol={q.symbol} logo={q.logo} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{q.symbol}</span>
                      <span className="block truncate text-xs text-muted">{q.name}</span>
                    </span>
                    <span className="hidden text-[11px] text-faint sm:inline">{quoteCategories[q.category]}</span>
                    <QuotePrice q={q} />
                    <span
                      className={clsx(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        selected ? "bg-accent text-white" : "border border-line-strong",
                      )}
                    >
                      {selected && <Check size={12} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
