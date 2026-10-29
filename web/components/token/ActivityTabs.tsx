"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import type { Coin } from "@cook/shared";
import { useHolders, useTrades } from "@/lib/data";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { age, pct, price, short, tokens } from "@/lib/format";
import { Badge, EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui";

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

export function ActivityTabs({ coin }: { coin: Coin }) {
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

function Trades({ coin }: { coin: Coin }) {
  const { data, isLoading, isError } = useTrades(coin.address);
  const q = coin.quote;
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState className="m-5" />;
  if (!data?.length) return <EmptyState className="m-5" title="No trades yet" detail="The first buy shows up here within a second." />;
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-y border-line">
            <th className={clsx(th, "pl-5")}>Age</th>
            <th className={clsx(th, "px-3")}>Type</th>
            <th className={clsx(th, "px-3 text-right")}>{q.symbol}</th>
            <th className={clsx(th, "px-3 text-right")}>{coin.symbol}</th>
            <th className={clsx(th, "px-3 text-right")}>Price</th>
            <th className={clsx(th, "pr-5 text-right")}>Trader</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            const tone = t.kind === "buyback" ? "text-accent" : t.isBuy ? "text-up" : "text-down";
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
                  ) : t.isBuy ? (
                    <Badge tone="up">Buy</Badge>
                  ) : (
                    <Badge tone="down">Sell</Badge>
                  )}
                </td>
                <td className={clsx("num px-3 py-3 text-right", tone)}>{tokens(t.quoteAmount, q.decimals)}</td>
                <td className="num px-3 py-3 text-right">{tokens(t.tokenAmount, 18)}</td>
                <td className="num px-3 py-3 text-right text-muted">{price(t.price)}</td>
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
                  {h.address.toLowerCase() === coin.creator.toLowerCase() && (
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
                <td className="num px-3 py-3 text-right text-muted">{h.avgEntry > 0 ? price(h.avgEntry) : "transfer"}</td>
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
