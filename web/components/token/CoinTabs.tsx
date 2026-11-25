"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { Coin, CoinDetail } from "@gantry/shared";
import { useHolders, useTrades } from "@/lib/data";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { age, pct, short, tokens, units, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { Badge, Button, DataTable, EmptyState, ErrorState, Panel, PanelBody, Segmented, Skeleton, Tabs, Td, Th } from "@/components/ui";
import { AboutTab } from "./AboutTab";
import { FeesTab } from "./FeesTab";

type View = "trades" | "holders" | "fees" | "about";

/** Everything else about the coin, one view at a time: its trades, who holds it, where its fees went, what it is. */
export function CoinTabs({ coin, solUsd, className }: { coin: CoinDetail; solUsd: number; className?: string }) {
  const [view, setView] = useState<View>("trades");
  return (
    <Panel as="section" aria-label={`More about ${coin.symbol}`} className={className}>
      <Tabs
        aria-label={`More about ${coin.symbol}`}
        value={view}
        onChange={setView}
        options={[
          { value: "trades", label: "Trades" },
          { value: "holders", label: "Holders" },
          { value: "fees", label: "Fees" },
          { value: "about", label: "About" },
        ]}
      />
      {view === "trades" && <Trades coin={coin} />}
      {view === "holders" && <Holders coin={coin} />}
      {view === "fees" && <FeesTab coin={coin} solUsd={solUsd} />}
      {view === "about" && <AboutTab coin={coin} />}
    </Panel>
  );
}

function Loading() {
  return (
    <PanelBody className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </PanelBody>
  );
}

/** A wallet in a row: the shortened address as a link to the explorer. */
function Wallet({ address }: { address: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="font-mono text-[13px] text-ink-2 transition-colors hover:text-ink"
    >
      {short(address)}
    </a>
  );
}

/** Rows shown at first, how many more each press adds, and where the trade list stops. */
const FIRST = 10;
const MORE = 20;
const MOST = 200;

function Trades({ coin }: { coin: CoinDetail }) {
  const wallet = useAddress();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [limit, setLimit] = useState(FIRST);
  const mine = scope === "mine" && !!wallet;
  const { data, isLoading, isError, isFetching } = useTrades(coin.address, limit, mine ? wallet : undefined);
  const q = coin.quote;

  // with a wallet connected the list can be narrowed to its own trades
  const filter = wallet ? (
    <div className="flex justify-end px-[var(--card-pad)] pt-2">
      <Segmented
        size="sm"
        aria-label="Whose trades to show"
        value={mine ? "mine" : "all"}
        onChange={setScope}
        options={[
          { value: "all", label: "Everyone" },
          { value: "mine", label: "Mine" },
        ]}
      />
    </div>
  ) : null;

  if (isLoading) return <Loading />;
  if (isError) return <ErrorState title="The trades did not load" />;
  if (!data?.length)
    return (
      <>
        {filter}
        <EmptyState
          title={mine ? "No trades from your wallet" : "No trades yet"}
          detail={mine ? `Your buys and sells of ${coin.symbol} show up here.` : "The first buy shows up here a moment after it confirms."}
        />
      </>
    );

  return (
    <>
      {filter}
      <DataTable dense caption={`Latest trades of ${coin.symbol}, newest first`}>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Type</Th>
            <Th num>Value</Th>
            <Th num className="hidden sm:table-cell">
              Amount
            </Th>
            <Th align="right" className="hidden sm:table-cell">
              Wallet
            </Th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            const valueUsd = units(t.quoteAmount, q.decimals) * q.usdPerUnit;
            const you = !!wallet && t.trader === wallet;
            return (
              <tr key={t.id}>
                <Td>
                  <a
                    href={explorerTx(t.tx)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${age(t.t)} ago, open the transaction on Solscan`}
                    className="num inline-flex items-center gap-1 text-ink-2 transition-colors hover:text-ink"
                  >
                    {age(t.t)} ago <ArrowUpRight size={12} className="text-ink-3" aria-hidden />
                  </a>
                </Td>
                <Td>
                  <span className={t.isBuy ? "text-gain" : "text-loss"}>{t.isBuy ? "Buy" : "Sell"}</span>
                  {t.kind === "otc" && <span className="text-ink-3"> · OTC</span>}
                  {you && <span className="text-ink-3 sm:hidden"> · you</span>}
                </Td>
                <Td num title={tokens(t.quoteAmount, q.decimals, q.symbol)}>
                  {q.usdPerUnit > 0 ? usd(valueUsd) : tokens(t.quoteAmount, q.decimals, q.symbol)}
                </Td>
                <Td num className="hidden text-ink-2 sm:table-cell">
                  {tokens(t.tokenAmount, coin.decimals)}
                </Td>
                <Td align="right" className="hidden sm:table-cell">
                  <span className="inline-flex items-center gap-2">
                    {you && <Badge tone="signal">You</Badge>}
                    <Wallet address={t.trader} />
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {data.length >= limit && limit < MOST && (
        <div className="p-3">
          <Button variant="ghost" size="sm" block disabled={isFetching} onClick={() => setLimit((l) => Math.min(MOST, l + MORE))}>
            {isFetching ? "Loading…" : "Show older trades"}
          </Button>
        </div>
      )}
    </>
  );
}

function Holders({ coin }: { coin: Coin }) {
  const wallet = useAddress();
  const [all, setAll] = useState(false);
  const { data, isLoading, isError } = useHolders(coin.address);
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState title="The holders did not load" />;
  if (!data?.length) return <EmptyState title="Nobody holds it yet" detail="Wallets show up here, largest first, after the first buy." />;
  const top = Math.max(...data.map((h) => h.share), 0.0001);
  const shown = all ? data : data.slice(0, FIRST);
  return (
    <>
      <DataTable dense caption={`Largest holders of ${coin.symbol}`}>
        <thead>
          <tr>
            <Th className="w-12">#</Th>
            <Th>Wallet</Th>
            <Th num>Share</Th>
            <Th num className="hidden sm:table-cell">
              Amount
            </Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((h, i) => (
            <tr key={h.address}>
              <Td className="num text-ink-3">{i + 1}</Td>
              <Td>
                <span className="inline-flex items-center gap-2">
                  <Wallet address={h.address} />
                  {h.address === coin.creator && <Badge>Creator</Badge>}
                  {!!wallet && h.address === wallet && <Badge tone="signal">You</Badge>}
                </span>
              </Td>
              <Td num>
                <span className="inline-flex items-center justify-end gap-3">
                  <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/8 sm:block" aria-hidden>
                    <span className="block h-full rounded-full bg-ink-3" style={{ width: `${(h.share / top) * 100}%` }} />
                  </span>
                  {pct(h.share * 100, { digits: 2 })}
                </span>
              </Td>
              <Td num className="hidden text-ink-2 sm:table-cell">
                {tokens(h.balance, coin.decimals)}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {!all && data.length > FIRST && (
        <div className="p-3">
          <Button variant="ghost" size="sm" block onClick={() => setAll(true)}>
            Show all {data.length} holders
          </Button>
        </div>
      )}
    </>
  );
}
