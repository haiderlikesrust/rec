"use client";

import { ArrowUpRight, Clock, Coins, Scale, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PROTECTION_CAP_X_TAX, PROTECTION_MIN_PAYOUT_SOL, type CoinProtection, type CoveredLoss } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useProtection, useSolUsd, useWalletSummary } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { age, bps, short, sol, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { TierChart } from "@/components/docs/DocsBlocks";
import { PayoutList } from "@/components/protection/Payouts";
import { AnimatedNumber, Button, Card, CardHeader, EmptyState, ErrorState, IconTile, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const VIOLET = bucketColor.protection;

export function ProtectionView() {
  const { data: status, isLoading, isError } = useProtection();
  const solUsd = useSolUsd();
  const fund = status?.fundSol;
  const payoutBps = status?.payoutBps ?? 1500;

  return (
    <div className="space-y-6">
      {/* hero */}
      <Card featured className="relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: VIOLET }} aria-hidden />
        <div className="relative grid grid-cols-1 items-center gap-8 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <IconTile color={VIOLET} size={32}>
                <ShieldCheck size={15} />
              </IconTile>
              <span className="eyebrow">Fund balance</span>
            </div>
            <div className="font-display mt-4 text-5xl leading-none font-semibold sm:text-6xl">
              {fund !== undefined && solUsd > 0 ? (
                <AnimatedNumber value={fund * solUsd} format={usd} />
              ) : (
                <Skeleton className="inline-block h-12 w-40 align-middle" />
              )}
            </div>
            <div className="num mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {fund !== undefined ? sol(fund) : " "}
              {status?.wallet && (
                <a
                  href={explorerAddress(status.wallet)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-faint transition-colors hover:text-fg"
                >
                  wallet {short(status.wallet)} <ArrowUpRight size={11} />
                </a>
              )}
            </div>
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Paid out so far", value: status?.totalPaidSol },
                { label: "Paid in the last 24h", value: status?.paid24hSol },
                {
                  label: "Waiting to send",
                  value: status?.owedSol,
                  sub: status?.waitingLosses
                    ? `+ ${status.waitingLosses} loss${status.waitingLosses === 1 ? "" : "es"} waiting for the fund`
                    : `sent once a wallet is owed ${PROTECTION_MIN_PAYOUT_SOL} SOL`,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-line bg-sunk/70 px-4 py-3">
                  <div className="text-xs text-muted">{s.label}</div>
                  <div className="num mt-1 text-lg font-medium">{s.value !== undefined ? usd(s.value * solUsd) : "…"}</div>
                  <div className="num truncate text-[11px] text-faint">{s.sub ?? (s.value !== undefined ? sol(s.value) : "")}</div>
                </div>
              ))}
            </div>
          </div>
          <LatestPayout loaded={!!status} latest={status?.recent?.[0]} solUsd={solUsd} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              icon={
                <IconTile color={VIOLET} size={36}>
                  <Clock size={16} />
                </IconTile>
              }
              title="1 · Hold time sets the rate"
              sub="Realized losses only: you sold below your average entry. Sell within 5 minutes of buying and nothing is covered."
            />
            <div className="px-5 pb-6 sm:px-6">
              <TierChart />
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={
                <IconTile color={VIOLET} size={36}>
                  <Coins size={16} />
                </IconTile>
              }
              title="2 · Each coin pays from its own pot"
              sub={`A coin's pot is what its fees put into the fund, minus what it has paid out. One payout can take at most ${bps(payoutBps)} of what's left, so a single loss can't empty it.`}
            />
            <div className="px-5 pt-5 pb-6 sm:px-6">
              <CoinPots coins={status?.coins} loading={isLoading} error={isError} solUsd={solUsd} />
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={
                <IconTile color={VIOLET} size={36}>
                  <Scale size={16} />
                </IconTile>
              }
              title="3 · Caps keep it solvent"
            />
            <ul className="mt-5 grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
              {[
                `Each payout is capped at ${PROTECTION_CAP_X_TAX}× the tax that wallet paid on that coin, across all its payouts.`,
                `One payout can take at most ${bps(payoutBps)} of its coin's pot.`,
                `Payouts are sent automatically, about a minute after the sale. Nothing to claim, nothing expires.`,
                "Creators selling their own coin aren't covered.",
              ].map((t) => (
                <li key={t} className="bg-elev px-5 py-4 text-[13px] leading-relaxed text-muted sm:px-6">
                  {t}
                </li>
              ))}
            </ul>
            <p className="px-5 py-4 text-xs text-faint sm:px-6">
              Coverage is discretionary and capped. It is not insurance.{" "}
              <Link href="/docs#protection" className="text-accent hover:underline">
                Full rules
              </Link>
            </p>
          </Card>

          <Card>
            <CardHeader
              icon={
                <IconTile color={VIOLET} size={36}>
                  <Timer size={16} />
                </IconTile>
              }
              title="Recent payouts"
              sub="Every covered loss, computed from public trade data with the same open-source rules this page shows, and paid from the protection wallet."
            />
            <div className="px-5 pt-2 pb-4 sm:px-6">
              {isError ? (
                <ErrorState detail="Payouts come from the Recur API, which isn't reachable right now." />
              ) : isLoading ? (
                <Skeleton className="mt-2 h-32" />
              ) : !status?.recent?.length ? (
                <EmptyState title="No payouts yet" detail="The first one goes out about a minute after someone sells a coin at a loss." />
              ) : (
                <PayoutList items={status.recent} solUsd={solUsd} showWallet />
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <YourPayouts />
        </aside>
      </div>
    </div>
  );
}

/** The most recent payout, so the fund reads as something that pays, not something to wait for. */
function LatestPayout({ loaded, latest, solUsd }: { loaded: boolean; latest?: CoveredLoss; solUsd: number }) {
  return (
    <div className="w-full rounded-[22px] border border-line bg-sunk/70 p-5 md:w-64">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Latest payout</span>
        {latest && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: VIOLET }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: VIOLET }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: VIOLET }} />
            </span>
            Live
          </span>
        )}
      </div>
      <div className="font-display mt-2 text-3xl leading-none font-semibold">
        {!loaded ? <Skeleton className="inline-block h-8 w-28 align-middle" /> : latest ? usd(latest.amountSol * solUsd) : "None yet"}
      </div>
      <div className="mt-3 text-[13px] text-muted">
        {latest ? (
          <>
            <Link href={`/token/${latest.coin}`} className="font-medium text-fg hover:text-accent">
              ${latest.symbol}
            </Link>{" "}
            seller <span className="num">{short(latest.wallet)}</span>
          </>
        ) : (
          "Losing sales are paid about a minute after they happen."
        )}
      </div>
      {latest && <div className="num mt-1 text-[11px] text-faint">{age(latest.t)} ago · paid automatically</div>}
    </div>
  );
}

