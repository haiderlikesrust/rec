"use client";

import clsx from "clsx";
import { ArrowUpRight, Clock, Coins, Scale, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PROTECTION_CAP_X_TAX,
  PROTECTION_CLAIM_WINDOW_SECONDS,
  PROTECTION_EPOCH_BPS,
  PROTECTION_EPOCH_SECONDS,
  type CoinProtection,
  type ProtectionClaim,
} from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { client, useProtection, useSolUsd, useWalletSummary } from "@/lib/data";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import { age, bps, duration, short, sol, units, usd } from "@/lib/format";
import { useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { FundingRatio, TierChart } from "@/components/docs/DocsBlocks";
import { TxStatus } from "@/components/TxStatus";
import { AnimatedNumber, Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconTile, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const VIOLET = bucketColor.protection;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const scaleColor = (s: number) => (s >= 0.999 ? bucketColor.otcReserve : s >= 0.5 ? "var(--b-main)" : "var(--down)");

export function ProtectionView() {
  const { data: status, isLoading, isError } = useProtection();
  const solUsd = useSolUsd();
  const now = useNow();

  const fund = status?.fundSol;
  const maxEpochBps = status?.maxEpochBps ?? PROTECTION_EPOCH_BPS;
  const lastEpochAt = status?.lastEpochAt ?? 0;
  const nextAt = status?.nextEpochAt ?? 0;
  const left = Math.max(0, nextAt - now);
  // the backend schedules the next epoch one interval after the last (shorter in demo mode)
  const interval = lastEpochAt > 0 && nextAt > lastEpochAt ? nextAt - lastEpochAt : PROTECTION_EPOCH_SECONDS;
  const elapsed = lastEpochAt > 0 ? Math.min(1, (now - lastEpochAt) / interval) : 1;

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
                { label: "Committed to open claims", value: status?.reservedSol },
                { label: "Next epoch budget", value: status?.epochBudgetSol, sub: `up to ${bps(maxEpochBps)} of the fund` },
                { label: "Paid out so far", value: status?.totalPaidSol },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-line bg-sunk/70 px-4 py-3">
                  <div className="text-xs text-muted">{s.label}</div>
                  <div className="num mt-1 text-lg font-medium">{s.value !== undefined ? usd(s.value * solUsd) : "…"}</div>
                  <div className="num text-[11px] text-faint">{s.sub ?? (s.value !== undefined ? sol(s.value) : "")}</div>
                </div>
              ))}
            </div>
          </div>
          <Countdown loaded={!!status} left={left} elapsed={elapsed} interval={interval} lastEpochAt={lastEpochAt} />
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
              title="1 · Hold time sets an “up to” rate"
              sub="Realized losses only: you sold below your average entry. Markets are fast, so tiers are minutes and hours."
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
              title="2 · Coin funding"
              sub="Effective coverage = hold-time rate × the coin's funding. A coin can only draw its share of each epoch's budget, in proportion to what it paid into the fund."
            />
            <div className="px-5 pt-5 pb-6 sm:px-6">
              <CoinFunding coins={status?.coins} loading={isLoading} error={isError} solUsd={solUsd} />
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
            <ul className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2 mt-5">
              {[
                `Each payout is capped at ${PROTECTION_CAP_X_TAX}× the tax that wallet paid on that coin.`,
                `An epoch can commit at most ${bps(maxEpochBps)} of the uncommitted fund.`,
                `Epochs are at least ${duration(PROTECTION_EPOCH_SECONDS)} apart. Claims stay open for ${Math.round(PROTECTION_CLAIM_WINDOW_SECONDS / 86_400)} days, then return to the fund.`,
                "Creators on their own coins, protocol addresses and wash-trading clusters are excluded.",
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
              title="Epoch history"
              sub="Each epoch is computed from public trade data with the same open-source policy the UI uses, and paid from the protection wallet."
            />
            <div className="px-5 pt-4 pb-6 sm:px-6">
              {isError ? (
                <ErrorState detail="Epoch history comes from the Recur API, which isn't reachable right now." />
              ) : isLoading ? (
                <Skeleton className="h-32" />
              ) : !status?.epochs.length ? (
                <EmptyState title="No epochs published yet" detail="The first epoch is published once the fund has collected fees." />
              ) : (
                <ol className="relative space-y-3 pl-6">
                  <span className="absolute top-2 bottom-2 left-[7px] w-px bg-line-strong" aria-hidden />
                  {status.epochs.map((e, i) => {
                    const claimedShare = e.totalSol > 0 ? Math.min(1, e.claimedSol / e.totalSol) : 0;
                    return (
                      <li key={e.id} className="relative">
                        <span
                          className="absolute top-4 -left-6 h-[15px] w-[15px] rounded-full border-2 border-bg"
                          style={{ background: i === 0 ? VIOLET : "var(--line-strong)" }}
                        />
                        <div className="rounded-2xl border border-line bg-sunk/60 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="num text-sm font-semibold">Epoch #{e.id}</span>
                              {i === 0 && <Badge tone="accent">Latest</Badge>}
                            </div>
                            <span className="num text-xs text-faint">{age(e.publishedAt)} ago</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                            <span className="text-muted">
                              Committed <span className="num text-fg">{usd(e.totalSol * solUsd)}</span>
                            </span>
                            <span className="text-muted">
                              Claimed <span className="num text-fg">{usd(e.claimedSol * solUsd)}</span>
                            </span>
                            <span className="text-muted">
                              <span className="num text-fg">{e.claims}</span> wallet{e.claims === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-sunk">
                            <div className="h-full rounded-full" style={{ width: `${claimedShare * 100}%`, background: VIOLET }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <YourClaims />
        </aside>
      </div>
    </div>
  );
}

/** "6 days" or "2 hours" for a round interval, "1h 30m" otherwise. */
const wholeUnits = (s: number) => {
  for (const [unit, len] of [
    ["day", 86_400],
    ["hour", 3600],
  ] as const) {
    if (s >= len && s % len === 0) return `${s / len} ${unit}${s === len ? "" : "s"}`;
  }
  return duration(s);
};

/** Time to the next epoch, with a bar for how far we are through the current interval. */
function Countdown({
  loaded,
  left,
  elapsed,
  interval,
  lastEpochAt,
}: {
  loaded: boolean;
  left: number;
  elapsed: number;
  interval: number;
  lastEpochAt: number;
}) {
  const due = loaded && left <= 0;
  return (
    <div className="w-full rounded-[22px] border border-line bg-sunk/70 p-5 md:w-64">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Next epoch</span>
        {due && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: VIOLET }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: VIOLET }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: VIOLET }} />
            </span>
            Due
          </span>
        )}
      </div>
      <div className="font-display mt-2 text-3xl leading-none font-semibold">
        {!loaded ? <Skeleton className="inline-block h-8 w-28 align-middle" /> : due ? "Due now" : duration(left)}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(elapsed, 0.02) * 100}%`, background: VIOLET, transition: "width 1s linear" }}
        />
      </div>
      <div className="num mt-2.5 flex justify-between gap-2 text-[11px] text-faint">
        <span>{lastEpochAt > 0 ? `last ${age(lastEpochAt)} ago` : "first one pending"}</span>
        <span>every {wholeUnits(interval)}</span>
      </div>
    </div>
  );
}

function CoinFunding({ coins, loading, error, solUsd }: { coins?: CoinProtection[]; loading: boolean; error: boolean; solUsd: number }) {
  const [all, setAll] = useState(false);
  if (error) return <ErrorState detail="Per-coin funding comes from the Recur API, which isn't reachable right now." />;
  if (loading) return <Skeleton className="h-40" />;
  if (!coins || coins.length === 0)
    return (
      <>
        <p className="text-[13px] text-muted">Per-coin funding shows up once coins have paid into the fund. Here&apos;s how it works:</p>
        <FundingRatio className="!mb-0" />
      </>
    );
  const shown = all ? coins : coins.slice(0, 8);
  const maxShare = Math.max(...coins.map((c) => c.shareOfFund), 0.0001);
  return (
    <div>
      <div className="scroll-x -mx-1 px-1">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-[11px] tracking-wider text-faint uppercase">
              <th className="pb-2 font-medium">Coin</th>
              <th className="pb-2 text-right font-medium">Paid in</th>
              <th className="pb-2 pl-4 font-medium">Share of fund</th>
              <th className="pb-2 text-right font-medium">Can draw next epoch</th>
              <th className="pb-2 text-right font-medium">Claims requested</th>
              <th className="pb-2 text-right font-medium">Funding</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.coin} className="border-t border-line">
                <td className="py-2.5">
                  <Link href={`/token/${c.coin}`} className="flex items-center gap-2.5 hover:text-accent">
                    <CoinAvatar src={c.image} symbol={c.symbol} seed={c.coin} size={26} />
                    <span className="font-medium">${c.symbol}</span>
                  </Link>
                </td>
                <td className="num py-2.5 text-right">{usd(c.contributedSol * solUsd)}</td>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunk">
                      <div className="h-full rounded-full" style={{ width: `${(c.shareOfFund / maxShare) * 100}%`, background: VIOLET }} />
                    </div>
                    <span className="num text-xs text-muted">{(c.shareOfFund * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="num py-2.5 text-right">{usd(c.allocationSol * solUsd)}</td>
                <td className="num py-2.5 text-right text-muted">{c.requestedSol > 0 ? usd(c.requestedSol * solUsd) : "—"}</td>
                <td className="py-2.5 text-right">
                  <span
                    className="num inline-flex rounded-full px-2 py-0.5 text-xs"
                    style={{ color: scaleColor(c.scale), background: `color-mix(in srgb, ${scaleColor(c.scale)} 13%, transparent)` }}
                  >
                    {(c.scale * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {coins.length > 8 && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 text-xs font-medium text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${coins.length} coins`}
        </button>
      )}
      <p className="mt-4 text-xs leading-relaxed text-faint">
        <span className="text-muted">Funding</span> is the multiplier on tier rates if the epoch closed now: 100% means the coin
        paid in enough to cover every request; lower means its requests are paid pro-rata.
      </p>
    </div>
  );
}

