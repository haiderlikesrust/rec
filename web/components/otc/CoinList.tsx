"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { brand, isSolanaAddress, otcPolicy, type OtcCoin, type Position } from "@gantry/shared";
import { short, tokens, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Button, DataTable, EmptyState, ErrorState, Input, Panel, PanelBody, PanelHeader, Skeleton, Td, Th } from "@/components/ui";

/** rows of the wallet's own coins shown before "show all" */
const OWN = 5;
/** rows of the full list shown before "show all", and the length from which it gets a search box */
const SHORT = 8;
const twapMinutes = otcPolicy.twapSeconds / 60;

/** What the reserve pays for one coin right now, or why it has no price yet. */
function ReservePrice({ row, solUsd }: { row?: OtcCoin; solUsd: number }) {
  if (!row) return <span className="text-ink-3">—</span>;
  if (!row.twapReady)
    return (
      <span className="text-ink-3" title={`The reserve prices a coin once it has ${twapMinutes} minutes of price history`}>
        Not yet
      </span>
    );
  return <>{usd(row.sellPriceSol * solUsd)}</>;
}

function CoinName({ image, symbol, address, name, sub }: { image?: string; symbol: string; address: string; name: string; sub: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <CoinAvatar src={image} symbol={symbol} seed={address} size={36} />
      <span className="min-w-0 max-sm:flex-1">
        <span className="block truncate font-medium text-ink sm:max-w-[16rem]">{name}</span>
        <span className="block truncate text-[13px] text-ink-3">{sub}</span>
      </span>
    </span>
  );
}