function CoinPots({ coins, loading, error, solUsd }: { coins?: CoinProtection[]; loading: boolean; error: boolean; solUsd: number }) {
  const [all, setAll] = useState(false);
  if (error) return <ErrorState detail="Per-coin pots come from the Recur API, which isn't reachable right now." />;
  if (loading) return <Skeleton className="h-40" />;
  if (!coins || coins.length === 0)
    return <EmptyState title="No pots yet" detail="A coin gets a pot as soon as its first fees reach the protection fund." />;
  const shown = all ? coins : coins.slice(0, 8);
  return (
    <div>
      <div className="scroll-x -mx-1 px-1">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-[11px] tracking-wider text-faint uppercase">
              <th className="pb-2 font-medium">Coin</th>
              <th className="pb-2 text-right font-medium">Paid in</th>
              <th className="pb-2 text-right font-medium">Paid out</th>
              <th className="pb-2 pl-4 font-medium">Pot left</th>
              <th className="pb-2 text-right font-medium">Next payout up to</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const left = c.contributedSol > 0 ? Math.min(1, c.potSol / c.contributedSol) : 0;
              return (
                <tr key={c.coin} className="border-t border-line">
                  <td className="py-2.5">
                    <Link href={`/token/${c.coin}`} className="flex items-center gap-2.5 hover:text-accent">
                      <CoinAvatar src={c.image} symbol={c.symbol} seed={c.coin} size={26} />
                      <span className="font-medium">${c.symbol}</span>
                    </Link>
                  </td>
                  <td className="num py-2.5 text-right">{usd(c.contributedSol * solUsd)}</td>
                  <td className="num py-2.5 text-right text-muted">{c.paidSol > 0 ? usd(c.paidSol * solUsd) : "—"}</td>
                  <td className="py-2.5 pl-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunk">
                        <div className="h-full rounded-full" style={{ width: `${left * 100}%`, background: VIOLET }} />
                      </div>
                      <span className="num text-xs">{usd(c.potSol * solUsd)}</span>
                    </div>
                  </td>
                  <td className="num py-2.5 text-right">{usd(c.maxPayoutSol * solUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {coins.length > 8 && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 text-xs font-medium text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${coins.length} coins`}
        </button>
      )}
    </div>
  );
}

function YourPayouts() {
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const { data, isLoading, isError } = useWalletSummary(address);
  if (!address)
    return (
      <Card className="relative overflow-hidden p-6">
        <div className="spectrum mb-5 h-1 w-12 rounded-full" />
        <h3 className="font-display text-2xl font-semibold">Your payouts</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Connect to see your covered losses. Payouts arrive in your wallet on their own.</p>
        <Button className="mt-5 w-full" size="lg" onClick={openWallet}>
          Connect wallet
        </Button>
      </Card>
    );
  const p = data?.protection;
  return (
    <Card featured className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your payouts</span>
          <div className="font-display mt-2 text-3xl font-semibold">{usd((p?.receivedSol ?? 0) * solUsd)}</div>
          <div className="num text-xs text-muted">
            {sol(p?.receivedSol ?? 0)} received{p && p.owedSol > 0 ? ` · ${usd(p.owedSol * solUsd)} on its way` : ""}
          </div>
        </div>
        <IconTile color={VIOLET} size={40}>
          <ShieldCheck size={18} />
        </IconTile>
      </div>
      {isError ? (
        <p className="mt-4 text-xs text-muted">Payouts come from the Recur API, which isn&apos;t reachable right now.</p>
      ) : isLoading || !p ? (
        <Skeleton className="mt-4 h-24" />
      ) : p.losses.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-sunk px-4 py-3 text-xs text-muted">No losing sales. That&apos;s the good outcome.</p>
      ) : (
        <div className="mt-3 max-h-[480px] overflow-y-auto">
          <PayoutList items={p.losses.slice(0, 40)} solUsd={solUsd} />
        </div>
      )}
    </Card>
  );
}
