"use client";

import clsx from "clsx";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { GRADUATION_MCAP_USD, START_MCAP_USD, brand, type Coin } from "@gantry/shared";
import { useCoins, useStats, useTrending } from "@/lib/data";
import { CoinAvatar } from "@/components/CoinAvatar";
import { GraduationBar } from "@/components/GraduationBar";
import { Badge, Button, ButtonLink, Change, EmptyState, ErrorState, Input, Panel, SectionHeading, Skeleton, Tabs } from "@/components/ui";
import { shortUsd } from "./money";

type Tab = "trending" | "new" | "graduated" | "protected";

/** `short` is the label on a phone, where the four have to share one row. */
const tabs: { value: Tab; label: string; short?: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
  { value: "graduated", label: "Graduated" },
  { value: "protected", label: "Most protected", short: "Protected" },
];
const tabOptions = tabs.map((t) => ({
  value: t.value,
  label: t.short ? (
    <>
      <span className="sm:hidden">{t.short}</span>
      <span className="max-sm:hidden">{t.label}</span>
    </>
  ) : (
    t.label
  ),
}));

/** Rows shown at first and added by each "Show more"; the most the page asks the API for. */
const PAGE = 10;
const LIMIT = 100;

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

/** One row's columns: the coin and its numbers on a phone, with the progress on a line of its own; four across from 640px. */
const columns =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_10rem] lg:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-6";

/**
 * Every coin, as one plain list. Four tabs pick which coins: the busiest of the last 24 hours, the newest, the ones
 * that have graduated, and the ones the protection fund holds the most for (that tab shows the cover in place of
 * the day's change). Typing in the search box looks through all coins instead, whichever tab was open.
 */