/** The connected wallet's coins, most valuable first: what it holds, what the reserve pays, and a way into the sell box. */
export function YourCoins({
  held,
  priceOf,
  solUsd,
  selected,
  onSelect,
}: {
  held: Position[];
  /** the reserve's row for a coin, by mint */
  priceOf: Map<string, OtcCoin>;
  solUsd: number;
  selected?: string;
  onSelect: (coin: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? held : held.slice(0, OWN);
  return (
    <Panel as="section">
      <PanelHeader as="h2" label="Your coins" />
      <DataTable caption="Coins in your wallet">
        <thead>
          <tr>
            <Th>Coin</Th>
            <Th num className="hidden sm:table-cell">
              You hold
            </Th>
            <Th num className="hidden sm:table-cell">
              Reserve price
            </Th>
            <Th>
              <span className="sr-only">Sell</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => {
            const c = p.coin;
            const amount = tokens(p.balance, c.decimals);
            const row = priceOf.get(c.address);
            const active = selected === c.address;
            return (
              <tr key={c.address} className={clsx(active && "bg-white/5")}>
                <Td className="py-2.5 max-sm:w-full max-sm:max-w-0">
                  <CoinName
                    image={c.image}
                    symbol={c.symbol}
                    address={c.address}
                    name={c.name}
                    sub={
                      <>
                        <span className="num sm:hidden">{row?.twapReady ? `${amount} · ${usd(row.sellPriceSol * solUsd)} each` : `${amount} ${c.symbol}`}</span>
                        <span className="hidden sm:inline">{c.symbol}</span>
                      </>
                    }
                  />
                </Td>
                <Td num className="hidden text-ink-2 sm:table-cell">
                  {amount}
                </Td>
                <Td num className="hidden sm:table-cell">
                  <ReservePrice row={row} solUsd={solUsd} />
                </Td>
                <Td align="right">
                  <Button variant="secondary" size="sm" aria-pressed={active} aria-label={`Sell ${c.symbol} to the reserve`} onClick={() => onSelect(c.address)}>
                    Sell
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {held.length > OWN && (
        <div className="px-[calc(var(--card-pad)-12px)] pb-3">
          <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? "Show fewer" : `Show all ${held.length}`}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/** Every coin the reserve buys, biggest limit first. Picking a row opens it in the sell box. */
export function AllCoins({
  rows,
  dailyCapSol,
  solUsd,
  selected,
  onSelect,
  loading,
  failed,
}: {
  rows: OtcCoin[];
  /** the most one wallet can sell of one coin in a day */
  dailyCapSol?: number;
  solUsd: number;
  selected?: string;
  onSelect: (coin: string) => void;
  loading: boolean;
  failed: boolean;
}) {
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const long = rows.length > SHORT;
  const raw = text.trim();
  const q = raw.toLowerCase();
  const found = q ? rows.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.coin.toLowerCase() === q) : rows;
  const shown = q || all ? found : found.slice(0, SHORT);
  // any mint can be opened, listed or not: the sell box says whether the reserve buys it
  const pasted = isSolanaAddress(raw) && !rows.some((r) => r.coin === raw);

  return (
    <Panel as="section">
      <PanelHeader as="h2" label="All coins" />
      {long && (
        <div className="px-[var(--card-pad)] pb-2">
          <Input
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by name or ticker"
            aria-label="Search coins by name or ticker, or paste a coin address"
          />
        </div>
      )}
      {pasted && (
        <div className="px-[calc(var(--card-pad)-12px)] pt-2">
          <Button variant="ghost" size="sm" onClick={() => onSelect(raw)}>
            Open <span className="font-mono">{short(raw, 6)}</span> <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      )}

      {failed ? (
        <PanelBody>
          <ErrorState title="The list didn't load" detail={`${brand.name} isn't answering right now. It retries on its own.`} />
        </PanelBody>
      ) : loading ? (
        <PanelBody>
          <Skeleton className="h-72" />
        </PanelBody>
      ) : rows.length === 0 ? (
        <PanelBody>
          <EmptyState title="Nothing to sell yet" detail="A coin shows up here once its trading fees have reached the reserve." />
        </PanelBody>
      ) : shown.length === 0 ? (
        !pasted && <p className="px-[var(--card-pad)] py-6 text-[15px] text-ink-2">No coin matches that.</p>
      ) : (
        <>
          <DataTable caption="Coins the reserve buys">
            <thead>
              <tr>
                <Th>Coin</Th>
                <Th num>Reserve price</Th>
                {otcPolicy.limited && (
                  <Th num className="hidden sm:table-cell" title="The most one wallet can sell of this coin today">
                    Limit today
                  </Th>
                )}
                <Th className="hidden w-10 sm:table-cell">
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const active = selected === r.coin;
                const limitSol = dailyCapSol === undefined ? r.sellLimitSol : Math.min(r.sellLimitSol, dailyCapSol);
                return (
                  <tr key={r.coin} onClick={() => onSelect(r.coin)} className={clsx("cursor-pointer", active && "bg-white/5")}>
                    <Td className="py-2.5 max-sm:w-full max-sm:max-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(r.coin);
                        }}
                        aria-pressed={active}
                        aria-label={`Sell ${r.symbol} to the reserve`}
                        className="block w-full min-w-0"
                      >
                        <CoinName image={r.image} symbol={r.symbol} address={r.coin} name={r.name} sub={r.symbol} />
                      </button>
                    </Td>
                    <Td num className="max-sm:py-2.5">
                      <ReservePrice row={r} solUsd={solUsd} />
                      {otcPolicy.limited && <span className="block text-[13px] text-ink-3 sm:hidden">limit {usd(limitSol * solUsd)}</span>}
                    </Td>
                    {otcPolicy.limited && (
                      <Td num className={clsx("hidden sm:table-cell", limitSol > 0 ? "text-ink-2" : "text-ink-3")}>
                        {usd(limitSol * solUsd)}
                      </Td>
                    )}
                    <Td align="right" className="hidden sm:table-cell">
                      <ChevronRight size={16} aria-hidden className={clsx("inline", active ? "text-ink" : "text-ink-3")} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {long && !q && (
            <div className="px-[calc(var(--card-pad)-12px)] pb-3">
              <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? "Show fewer" : `Show all ${rows.length} coins`}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