function YourClaims() {
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const { data, isLoading, isError } = useWalletSummary(address);
  if (!address)
    return (
      <Card className="relative overflow-hidden p-6">
        <div className="spectrum mb-5 h-1 w-12 rounded-full" />
        <h3 className="font-display text-2xl font-semibold">Your claims</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Connect to see covered losses and claim them.</p>
        <Button className="mt-5 w-full" size="lg" onClick={openWallet}>
          Connect wallet
        </Button>
      </Card>
    );
  const claimable = data ? data.claims.filter((c) => c.status === "open").reduce((s, c) => s + units(c.amount, 9), 0) : 0;
  return (
    <Card featured className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your claims</span>
          <div className="font-display mt-2 text-3xl font-semibold">{usd(claimable * solUsd)}</div>
          <div className="num text-xs text-muted">{sol(claimable)} ready to claim</div>
        </div>
        <IconTile color={VIOLET} size={40}>
          <ShieldCheck size={18} />
        </IconTile>
      </div>
      {isError ? (
        <p className="mt-4 text-xs text-muted">Claims come from the Recur API, which isn&apos;t reachable right now.</p>
      ) : isLoading || !data ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <>
          {data.claims.length === 0 && data.pendingCoverage.length === 0 && (
            <p className="mt-4 rounded-2xl bg-sunk px-4 py-3 text-xs text-muted">No covered losses. That&apos;s the good outcome.</p>
          )}
          {data.claims.length > 0 && (
            <ul className="mt-5 space-y-3">
              {data.claims.map((c) => (
                <ClaimRow key={c.epoch} claim={c} solUsd={solUsd} />
              ))}
            </ul>
          )}
          {data.pendingCoverage.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="text-xs font-medium">Estimated for the next epoch</div>
              <ul className="mt-3 space-y-2.5">
                {data.pendingCoverage.map((p, i) => (
                  <li key={`${p.coin}-${i}`} className="rounded-xl bg-sunk/70 px-3 py-2.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <Link href={`/token/${p.coin}`} className="font-medium hover:text-accent">
                        ${p.symbol}
                      </Link>
                      <span className="num">≈ {usd(p.estimatedSol * solUsd)}</span>
                    </div>
                    <div className="num mt-1 text-[11px] text-muted">loss {usd(p.lossSol * solUsd)}</div>
                    <div className="num mt-0.5 text-[11px] text-muted">
                      tier {bps(p.tierBps)} × funding {p.tierBps > 0 ? Math.round((p.coverageBps / p.tierBps) * 100) : 0}% ={" "}
                      <span className="text-fg">{bps(p.coverageBps)}</span> (≈ {sol(p.estimatedSol)})
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
                Estimates if the epoch closed now. Each payout is also capped at {PROTECTION_CAP_X_TAX}× the tax you paid on that coin.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ClaimRow({ claim, solUsd }: { claim: ProtectionClaim; solUsd: number }) {
  const tx = useSolanaTx();
  const wallet = useAddress();
  const amountSol = units(claim.amount, 9);
  const done = claim.status === "claimed" || tx.state.status === "success";
  const claim_ = () =>
    wallet &&
    tx.run(
      `Claim epoch #${claim.epoch}`,
      () => client.claim(wallet, claim.epoch),
      (signature, res) => client.claimConfirm(res.claimId, signature),
    );
  const signature = claim.signature ?? tx.state.signature;
  return (
    <li className={clsx("rounded-2xl border p-4", done || claim.status === "expired" ? "border-line bg-sunk/50" : "border-line-strong bg-elev-2")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Epoch #{claim.epoch}</div>
          <div className="num mt-0.5 text-lg font-medium">{usd(amountSol * solUsd)}</div>
          <div className="num text-[11px] text-faint">{sol(amountSol)}</div>
        </div>
        {done ? (
          signature && signature !== "demo" ? (
            <a href={explorerTx(signature)} target="_blank" rel="noreferrer">
              <Badge tone="up">
                Claimed <ArrowUpRight size={11} />
              </Badge>
            </a>
          ) : (
            <Badge tone="up">Claimed</Badge>
          )
        ) : claim.status === "expired" ? (
          <Badge tone="outline">Expired</Badge>
        ) : claim.status === "pending" && !tx.busy ? (
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone="accent">Confirming…</Badge>
            <button onClick={claim_} className="text-[11px] text-muted hover:text-fg">
              Retry
            </button>
          </div>
        ) : (
          <Button size="sm" disabled={tx.busy} onClick={claim_}>
            {tx.busy ? "Claiming…" : "Claim"}
          </Button>
        )}
      </div>
      {claim.status === "open" && claim.expiresAt > 0 && (
        <p className="mt-2 text-[11px] text-faint">Open until {new Date(claim.expiresAt * 1000).toLocaleDateString()} · paid by the protection wallet in one co-signed transaction</p>
      )}
      {claim.breakdown.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px] text-muted">
          {claim.breakdown.map((b, i) => (
            <li key={`${b.coin}-${i}`} className="flex justify-between gap-2">
              <span>
                ${b.symbol} · held {duration(b.holdSeconds)}
              </span>
              <span className="num">
                loss {usd(b.lossSol * solUsd)} × {bps(b.coverageBps)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <TxStatus state={tx.state} className="mt-3" />
    </li>
  );
}
