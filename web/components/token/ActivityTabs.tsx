"use client";

import clsx from "clsx";
import { Flame } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Coin, CoinDetail } from "@cook/shared";
import { useHolders, useTrades } from "@/lib/data";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { age, pct, price, short, tokens, units, usd } from "@/lib/format";
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
function BuybackSummary({ coin, shown, onToggle }: { coin: CoinDetail; shown: boolean; onToggle: () => void }) {
  const b = coin.buybacks24h;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:px-5">
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
      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted select-none">
        <input type="checkbox" checked={shown} onChange={onToggle} className="h-3.5 w-3.5 accent-[var(--accent)]" />
        Show buybacks
      </label>
    </div>
  );
}

function Trades({ coin }: { coin: CoinDetail }) {
  const [showBuybacks, setShowBuybacks] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const { data, isLoading, isError, isFetching } = useTrades(coin.address, limit, showBuybacks);
  const q = coin.quote;
  const summary = <BuybackSummary coin={coin} shown={showBuybacks} onToggle={() => setShowBuybacks((v) => !v)} />;
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState className="m-5" />;
  if (!data?.length)
    return (
      <>
        {summary}
        <EmptyState className="m-5" title="No trades yet" detail="The first buy shows up here within a second." />
      </>
    );
  return (
    <div>
      {summary}
      <div className="scroll-x">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-y border-line">
              <th className={clsx(th, "pl-5")}>Age</th>
              <th className={clsx(th, "px-3")}>Type</th>
              <th className={clsx(th, "px-3 text-right")}>Value</th>
              <th className={clsx(th, "px-3 text-right")}>{coin.symbol}</th>
              <th className={clsx(th, "px-3 text-right")}>Price</th>
              <th className={clsx(th, "pr-5 text-right")}>Trader</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => {
              const tone = t.kind === "buyback" ? "text-accent" : t.isBuy ? "text-up" : "text-down";
              const valueUsd = units(t.quoteAmount, q.decimals) * q.usdPerUnit;
              return (
                <tr key={t.id} className="border-b border-line transition-colors last:border-0 hover:bg-elev-2">
                  <td className="num py-3 pl-5 text-xs text-muted">
                    <MaybeLink href={explorerTx(t.tx)} className="hover:text-fg">
                      {age(t.t)}
                    </MaybeLink>
                  </td>
                  <td className="px-3 py-3">
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
                  <td className={clsx("num px-3 py-3 text-right", tone)}>
                    {q.usdPerUnit > 0 ? usd(valueUsd) : tokens(t.quoteAmount, q.decimals)}
                    <div className="text-[11px] text-faint">{tokens(t.quoteAmount, q.decimals, q.symbol)}</div>
                  </td>
                  <td className="num px-3 py-3 text-right">{tokens(t.tokenAmount, coin.decimals)}</td>
                  <td className="num px-3 py-3 text-right text-muted">
                    {q.usdPerUnit > 0 ? (
                      <>
                        $<TinyPrice value={t.price * q.usdPerUnit} />
                      </>
                    ) : (
                      price(t.price)
                    )}
                  </td>
                  <td className="num py-3 pr-5 text-right text-xs">
                    <MaybeLink href={explorerAddress(t.trader)} className="text-muted hover:text-fg">
                      {short(t.trader)}
                    </MaybeLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
    <div className="scroll-x">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-line">
            <th className={clsx(th, "w-10 pl-5")}>#</th>
            <th className={clsx(th, "px-3")}>Holder</th>
            <th className={clsx(th, "px-3")}>Share</th>
            <th className={clsx(th, "px-3 text-right")}>Avg entry</th>
            <th className={clsx(th, "px-3 text-right")}>vs. price</th>
            <th className={clsx(th, "pr-5 text-right")}>Airdrop</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => {
            const underwater = h.avgEntry > 0 && h.avgEntry > coin.price;
            const delta = h.avgEntry > 0 ? ((coin.price - h.avgEntry) / h.avgEntry) * 100 : null;
            return (
              <tr key={h.address} className="border-b border-line transition-colors last:border-0 hover:bg-elev-2">
                <td className="num py-3 pl-5 text-xs text-faint">{i + 1}</td>
                <td className="num px-3 py-3 text-xs">
                  <MaybeLink href={explorerAddress(h.address)} className="hover:text-accent">
                    {short(h.address)}
                  </MaybeLink>
                  {h.address === coin.creator && (
                    <Badge tone="outline" className="ml-2">
                      creator
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-sunk">
                      <div className="spectrum h-full rounded-full" style={{ width: `${(h.share / top) * 100}%` }} />
                    </div>
                    <span className="num text-xs">{pct(h.share * 100, { digits: 2 })}</span>
                  </div>
                </td>
                <td className="num px-3 py-3 text-right text-muted">
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
                <td className="px-3 py-3 text-right">
                  {delta === null ? (
                    <span className="text-faint">—</span>
                  ) : underwater ? (
                    <Badge tone="down">{pct(delta, { digits: 0 })}</Badge>
                  ) : (
                    <Badge tone="up">{pct(delta, { sign: true, digits: 0 })}</Badge>
                  )}
                </td>
                <td className="py-3 pr-5 text-right">
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
