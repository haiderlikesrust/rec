"use client";

import { useMemo, useState, type ReactNode } from "react";
import { brand, type Coin, type WalletSummary } from "@gantry/shared";
import { useSolUsd, useWalletSummary } from "@/lib/data";
import { sol, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { PayoutsTable } from "@/components/shield/PayoutsTable";
import { AnimatedNumber, Button, ButtonLink, EmptyState, ErrorState, Panel, PanelBody, Skeleton, Stat, Tabs } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { ActivityTable } from "./ActivityTable";
import { HoldingsTable, holds, signedUsd, SoldCoins } from "./HoldingsTable";
import { TRADES_PER_COIN, useWalletTrades } from "./useWalletTrades";

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number.isFinite(f(x)) ? f(x) : 0), 0);

export function PortfolioView() {
  const address = useAddress();
  const { open } = useWalletModal();
  const { data, isLoading, isError } = useWalletSummary(address);
  const solUsd = useSolUsd();

  if (!address)
    return (
      <EmptyState
        title="Connect a wallet to see your coins"
        detail="Connecting only shares your address. Nothing is signed and nothing moves."
        action={<Button onClick={open}>Connect wallet</Button>}
      />
    );
  if (isError) return <ErrorState title="Your portfolio didn't load" detail={`${brand.name} isn't answering right now. It retries on its own.`} />;
  if (isLoading || !data)
    return (
      <>
        <Skeleton className="h-14 max-w-md" />
        <Skeleton className="h-80" />
      </>
    );
  return <Connected data={data} solUsd={solUsd} wallet={address} />;
}

type View = "holdings" | "payouts" | "activity";

function Connected({ data, solUsd, wallet }: { data: WalletSummary; solUsd: number; wallet: string }) {
  const [view, setView] = useState<View>("holdings");

  const open = useMemo(() => data.positions.filter(holds).sort((a, b) => b.valueUsd - a.valueUsd), [data]);
  const sold = useMemo(() => data.positions.filter((p) => !holds(p) && p.realizedPnl !== 0), [data]);
  const images = useMemo(() => new Map(data.positions.map((p) => [p.coin.address, p.coin.image])), [data]);
  const coins = useMemo(() => data.positions.map((p) => p.coin), [data]);

  const valueUsd = sum(open, (p) => p.valueUsd);
  // what the coins still held are up or down, plus what past sales made or lost
  const pnlUsd = sum(open, (p) => p.unrealizedUsd) + sum(data.positions, (p) => p.realizedPnlUsd);
  const cover = data.protection;

  let body: ReactNode;
  if (view === "holdings") {
    body = (
      <>
        {open.length === 0 ? (
          <PanelBody>
            <EmptyState
              title="No coins yet"
              detail="Coins you buy show up here with what they are worth and how they are doing."
              action={<ButtonLink href="/">Browse coins</ButtonLink>}
            />
          </PanelBody>
        ) : (
          <HoldingsTable list={open} />
        )}
        <SoldCoins list={sold} />
      </>
    );
  } else if (view === "payouts") {
    body =
      cover.losses.length === 0 ? (
        <PanelBody>
          <EmptyState
            title="No payouts yet"
            detail={`If you sell a coin for less than you paid, what ${brand.shield} sends back shows up here about a minute later.`}
            action={
              <ButtonLink href="/shield" variant="secondary" size="sm">
                How it works
              </ButtonLink>
            }
          />
        </PanelBody>
      ) : (
        <PayoutsTable caption="Your losing sales and what was paid back" items={cover.losses} solUsd={solUsd} images={images} notes share initial={12} />
      );
  } else {
    body = <Activity wallet={wallet} coins={coins} />;
  }

  return (
    <>
      <div className="flex flex-wrap gap-x-14 gap-y-5">
        <Stat label="Holdings" value={<AnimatedNumber value={valueUsd} format={usd} />} />
        <Stat label="Total profit / loss" value={signedUsd(pnlUsd)} tone={pnlUsd > 0 ? "gain" : pnlUsd < 0 ? "loss" : undefined} />
        <Stat
          label={`Paid back by ${brand.shield}`}
          value={solUsd > 0 ? usd(cover.receivedSol * solUsd) : sol(cover.receivedSol)}
          sub={cover.owedSol > 0 ? `${usd(cover.owedSol * solUsd)} more on the way` : undefined}
        />
      </div>

      <Panel as="section">
        <Tabs
          aria-label="Portfolio"
          value={view}
          onChange={setView}
          options={[
            { value: "holdings", label: "Holdings", count: open.length || undefined },
            { value: "payouts", label: "Payouts", count: cover.losses.length || undefined },
            { value: "activity", label: "Activity" },
          ]}
        />
        <div role="tabpanel" aria-label={view === "holdings" ? "Holdings" : view === "payouts" ? "Payouts" : "Activity"}>
          {body}
        </div>
      </Panel>
    </>
  );
}

/** The wallet's recent buys and sells. Read only while this tab is open: it is one request per coin. */
function Activity({ wallet, coins }: { wallet: string; coins: Coin[] }) {
  const tape = useWalletTrades(wallet, coins);
  if (tape.failed)
    return (
      <PanelBody>
        <ErrorState title="Your trades didn't load" detail={`${brand.name} isn't answering right now. It retries on its own.`} />
      </PanelBody>
    );
  if (tape.loading && tape.trades.length === 0)
    return (
      <PanelBody>
        <Skeleton className="h-64" />
      </PanelBody>
    );
  if (tape.trades.length === 0)
    return (
      <PanelBody>
        <EmptyState title="No trades yet" detail="Your buys and sells show up here." action={<ButtonLink href="/">Browse coins</ButtonLink>} />
      </PanelBody>
    );
  return (
    <>
      <ActivityTable trades={tape.trades} />
      <p className="px-[var(--card-pad)] pt-2 pb-[var(--card-pad)] text-[13px] leading-relaxed text-ink-3">
        Approximate: the latest {TRADES_PER_COIN} trades on each coin this wallet still holds.
        {tape.partial && " Some coins didn't load, so a few trades are missing for now."}
      </p>
    </>
  );
}
