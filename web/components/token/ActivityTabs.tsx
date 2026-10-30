"use client";

import clsx from "clsx";
import { ArrowUpRight, Flame } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Coin, CoinDetail } from "@cook/shared";
import { useHolders, useTrades } from "@/lib/data";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { age, pct, price, short, tokens, units, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { TinyPrice } from "./TinyPrice";
import { Badge, Button, EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui";

const th = "py-3 font-medium text-[11px] tracking-wider text-faint uppercase";

function MaybeLink({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

export function ActivityTabs({ coin }: { coin: CoinDetail }) {
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  return (
    <section className="surface overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "trades", label: "Trades" },
            { value: "holders", label: `Holders${coin.holders ? ` · ${coin.holders}` : ""}` },
          ]}
        />
        <span className="flex items-center gap-2 text-[11px] text-faint">
          <span className="live-dot" /> live
        </span>
      </div>
      <div className="mt-3">{tab === "trades" ? <Trades coin={coin} /> : <Holders coin={coin} />}</div>
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-2.5 p-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

const PAGE = 20;

/** Burns run every few seconds, so the feed shows people's trades and sums the buybacks up in one line. */
function BuybackSummary({ coin }: { coin: CoinDetail }) {
  const b = coin.buybacks24h;
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Flame size={13} />
      </span>
      {b && b.count > 0 ? (
        <span className="min-w-0">
          Bought back &amp; burned <span className="num text-fg">{tokens(b.tokenAmount, coin.decimals)} ${coin.symbol}</span>
          {b.usd > 0 && <span className="num"> ({usd(b.usd)})</span>} in the last 24h · {b.count} buybacks
        </span>
      ) : (
        <span>No buybacks in the last 24h yet. They start as soon as this coin pays fees.</span>
      )}
    </span>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-[var(--accent)]" />
      {children}
    </label>
  );
}

/** A trade worth at least 1% of the coin's market cap (and $250) is called out in the feed. */
const isLarge = (valueUsd: number, coin: Coin) => valueUsd >= Math.max(250, coin.marketCapUsd * 0.01);

function Trades({ coin }: { coin: CoinDetail }) {
  const wallet = useAddress();
  const [showBuybacks, setShowBuybacks] = useState(false);
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, isError, isFetching } = useTrades(coin.address, limit, showBuybacks, mine && wallet ? wallet : undefined);
  const q = coin.quote;
  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:px-5">
      <BuybackSummary coin={coin} />
      <div className="flex items-center gap-4">
        {wallet && (
          <Toggle checked={mine} onChange={() => setMine((v) => !v)}>
            Only mine
          </Toggle>
        )}
        <Toggle checked={showBuybacks} onChange={() => setShowBuybacks((v) => !v)}>
          Show buybacks
        </Toggle>
      </div>
    </div>
  );
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState className="m-5" />;
  if (!data?.length)
    return (
      <>
        {controls}
        <EmptyState
          className="m-5"
          title={mine ? "You haven't traded this coin" : "No trades yet"}
          detail={mine ? "Your buys and sells show up here." : "The first buy shows up here within a second."}
        />
      </>
    );
  return (
    <div>
      {controls}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-y border-line">
            <th className={clsx(th, "pl-4 sm:pl-5")}>Type</th>
            <th className={clsx(th, "px-3")}>Trader</th>
            <th className={clsx(th, "px-3 text-right")}>Value</th>
            <th className={clsx(th, "hidden px-3 text-right sm:table-cell")}>{coin.symbol}</th>
            <th className={clsx(th, "hidden px-3 text-right sm:table-cell")}>Price</th>
            <th className={clsx(th, "pr-4 text-right sm:pr-5")}>Age</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            const tone = t.kind === "buyback" ? "text-accent" : t.isBuy ? "text-up" : "text-down";
            const valueUsd = units(t.quoteAmount, q.decimals) * q.usdPerUnit;
            const large = t.kind === "trade" && q.usdPerUnit > 0 && isLarge(valueUsd, coin);
            const you = !!wallet && t.trader === wallet;
            return (
              <tr
                key={t.id}
                className="border-b border-line transition-colors last:border-0 hover:bg-elev-2"
                style={large ? { background: `color-mix(in srgb, ${t.isBuy ? "var(--up)" : "var(--down)"} 7%, transparent)` } : undefined}
              >
                <td className="py-2 pl-4 sm:pl-5">
                  {t.kind === "buyback" ? (
                    <Badge tone="accent">Buyback</Badge>
                  ) : t.kind === "otc" ? (
                    <Badge tone="outline">OTC {t.isBuy ? "buy" : "sell"}</Badge>
                  ) : t.isBuy ? (
                    <Badge tone="up">Buy</Badge>
                  ) : (
                    <Badge tone="down">Sell</Badge>
                  )}
                </td>
                <td className="num px-3 py-2 text-xs whitespace-nowrap">
                  <MaybeLink href={explorerAddress(t.trader)} className="text-muted hover:text-fg">
                    {short(t.trader)}
                  </MaybeLink>
                  {you && (
                    <Badge tone="accent" className="ml-1.5">
                      you
                    </Badge>
                  )}
                </td>
                <td
                  className={clsx("num px-3 py-2 text-right whitespace-nowrap", tone, large && "font-semibold")}
                  title={tokens(t.quoteAmount, q.decimals, q.symbol)}
                >
                  {large && <span className="mr-1 text-[10px] font-medium tracking-wider uppercase opacity-80">Large</span>}
                  {q.usdPerUnit > 0 ? usd(valueUsd) : tokens(t.quoteAmount, q.decimals, q.symbol)}
                </td>
                <td className="num hidden px-3 py-2 text-right sm:table-cell">{tokens(t.tokenAmount, coin.decimals)}</td>
                <td className="num hidden px-3 py-2 text-right text-muted sm:table-cell">
                  {q.usdPerUnit > 0 ? (
                    <>
                      $<TinyPrice value={t.price * q.usdPerUnit} />
                    </>
                  ) : (
                    price(t.price)
                  )}
                </td>
                <td className="num py-2 pr-4 text-right text-xs whitespace-nowrap sm:pr-5">
                  <MaybeLink href={explorerTx(t.tx)} className="inline-flex items-center gap-0.5 text-muted hover:text-fg">
                    {age(t.t)} <ArrowUpRight size={11} className="text-faint" />
                  </MaybeLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.length >= limit && limit < 200 && (
        <div className="border-t border-line p-3 text-center">
          <Button variant="ghost" size="sm" disabled={isFetching} onClick={() => setLimit((l) => Math.min(200, l + PAGE))}>
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Holders({ coin }: { coin: Coin }) {
  const { data, isLoading, isError } = useHolders(coin.address);
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState className="m-5" />;
  if (!data?.length) return <EmptyState className="m-5" title="No holders yet" />;
  const top = Math.max(...data.map((h) => h.share), 0.0001);
  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-y border-line">
            <th className={clsx(th, "w-10 pl-4 sm:pl-5")}>#</th>
            <th className={clsx(th, "px-3")}>Holder</th>
            <th className={clsx(th, "px-3")}>Share</th>
            <th className={clsx(th, "hidden px-3 text-right sm:table-cell")}>Avg entry</th>
            <th className={clsx(th, "px-3 text-right")}>vs. price</th>
            <th className={clsx(th, "hidden pr-5 text-right sm:table-cell")}>Airdrop</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => {
            const underwater = h.avgEntry > 0 && h.avgEntry > coin.price;
            const delta = h.avgEntry > 0 ? ((coin.price - h.avgEntry) / h.avgEntry) * 100 : null;
            return (
              <tr key={h.address} className="border-b border-line transition-colors last:border-0 hover:bg-elev-2">
                <td className="num py-2.5 pl-4 text-xs text-faint sm:pl-5">{i + 1}</td>
                <td className="num px-3 py-2.5 text-xs whitespace-nowrap">
                  <MaybeLink href={explorerAddress(h.address)} className="hover:text-accent">
                    {short(h.address)}
                  </MaybeLink>
                  {h.address === coin.creator && (
                    <Badge tone="outline" className="ml-2">
                      creator
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-sunk sm:block">
                      <div className="spectrum h-full rounded-full" style={{ width: `${(h.share / top) * 100}%` }} />
                    </div>
                    <span className="num text-xs">{pct(h.share * 100, { digits: 2 })}</span>
                  </div>
                </td>
                <td className="num hidden px-3 py-2.5 text-right text-muted sm:table-cell">
                  {h.avgEntry <= 0 ? (
                    "transfer"
                  ) : coin.quote.usdPerUnit > 0 ? (
                    <>
                      $<TinyPrice value={h.avgEntry * coin.quote.usdPerUnit} />
                    </>
                  ) : (
                    price(h.avgEntry)
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {delta === null ? (
                    <span className="text-faint">—</span>
                  ) : underwater ? (
                    <Badge tone="down">{pct(delta, { digits: 0 })}</Badge>
                  ) : (
                    <Badge tone="up">{pct(delta, { sign: true, digits: 0 })}</Badge>
                  )}
                </td>
                <td className="hidden py-2.5 pr-5 text-right sm:table-cell">
                  {h.airdropEligible ? (
                    <span
                      className="num inline-flex rounded-full px-2 py-0.5 text-[11px]"
                      style={{ color: "var(--b-airdrop)", background: "color-mix(in srgb, var(--b-airdrop) 12%, transparent)" }}
                    >
                      {pct(h.airdropWeight * 100, { digits: 1 })} of next
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
