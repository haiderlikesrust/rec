"use client";

import clsx from "clsx";
import { Check, ChevronDown, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { QuoteAsset } from "@gantry/shared";
import { bps, usd } from "@/lib/format";
import { groupOf, isMainPair, mainPairs, transferFeeBps } from "@/lib/pairs";
import { shownPrice } from "@/lib/quoteUnits";
import { QuoteLogo } from "@/components/QuoteChip";
import { Button, Input, Tabs } from "@/components/ui";

/** Why a pair can't take a launch right now, in the API's own sentence. */
const whyNot = (q: QuoteAsset) => q.unavailableReason || `${q.symbol} can't take a launch right now.`;

const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** A pair token's price: always two decimals from a dollar up, so a column of them lines up. */
const price = (n: number) => (n >= 1 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : usd(n));

const tile = "flex min-w-0 items-center justify-center rounded-md border font-medium transition-colors";
/** A main pair's tile: the logo over the symbol on a phone, beside it from 640px. */
const mainTile = "h-14 flex-1 basis-0 flex-col gap-1 px-1 text-[13px] sm:h-11 sm:flex-row sm:gap-2 sm:px-2.5 sm:text-sm";
/** The tile that opens the browser: a row of its own on a phone, the last and widest tile of the row from 640px. */
const browseTile = "h-11 basis-full gap-2 px-3 text-sm sm:flex-[2] sm:basis-0";
const tileLook = (on: boolean, off = false) =>
  on
    ? "border-signal bg-signal-tint text-ink"
    : off
      ? "cursor-not-allowed border-transparent bg-raise text-ink-3 opacity-50"
      : "border-transparent bg-raise text-ink-2 hover:text-ink";

/**
 * The pair choice: a tile for SOL and each main stablecoin, and one more tile, "More pairs", that opens a browser of
 * every pair there is. A pair picked there takes that tile's place, with "Change" to pick another. The lines under
 * the tiles say what the chosen pair means: what the coin trades against, who issues the token when a third party
 * does, and the fee that issuer takes on transfers when it takes one. A main pair that can't take a launch right now
 * stays visible, dimmed, with the reason under the tiles.
 */
export function PairPicker({
  quotes,
  value,
  onChange,
  tradeFee,
  "aria-label": ariaLabel,
}: {
  quotes: QuoteAsset[];
  value?: QuoteAsset;
  onChange: (q: QuoteAsset) => void;
  /** the launchpad's own fee on a trade, as text ("3%"), named beside a token's transfer fee */
  tradeFee?: string;
  "aria-label": string;
}) {
  const helpId = useId();
  const [browsing, setBrowsing] = useState(false);

  const main = useMemo(() => mainPairs(quotes), [quotes]);
  const browsable = quotes.length > main.length;
  const picked = value && !main.some((q) => q.address === value.address) ? value : undefined;
  const paused = main.filter((q) => !q.available);
  const transferFee = value ? transferFeeBps(value) : 0;

  return (
    <div>
      <div role="group" aria-label={ariaLabel} aria-describedby={helpId} className="flex flex-wrap gap-2">
        {main.map((q) => {
          const on = q.address === value?.address;
          const off = !q.available;
          return (
            <button
              key={q.address}
              type="button"
              aria-pressed={on}
              aria-disabled={off || undefined}
              title={off ? whyNot(q) : q.name}
              onClick={() => !off && onChange(q)}
              className={clsx(tile, mainTile, tileLook(on, off))}
            >
              <QuoteLogo symbol={q.symbol} logo={q.logo} size={18} />
              <span className="max-w-full truncate">{q.symbol}</span>
            </button>
          );
        })}
        {browsable && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={picked ? `Paired with ${picked.symbol} (${picked.name}). Change` : `More pairs: browse all ${quotes.length}`}
            onClick={() => setBrowsing(true)}
            className={clsx(tile, browseTile, tileLook(!!picked))}
          >
            {picked ? (
              <>
                <QuoteLogo symbol={picked.symbol} logo={picked.logo} size={18} />
                <span className="truncate">{picked.symbol}</span>
                <span className="shrink-0 pl-1 text-[13px] font-normal text-ink-2 underline decoration-rule-strong underline-offset-4">Change</span>
              </>
            ) : (
              <>
                <span className="truncate">More pairs</span>
                <span className="num text-[13px] font-normal text-ink-3">{quotes.length}</span>
                <ChevronDown size={16} className="shrink-0 text-ink-3" aria-hidden />
              </>
            )}
          </button>
        )}
      </div>

      <div id={helpId} className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-3">
        {picked ? (
          <p>
            Your coin is priced and traded against {picked.symbol} ({picked.name}){picked.category === "stock" && ", a stock token"}: people
            buy and sell it for {picked.symbol}, not SOL. Its market caps are still {dollars(picked.startMcapUsd)} at launch and{" "}
            {dollars(picked.graduationMcapUsd)} at graduation, in dollars.
          </p>
        ) : (
          <p>The currency your coin is priced and traded in.</p>
        )}
        {value?.issuer && (
          <p className="text-ink-2">
            {value.symbol} is issued by a third party, {value.issuer}, which can freeze or pause it. Its own terms and regional restrictions
            apply.
          </p>
        )}
        {value && transferFee > 0 && (
          <p className="text-ink-2">
            This token&apos;s issuer charges a {bps(transferFee)} fee on every transfer{tradeFee && `, on top of the ${tradeFee} trading fee`}.
          </p>
        )}
        {paused.map((q) => (
          <p key={q.address}>{whyNot(q)}</p>
        ))}
      </div>

      {browsing && <PairBrowser quotes={quotes} value={value} onPick={onChange} onClose={() => setBrowsing(false)} />}
    </div>
  );
}

