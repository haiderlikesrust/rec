"use client";

import clsx from "clsx";
import { Clock, Crown, Flame, GraduationCap, LayoutGrid, List, Rocket, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { quoteCategories, type Coin, type CoinSort, type QuoteCategory } from "@cook/shared";
import { useCoins, useQuotes } from "@/lib/data";
import { age, short, tokens, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { GraduationBar } from "@/components/GraduationBar";
import { QuoteChip } from "@/components/QuoteChip";
import { Sparkline } from "@/components/Sparkline";
import { Badge, Button, ButtonLink, Change, EmptyState, ErrorState, SectionHeading, Skeleton } from "@/components/ui";

const tabs: { value: CoinSort; label: string; icon: typeof Crown }[] = [
  { value: "mcap", label: "Market cap", icon: Crown },
  { value: "new", label: "New", icon: Rocket },
  { value: "active", label: "Active", icon: Flame },
  { value: "near", label: "Near graduation", icon: Clock },
  { value: "graduated", label: "Graduated", icon: GraduationCap },
];

const VIEW_KEY = "cook-view";
const PAGE = 20;

export function CoinExplorer() {
  const [sort, setSort] = useState<CoinSort>("mcap");
  const [quote, setQuote] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "grid") setView(v);
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  // a new tab, pair or search starts from the top of the list again
  useEffect(() => setShown(PAGE), [sort, quote, debounced]);

  const changeView = (v: "list" | "grid") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const { data: quotes } = useQuotes();
  const { data, isLoading, isError } = useCoins({
    sort,
    quote: quote === "all" ? undefined : quote,
    search: debounced || undefined,
    limit: 100,
  });

  return (
    <section id="coins" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Explore"
        title="Every coin, every pair"
        sub="Coins pair with SOL, stablecoins or 120+ tokenized stocks. Every one pays the same 3% fee, and it flows back to holders."
      />

      <div className="mt-7 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.value}
                onClick={() => setSort(t.value)}
                className={clsx(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-all",
                  sort === t.value
                    ? "border-line-strong bg-elev-2 text-fg shadow-card"
                    : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                <t.icon size={14} className={sort === t.value ? "text-accent" : ""} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 xl:w-64 xl:flex-none">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ticker, address"
              className="h-10 w-full rounded-full border border-line bg-elev pr-4 pl-10 text-sm outline-none transition-all placeholder:text-faint hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
            />
          </div>
          <select
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            aria-label="Pair"
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-elev px-3.5 text-sm outline-none hover:border-line-strong focus:border-accent sm:flex-none"
          >
            <option value="all">Any pair</option>
            {(Object.keys(quoteCategories) as QuoteCategory[]).map((cat) => {
              const list = quotes?.filter((q) => q.category === cat) ?? [];
              if (!list.length) return null;
              return (
                <optgroup key={cat} label={quoteCategories[cat]}>
                  {list.map((q) => (
                    <option key={q.address} value={q.address}>
                      {q.symbol}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <div className="hidden shrink-0 rounded-full border border-line bg-sunk/80 p-1 sm:flex">
            {(["list", "grid"] as const).map((v) => (
              <button
                key={v}
                aria-label={`${v} view`}
                onClick={() => changeView(v)}
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                  view === v ? "bg-elev-2 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg",
                )}
              >
                {v === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {isError && !data ? (
          <ErrorState />
        ) : isLoading && !data ? (
          <ListSkeleton />
        ) : !data || data.length === 0 ? (
          <EmptyState
            title={debounced ? "No coins match that search" : "No coins here yet"}
            detail={debounced ? "Try a ticker, a name or a contract address." : "Be the first: launch a coin in under a minute."}
            action={!debounced && <ButtonLink href="/launch">Launch a coin</ButtonLink>}
          />
        ) : (
          <>
            {/* phones get a compact card list; the table and grid need more width */}
            <MobileList coins={data.slice(0, shown)} />
            <div className="hidden sm:block">{view === "grid" ? <Grid coins={data.slice(0, shown)} /> : <Table coins={data.slice(0, shown)} />}</div>
            {data.length > shown && (
              <div className="mt-4 flex flex-col items-center gap-1.5">
                <Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </Button>
                <span className="num text-[11px] text-faint">
                  {shown} of {data.length} coins
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function TokenCell({ c, size = 40, pair = false }: { c: Coin; size?: number; pair?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CoinAvatar src={c.image} symbol={c.symbol} seed={c.address} size={size} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold tracking-tight">{c.name}</span>
          {c.isMain && <Badge tone="accent">Platform</Badge>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted">
          <span className="font-medium text-fg/75">${c.symbol}</span>
          {pair && <QuoteChip symbol={c.quote.symbol} logo={c.quote.logo} />}
          <span className="text-faint">·</span>
          <span className="num">{age(c.createdAt)}</span>
          <span className="hidden text-faint xl:inline">·</span>
          <span className="num hidden truncate xl:inline">{short(c.creator, 3)}</span>
        </div>
      </div>
    </div>
  );
}

function Table({ coins }: { coins: Coin[] }) {
  return (
    <div className="surface overflow-hidden rounded-[22px]">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line text-[11px] tracking-wider text-faint uppercase">
            <th className="w-10 py-3.5 pl-5 font-medium">#</th>
            <th className="px-3 py-3.5 font-medium">Coin</th>
            <th className="hidden px-3 py-3.5 font-medium lg:table-cell">24h</th>
            <th className="px-3 py-3.5 text-right font-medium">Market cap</th>
            <th className="hidden px-3 py-3.5 text-right font-medium md:table-cell">Volume 24h</th>
            <th className="px-3 py-3.5 text-right font-medium">Fees returned</th>
            <th className="hidden px-3 py-3.5 text-right font-medium xl:table-cell">Holders</th>
            <th className="hidden w-40 py-3.5 pr-5 pl-3 font-medium md:table-cell">Graduation</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((c, i) => (
            <tr key={c.address} className="group relative border-b border-line transition-colors last:border-0 hover:bg-elev-2">
              <td className="num py-3.5 pl-5 text-xs text-faint">{i + 1}</td>
              <td className="max-w-[320px] px-3 py-3.5">
                <Link href={`/token/${c.address}`} className="block after:absolute after:inset-0">
                  <TokenCell c={c} pair />
                </Link>
              </td>
              <td className="hidden px-3 py-3.5 lg:table-cell">
                <Sparkline data={c.spark} width={96} height={32} />
              </td>
              <td className="px-3 py-3.5 text-right">
                <div className="num text-sm font-medium">{usd(c.marketCapUsd)}</div>
                <Change value={c.change24h} className="text-xs" />
              </td>
              <td className="hidden px-3 py-3.5 text-right md:table-cell">
                <div className="num text-sm">{usd(c.volume24hUsd)}</div>
                <div className="num text-xs text-faint">{c.trades24h} trades</div>
              </td>
              <td className="px-3 py-3.5 text-right">
                <div className="num text-sm">{usd(c.feesUsd)}</div>
                <div className="num text-xs text-faint">{tokens(c.feesQuote, c.quote.decimals, c.quote.symbol)}</div>
              </td>
              <td className="hidden px-3 py-3.5 text-right xl:table-cell">
                <span className="num inline-flex items-center gap-1 text-sm text-muted">
                  <Users size={12} className="text-faint" />
                  {c.holders}
                </span>
              </td>
              <td className="hidden py-3.5 pr-5 pl-3 md:table-cell">
                <GraduationBar progress={c.graduationProgress} graduated={c.graduated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileList({ coins }: { coins: Coin[] }) {
  return (
    <ul className="surface divide-y divide-line overflow-hidden rounded-[22px] sm:hidden">
      {coins.map((c) => (
        <li key={c.address}>
          <Link href={`/token/${c.address}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-elev-2">
            <CoinAvatar src={c.image} symbol={c.symbol} seed={c.address} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold tracking-tight">{c.name}</span>
                {c.isMain && <Badge tone="accent">Platform</Badge>}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <span className="font-medium text-fg/75">${c.symbol}</span>
                <QuoteChip symbol={c.quote.symbol} logo={c.quote.logo} />
              </div>
              <GraduationBar className="mt-2" progress={c.graduationProgress} graduated={c.graduated} />
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-sm font-medium">{usd(c.marketCapUsd)}</div>
              <Change value={c.change24h} className="text-xs" />
              <Sparkline data={c.spark} width={64} height={22} className="mt-1 ml-auto block" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Grid({ coins }: { coins: Coin[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {coins.map((c) => (
        <Link key={c.address} href={`/token/${c.address}`} className="surface surface-hover group rounded-[22px] p-5">
          <div className="flex items-start justify-between gap-3">
            <TokenCell c={c} size={44} />
            <QuoteChip symbol={c.quote.symbol} logo={c.quote.logo} />
          </div>
          {c.description && <p className="mt-3.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-relaxed text-muted">{c.description}</p>}
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-muted">Market cap</div>
              <div className="num mt-0.5 text-xl font-medium">{usd(c.marketCapUsd)}</div>
              <Change value={c.change24h} pill className="mt-1 text-xs" />
            </div>
            <Sparkline data={c.spark} width={128} height={48} strokeWidth={2} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
            <div>
              <div className="text-muted">Fees returned</div>
              <div className="num mt-0.5 text-sm text-fg">{usd(c.feesUsd)}</div>
            </div>
            <div className="text-right">
              <div className="text-muted">Holders</div>
              <div className="num mt-0.5 text-sm text-fg">{c.holders}</div>
            </div>
          </div>
          <GraduationBar className="mt-4" progress={c.graduationProgress} graduated={c.graduated} />
        </Link>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="surface space-y-1 rounded-[22px] p-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2.5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="hidden h-8 w-28 sm:block" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="hidden h-2 w-36 md:block" />
        </div>
      ))}
    </div>
  );
}
