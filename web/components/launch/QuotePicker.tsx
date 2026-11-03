"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSolanaAddress, quoteCategories, type QuoteAsset, type QuoteCategory } from "@cook/shared";
import { client } from "@/lib/data";
import { short, usd } from "@/lib/format";
import { errorMessage } from "@/lib/tx";
import { QuoteLogo } from "@/components/QuoteChip";

const POPULAR = ["SOL", "USDC", "NVDAX", "TSLAX", "SPYX", "AAPL", "ANTHROPIC"];

function QuotePrice({ q }: { q: QuoteAsset }) {
  return <span className="num text-xs text-muted">{q.usdPerUnit > 0 ? usd(q.usdPerUnit) : "—"}</span>;
}

/** A horizontal row that scrolls: a scrollbar that stays visible, plus an arrow at whichever end has more. */
function ScrollRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = (side: "left" | "right") => (
    <button
      type="button"
      aria-label={side === "left" ? "Scroll categories left" : "Scroll categories right"}
      onClick={() => nudge(side === "left" ? -1 : 1)}
      className={clsx(
        "absolute top-0 bottom-2.5 flex w-12 items-center from-elev from-40% to-transparent",
        side === "left" ? "left-0 justify-start bg-linear-to-r" : "right-0 justify-end bg-linear-to-l",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-elev-2 text-muted shadow-card transition-colors hover:text-fg">
        {side === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </span>
    </button>
  );
  return (
    <div className="relative">
      <div ref={ref} className="thin-scrollbar overflow-x-auto pb-2.5">
        <div className="inline-flex gap-1.5">{children}</div>
      </div>
      {edges.left && arrow("left")}
      {edges.right && arrow("right")}
    </div>
  );
}

/**
 * Quote-asset picker for 120+ pairs: popular one-tap chips, then a searchable list grouped by category. Pasting
 * any token's address adds it as a custom pair. Every row shows the token's own logo.
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
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const counts = useMemo(() => {
    const c: Partial<Record<QuoteCategory, number>> = {};
    for (const q of quotes) c[q.category] = (c[q.category] ?? 0) + 1;
    return c;
  }, [quotes]);

  const pasted = isSolanaAddress(search.trim()) ? search.trim() : "";
  const list = useMemo(() => {
    if (pasted) return quotes.filter((q) => q.address === pasted);
    const s = search.trim().toLowerCase();
    return quotes.filter(
      (q) => (cat === "all" || q.category === cat) && (!s || q.symbol.toLowerCase().includes(s) || q.name.toLowerCase().includes(s)),
    );
  }, [quotes, search, cat, pasted]);
  useEffect(() => setAddError(""), [pasted]);
  // a pasted token that isn't a pair yet: show what it is before it's added
  const preview = useQuery({
    queryKey: ["token-preview", pasted],
    queryFn: () => client.tokenPreview(pasted),
    enabled: !!pasted && list.length === 0,
    staleTime: 60_000,
    retry: false,
  });
  const token = preview.data;

  const popular = POPULAR.map((s) => quotes.find((q) => q.symbol === s)).filter(Boolean) as QuoteAsset[];
  const pick = (q: QuoteAsset) => {
    onChange(q);
    setOpen(false);
    setSearch("");
  };

  async function addCustom() {
    setAdding(true);
    setAddError("");
    try {
      pick(await client.addQuote(pasted));
    } catch (e) {
      setAddError(errorMessage(e));
    } finally {
      setAdding(false);
    }
  }

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
              <span className="mt-0.5 block truncate text-[11px] text-faint">
                {value.category === "custom" ? `Custom · ${short(value.address)}` : quoteCategories[value.category]} ·{" "}
                {value.usdPerUnit > 0 ? `${usd(value.usdPerUnit)} each` : "price pending"}
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
          <button
            type="button"
            onClick={() => {
              setCat("all");
              setOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-fg"
          >
            <Plus size={13} /> Any token
          </button>
        </div>
      )}

      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-elev shadow-card animate-fade-up">
          <div className="border-b border-line p-3 pb-1">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search, or paste any token address"
                className="h-10 w-full rounded-xl border border-line bg-sunk pr-3 pl-10 text-sm outline-none placeholder:text-faint focus:border-accent"
              />
            </div>
            <div className="mt-3">
              <ScrollRow>
                {(["all", ...(Object.keys(quoteCategories) as QuoteCategory[])] as const).map((c) =>
                  c !== "all" && !counts[c] ? null : (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-all",
                        cat === c && !pasted ? "border-line-strong bg-elev-2 text-fg shadow-card" : "border-line text-muted hover:text-fg",
                      )}
                    >
                      {c === "all" ? "All" : quoteCategories[c]}
                      <span className="num ml-1.5 text-faint">{c === "all" ? quotes.length : counts[c]}</span>
                    </button>
                  ),
                )}
              </ScrollRow>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {pasted && list.length === 0 && (
              <li className="p-1.5">
                <div className="rounded-xl border border-dashed border-line-strong bg-sunk p-4">
                  <div className="text-[11px] tracking-wider text-faint uppercase">Use this token as the pair</div>
                  {preview.isLoading ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                      <Loader2 size={14} className="animate-spin" /> Looking it up…
                    </div>
                  ) : token ? (
                    <div className="mt-3 flex items-center gap-3">
                      <QuoteLogo symbol={token.symbol} logo={token.logo} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold">{token.symbol}</span>
                          {token.launchpad && (
                            <span className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10px] text-muted">{token.launchpad}</span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted">{token.name}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-sm">{token.usdPrice > 0 ? usd(token.usdPrice) : "—"}</div>
                        {token.mcapUsd !== null && <div className="num text-[11px] text-faint">{usd(token.mcapUsd)} mcap</div>}
                      </div>
                    </div>
                  ) : preview.error ? (
                    <p className="mt-2 text-xs text-down">{errorMessage(preview.error)}</p>
                  ) : null}
                  <p className="num mt-2 text-[11px] break-all text-faint">{pasted}</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-faint">
                    Any Solana token Jupiter can price and trade, pump.fun coins included. The first launch on a new pair
                    pays its Meteora setup, about 0.006 SOL.
                  </p>
                  <button
                    type="button"
                    onClick={addCustom}
                    disabled={adding || !token}
                    className="btn-primary mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium disabled:opacity-60"
                  >
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {adding ? "Checking the token…" : token ? `Pair with ${token.symbol}` : "Add pair"}
                  </button>
                  {addError && <p className="mt-2 text-xs leading-relaxed text-down">{addError}</p>}
                </div>
              </li>
            )}
            {!pasted && list.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-muted">
                No pair matches “{search}”. Paste a token address to pair with any token.
              </li>
            )}
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