const ALL = "all";
const tabOf = (group: string) => `group:${group}`;
/** Rows drawn when the browser opens or its view changes, and how many more each time the end of them comes near. */
const FIRST_ROWS = 14;
const MORE_ROWS = 40;
/** A search text this long is also looked for in mint addresses; shorter ones would match addresses at random. */
const ADDRESS_NEEDLE = 4;

/**
 * Every pair, as a modal: a sheet from the bottom on a phone, a centred dialog otherwise. Search reads tickers, names
 * and mint addresses across all groups; the tabs narrow the list to one group and count what each holds. The list
 * draws a screenful and adds rows as its end comes near, so a catalog of several hundred pairs opens at once.
 *
 * Keys: the list opens with the cursor in the search box on a computer. Down and Up move between the search box and
 * the rows, Home and End jump, Enter in the search box takes the first match, Escape closes.
 */
function PairBrowser({
  quotes,
  value,
  onPick,
  onClose,
}: {
  quotes: QuoteAsset[];
  value?: QuoteAsset;
  onPick: (q: QuoteAsset) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(ALL);
  // typing stays instant: the rows catch up with the text a moment later
  const needle = useDeferredValue(query).trim().toLowerCase();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // a phone's keyboard would cover the list, so only a mouse user starts in the search box
    if (window.matchMedia("(pointer: fine)").matches) search.current?.focus();
  }, []);

  // each pair with its group and what search reads, worked out once per catalog
  const index = useMemo(
    () => quotes.map((q) => ({ q, group: groupOf(q), text: `${q.symbol}\n${q.name}`.toLowerCase(), address: q.address.toLowerCase() })),
    [quotes],
  );
  // one tab per group, in the catalog's order. A group made up only of pairs that have a tile of their own gets none
  const groups = useMemo(() => [...new Set(index.filter((e) => !isMainPair(e.q)).map((e) => e.group))], [index]);
  const hits = useMemo(
    () => (needle ? index.filter((e) => e.text.includes(needle) || (needle.length >= ADDRESS_NEEDLE && e.address.includes(needle))) : index),
    [index, needle],
  );
  // a tab whose group left the catalog falls back to all of it
  const active = tab === ALL || groups.some((g) => tabOf(g) === tab) ? tab : ALL;
  const rows = useMemo(() => (active === ALL ? hits : hits.filter((e) => tabOf(e.group) === active)), [hits, active]);
  const tabs = [
    { value: ALL, label: "All", count: hits.length },
    ...groups.map((g) => ({ value: tabOf(g), label: g, count: hits.filter((e) => e.group === g).length })),
  ];

  // a new search or tab starts again from the top with a screenful
  const view = `${active}\n${needle}`;
  const [drawn, setDrawn] = useState({ view, rows: FIRST_ROWS });
  if (drawn.view !== view) setDrawn({ view, rows: FIRST_ROWS });
  const limit = drawn.view === view ? drawn.rows : FIRST_ROWS;
  const more = rows.length > limit;
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [view]);
  // the row of tabs scrolls sideways when the groups don't fit: keep the chosen one in sight
  useEffect(() => {
    dialog.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  useEffect(() => {
    const end = sentinel.current;
    if (!more || !end) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setDrawn((d) => (d.view === view ? { view, rows: d.rows + MORE_ROWS } : d)),
      { root: scroller.current, rootMargin: "800px 0px" },
    );
    io.observe(end);
    return () => io.disconnect();
  }, [view, limit, more]);

  const pick = useCallback(
    (q: QuoteAsset) => {
      onPick(q);
      dialog.current?.close();
    },
    [onPick],
  );
  const rowButtons = () => Array.from(scroller.current?.querySelectorAll<HTMLButtonElement>("button[data-pair]:not(:disabled)") ?? []);
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const list = rowButtons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && at === 0) return search.current?.focus();
    const to = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : at + (e.key === "ArrowDown" ? 1 : -1);
    list[Math.max(0, Math.min(list.length - 1, to))]?.focus();
  };
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      rowButtons()[0]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const first = rows.find((r) => r.q.available);
      if (query.trim() && first) pick(first.q);
    }
  };

  const typed = query.trim();
  const activeGroup = groups.find((g) => tabOf(g) === active);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="mx-auto mt-auto w-full max-w-none animate-sheet overflow-hidden rounded-t-2xl bg-panel pb-[env(safe-area-inset-bottom)] text-ink shadow-float backdrop:bg-black/70 sm:my-auto sm:max-w-[480px] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex h-[min(88dvh,42rem)] flex-col">
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="display-3">
              Choose a pair
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialog.current?.close()}
              className="-mr-1.5 flex size-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-raise hover:text-ink"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Your coin is priced and traded against the token you pick.</p>
          <Input
            ref={search}
            type="search"
            aria-label={`Search ${quotes.length} pairs by name, ticker or address`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search by name, ticker or address"
            className="mt-4"
          />
        </div>

        <Tabs aria-label="Groups of pairs" className="mt-3 px-5" value={active} onChange={setTab} options={tabs} />

        <div
          ref={scroller}
          role="group"
          aria-label={activeGroup ? `${activeGroup} pairs` : "All pairs"}
          onKeyDown={onListKey}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3"
        >
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-ink-2">
              <p>
                Nothing {activeGroup && hits.length > 0 ? `in ${activeGroup} ` : ""}matches &ldquo;{typed}&rdquo;.
              </p>
              {activeGroup && hits.length > 0 && (
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setTab(ALL)}>
                  Show {hits.length === 1 ? "the 1 match" : `all ${hits.length} matches`}
                </Button>
              )}
            </div>
          ) : (
            <ul>
              {rows.slice(0, limit).map((e) => (
                <PairRow key={e.q.address} q={e.q} group={active === ALL ? e.group : undefined} on={e.q.address === value?.address} onPick={pick} />
              ))}
            </ul>
          )}
          {more && <div ref={sentinel} aria-hidden className="h-px" />}
        </div>
      </div>
    </dialog>
  );
}