export function CoinList() {
  const [tab, setTab] = useState<Tab>("trending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const searchId = useId();
  const noCoins = useStats().data?.coins === 0;

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  // a different tab or search starts again from the first rows
  useEffect(() => setShown(PAGE), [tab, query]);

  const clear = () => {
    setSearch("");
    setQuery("");
  };
  const open = (next: Tab) => {
    setTab(next);
    clear();
  };

  const empty = query ? (
    <EmptyState
      title={`No coin matches "${query}"`}
      detail="Search looks at names, tickers and full coin addresses."
      action={
        <Button variant="secondary" size="sm" onClick={clear}>
          Clear search
        </Button>
      }
    />
  ) : noCoins || tab === "new" ? (
    <EmptyState
      title="No coins yet"
      detail="The first coin to launch will be listed here."
      action={
        <ButtonLink href="/launch" variant="secondary" size="sm">
          Launch a coin
        </ButtonLink>
      }
    />
  ) : tab === "trending" ? (
    <EmptyState
      title="Nothing has traded today"
      detail="Coins appear here once they trade. Every coin is listed under New."
      action={
        <Button variant="secondary" size="sm" onClick={() => open("new")}>
          See new coins
        </Button>
      }
    />
  ) : tab === "graduated" ? (
    <EmptyState
      title="No coin has graduated yet"
      detail={`A coin graduates when its market cap reaches ${dollars(GRADUATION_MCAP_USD)} and it moves to its own Raydium pool.`}
    />
  ) : (
    <EmptyState
      title="No coin has cover yet"
      detail={`A coin's cover builds up in ${brand.shield} from the fees its own trades pay.`}
      action={
        <ButtonLink href="/shield" variant="secondary" size="sm">
          How it works
        </ButtonLink>
      }
    />
  );

  const list = { shown, onMore: () => setShown((n) => n + PAGE), empty };
  // the "Most protected" list, and not a search that happens to be open over it
  const covered = tab === "protected" && !query;

  return (
    <section aria-label="Coins" className="space-y-5">
      <SectionHeading
        title="Coins"
        sub={`Every coin starts at a ${dollars(START_MCAP_USD)} market cap and graduates to its own Raydium pool at ${dollars(GRADUATION_MCAP_USD)}.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<Tab | "search">
          aria-label="Which coins to list"
          className="min-w-0"
          value={query ? "search" : tab}
          onChange={(v) => v !== "search" && open(v)}
          options={tabOptions}
        />
        <div className="relative w-full shrink-0 sm:w-72">
          <label htmlFor={searchId} className="sr-only">
            Search all coins by name, ticker or address
          </label>
          <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            id={searchId}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ticker"
            className="pr-10 pl-10"
          />
          {search && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear the search"
              className="absolute top-0 right-0 flex h-full w-10 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {covered && (
        <p className="text-sm leading-relaxed text-ink-2">
          Cover is what {brand.shield}, the protection fund, holds right now to pay back part of a loss on each coin.{" "}
          <Link href="/shield" className="link whitespace-nowrap">
            How it works
          </Link>
        </p>
      )}

      {/* a floor on the height keeps the page from jumping when a search leaves only a row or two */}
      <div role="tabpanel" aria-label={query ? `Coins matching "${query}"` : tabs.find((t) => t.value === tab)!.label} className="min-h-80">
        {query ? (
          <Sorted sort="mcap" search={query} {...list} />
        ) : tab === "trending" ? (
          <Trending {...list} />
        ) : (
          <Sorted sort={tab} cover={covered} {...list} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- where the rows come from

/** `cover` swaps the day's change for what the protection fund holds for each coin. */
type ListProps = { shown: number; onMore: () => void; empty: ReactNode; cover?: boolean };

/** The busiest coins of the last 24 hours. */
function Trending(props: ListProps) {
  const { data, isLoading, isError } = useTrending();
  return <Rows coins={data} loading={isLoading} failed={isError} {...props} />;
}

/** One of the API's ordered lists, or a search across all coins. */
function Sorted({ sort, search, ...props }: ListProps & { sort: "mcap" | "new" | "graduated" | "protected"; search?: string }) {
  const { data, isLoading, isError, isPlaceholderData } = useCoins({ sort, search, limit: LIMIT });
  return <Rows coins={data} loading={isLoading} failed={isError} stale={isPlaceholderData} {...props} />;
}

// ---------------------------------------------------------------- the rows

function Rows({
  coins,
  loading,
  failed,
  stale,
  shown,
  onMore,
  empty,
  cover,
}: ListProps & { coins: Coin[] | undefined; loading: boolean; failed: boolean; stale?: boolean }) {
  if (!coins) {
    if (failed) return <ErrorState title="The coins didn't load" detail="This list tries again every 10 seconds." />;
    if (loading) return <RowsSkeleton />;
    return null;
  }
  if (coins.length === 0) return <>{empty}</>;

  return (
    <div aria-busy={stale || undefined} className={clsx("space-y-4 transition-opacity", stale && "opacity-60")}>
      <Panel className="p-2 sm:p-3">
        <div aria-hidden className={clsx("hidden px-3 pt-1.5 pb-2 text-[13px] text-ink-3 sm:grid", columns)}>
          <span>Coin</span>
          <span className="text-right">Market cap</span>
          <span className="text-right">{cover ? "Cover" : "24h"}</span>
          <span>Graduation</span>
        </div>
        <ul>
          {coins.slice(0, shown).map((c) => (
            <li key={c.address}>
              <CoinRow c={c} cover={cover} />
            </li>
          ))}
        </ul>
      </Panel>
      {coins.length > shown && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Avatar, name and ticker, market cap, the day's change (or, with `cover`, what the protection fund holds for the
 * coin), and how far the coin is from graduating. The whole row is the link.
 */
function CoinRow({ c, cover }: { c: Coin; cover?: boolean }) {
  return (
    <Link
      href={`/token/${c.address}`}
      className={clsx("grid items-center gap-y-2.5 rounded-lg px-3 py-3 transition-colors hover:bg-raise", columns)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CoinAvatar src={c.image} symbol={c.symbol} seed={c.address} size={40} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-medium text-ink">{c.name}</span>
            {c.isMain && (
              <Badge tone="signal" className="shrink-0">
                Official
              </Badge>
            )}
            {c.fleet && (
              <Badge tone="fleet" className="shrink-0">
                {brand.fleet}
              </Badge>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-3">
            <span className="truncate">${c.symbol}</span>
            {c.graduated && (
              <Badge tone="gain" className="shrink-0 sm:hidden">
                Graduated
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* on a phone the cap sits over the change in one cell; from 640px each has its own column */}
      <div className="text-right sm:contents">
        <div className="text-[15px] font-medium text-ink tabular-nums">
          <span className="sr-only">Market cap </span>
          {shortUsd(c.marketCapUsd)}
        </div>
        {cover ? (
          <div className="text-[13px] whitespace-nowrap text-shield tabular-nums sm:text-[15px]">
            {shortUsd(c.protectionPotUsd)}
            {/* the column head says it from 640px; a phone has no heads */}
            <span className="sm:sr-only"> cover</span>
          </div>
        ) : (
          <div className="text-[13px] sm:text-[15px]">
            <span className="sr-only">Change in 24 hours </span>
            <Change value={c.change24h} />
          </div>
        )}
      </div>

      {/* a phone gives the progress a line of its own under the name; a graduated coin wears its badge beside the ticker instead */}
      <div className={clsx("pl-[52px] sm:col-span-1 sm:pl-0", c.graduated ? "hidden sm:block" : "col-span-full")}>
        {c.graduated ? <Badge tone="gain">Graduated</Badge> : <GraduationBar progress={c.graduationProgress} graduated={false} />}
      </div>
    </Link>
  );
}

function RowsSkeleton() {
  return (
    <Panel className="p-2 sm:p-3">
      <p role="status" className="sr-only">
        Loading coins
      </p>
      <div aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="ml-auto h-3.5 w-16" />
            <Skeleton className="hidden h-3.5 w-28 sm:block" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