/**
 * One pair of the browser: logo, ticker, name (with its group where groups are mixed) and what one token costs. A
 * pair that can't take a launch is listed all the same, switched off, with the reason under its name. The browser
 * skips the layout and paint of rows scrolled out of view, and a row's logo loads as it comes near.
 */
const PairRow = memo(function PairRow({
  q,
  group,
  on,
  onPick,
}: {
  q: QuoteAsset;
  group?: string;
  on: boolean;
  onPick: (q: QuoteAsset) => void;
}) {
  const transferFee = transferFeeBps(q);
  return (
    <li className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]">
      <button
        type="button"
        data-pair
        disabled={!q.available}
        aria-current={on || undefined}
        onClick={() => onPick(q)}
        className={clsx(
          "focus-inset flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors disabled:cursor-not-allowed",
          on ? "bg-signal-tint" : "enabled:hover:bg-raise",
        )}
      >
        <QuoteLogo symbol={q.symbol} logo={q.logo} size={32} className={clsx(!q.available && "opacity-50")} />
        <span className="min-w-0 flex-1">
          <span className={clsx("block truncate text-sm font-medium", q.available ? "text-ink" : "text-ink-3")}>{q.symbol}</span>
          <span className="flex text-[13px] text-ink-3">
            <span className="truncate">{q.name}</span>
            {group && <span className="shrink-0 whitespace-pre"> · {group}</span>}
            {transferFee > 0 && <span className="shrink-0 whitespace-pre"> · {bps(transferFee)} transfer fee</span>}
          </span>
          {!q.available && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{whyNot(q)}</span>}
        </span>
        {on && <Check size={16} className="shrink-0 text-signal" aria-hidden />}
        <span className="num shrink-0 text-sm text-ink-2">{!q.available ? "Unavailable" : q.usdPerUnit > 0 ? price(shownPrice(q.usdPerUnit, q)) : "—"}</span>
      </button>
    </li>
  );
});
