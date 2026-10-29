"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { Clock, Coins, ExternalLink, Scale, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import {
  PROTECTION_CAP_X_TAX,
  PROTECTION_EPOCH_BPS,
  type CoinProtection,
  type ProtectionClaim,
} from "@cook/shared";
import { CHAIN_ID, abis, addresses } from "@/lib/contracts";
import { bucketColor } from "@/lib/buckets";
import { useProtection, useStats, useWallet } from "@/lib/data";
import { age, bps, duration, eth, units, usd, wei } from "@/lib/format";
import { useTx, useWrongChain } from "@/lib/tx";
import { CoinAvatar } from "@/components/CoinAvatar";
import { FundingRatio, TierChart } from "@/components/docs/DocsBlocks";
import { TxStatus } from "@/components/TxStatus";
import { AnimatedNumber, Badge, Button, Card, CardHeader, EmptyState, ErrorState, IconTile, Skeleton } from "@/components/ui";

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
  const { data: stats } = useStats();
  const ethUsd = stats?.ethUsd ?? 0;
  const now = useNow();

  const base = { address: addresses.protectionFund!, abi: abis.protection, chainId: CHAIN_ID } as const;
  const chain = useReadContracts({
    contracts: [
      { ...base, functionName: "reserved" },
      { ...base, functionName: "epochBudget" },
      { ...base, functionName: "totalPaid" },
      { ...base, functionName: "maxEpochBps" },
      { ...base, functionName: "lastPublished" },
      { ...base, functionName: "minEpochInterval" },
    ],
    query: { enabled: !!addresses.protectionFund, refetchInterval: 10_000 },
  });
  const balance = useBalance({ address: addresses.protectionFund, chainId: CHAIN_ID, query: { refetchInterval: 10_000 } });
  const reserved = (chain.data?.[0]?.result as bigint | undefined) ?? (status ? BigInt(status.reservedEth) : undefined);
  const budget = (chain.data?.[1]?.result as bigint | undefined) ?? (status ? BigInt(status.epochBudgetEth) : undefined);
  const paid = chain.data?.[2]?.result as bigint | undefined;
  const maxEpochBps = Number((chain.data?.[3]?.result as bigint | undefined) ?? BigInt(PROTECTION_EPOCH_BPS));
  const lastPublished = Number((chain.data?.[4]?.result as number | bigint | undefined) ?? 0);
  const interval = Number((chain.data?.[5]?.result as number | bigint | undefined) ?? 0);
  const fund = balance.data?.value ?? (status ? BigInt(status.fundEth) : undefined);

  const nextAt = status?.nextEpochAt ?? (lastPublished ? lastPublished + interval : 0);
  const left = Math.max(0, nextAt - now);
  const elapsed = interval > 0 && lastPublished > 0 ? Math.min(1, (now - lastPublished) / interval) : 1;

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
              {fund !== undefined ? <AnimatedNumber value={units(fund)} format={(n) => n.toFixed(3)} /> : <Skeleton className="inline-block h-12 w-40 align-middle" />}
              <span className="ml-2 text-2xl text-muted">ETH</span>
            </div>
            <div className="num mt-2 text-sm text-muted">{fund !== undefined ? usd(units(fund) * ethUsd) : " "}</div>
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Committed to open epochs", value: reserved },
                { label: "Next epoch budget", value: budget, sub: `up to ${bps(maxEpochBps)} of the fund` },
                { label: "Paid out so far", value: paid },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-line bg-sunk/70 px-4 py-3">
                  <div className="text-xs text-muted">{s.label}</div>
                  <div className="num mt-1 text-lg font-medium">{s.value !== undefined ? wei(s.value) : "…"}</div>
                  <div className="num text-[11px] text-faint">{s.sub ?? (s.value !== undefined ? usd(units(s.value) * ethUsd) : "")}</div>
                </div>
              ))}
            </div>
          </div>
          <Countdown elapsed={elapsed} label={status || chain.data ? (left <= 0 ? "Any time now" : duration(left)) : "…"} />
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
              <CoinFunding coins={status?.coins} loading={isLoading} error={isError} />
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
                `An epoch can commit at most ${bps(maxEpochBps)} of the uncommitted fund, enforced by the contract.`,
                "Epochs are at least 6 days apart. Claims stay open for 60 days, then return to the fund.",
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
              sub="Each epoch's full claim list is published with its Merkle root so anyone can recompute it."
            />
            <div className="px-5 pt-4 pb-6 sm:px-6">
              {isError ? (
                <ErrorState detail="Epoch history comes from the indexer, which isn't reachable right now." />
              ) : isLoading ? (
                <Skeleton className="h-32" />
              ) : !status?.epochs.length ? (
                <EmptyState title="No epochs published yet" detail="The first epoch is published once the fund has collected fees." />
              ) : (
                <ol className="relative space-y-3 pl-6">
                  <span className="absolute top-2 bottom-2 left-[7px] w-px bg-line-strong" aria-hidden />
                  {status.epochs.map((e, i) => {
                    const claimedShare = BigInt(e.total) > 0n ? Number((BigInt(e.claimed) * 10_000n) / BigInt(e.total)) / 10_000 : 0;
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
                              Committed <span className="num text-fg">{wei(e.total)}</span>
                            </span>
                            <span className="text-muted">
                              Claimed <span className="num text-fg">{wei(e.claimed)}</span>
                            </span>
                            {e.uri && /^(ipfs|https?):/.test(e.uri) ? (
                              <a
                                href={e.uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/")}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-accent hover:underline"
                              >
                                claims.json <ExternalLink size={11} />
                              </a>
                            ) : (
                              e.uri && <span className="num text-faint">{e.uri}</span>
                            )}
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

/** Ring showing how far we are through the current epoch interval. */
function Countdown({ elapsed, label }: { elapsed: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-44 w-44 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={VIOLET}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(elapsed, 0.01) * c} ${c}`}
          style={{ transition: "stroke-dasharray 1s linear", filter: `drop-shadow(0 0 6px color-mix(in srgb, ${VIOLET} 60%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="eyebrow">Next epoch</span>
        <span className="num mt-1.5 text-lg font-medium">{label}</span>
      </div>
    </div>
  );
}

function CoinFunding({ coins, loading, error }: { coins?: CoinProtection[]; loading: boolean; error: boolean }) {
  const [all, setAll] = useState(false);
  if (error) return <ErrorState detail="Per-coin funding comes from the indexer, which isn't reachable right now." />;
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
                <td className="num py-2.5 text-right">{eth(c.contributedEth)}</td>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunk">
                      <div className="h-full rounded-full" style={{ width: `${(c.shareOfFund / maxShare) * 100}%`, background: VIOLET }} />
                    </div>
                    <span className="num text-xs text-muted">{(c.shareOfFund * 100).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="num py-2.5 text-right">{eth(c.allocationEth)}</td>
                <td className="num py-2.5 text-right text-muted">{c.requestedEth > 0 ? eth(c.requestedEth) : "—"}</td>
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
  const { address } = useAccount();
  const { data, isLoading, isError } = useWallet(address);
  if (!address)
    return (
      <Card className="relative overflow-hidden p-6">
        <div className="spectrum mb-5 h-1 w-12 rounded-full" />
        <h3 className="font-display text-2xl font-semibold">Your claims</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Connect to see covered losses and claim them.</p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <Button className="mt-5 w-full" size="lg" onClick={openConnectModal}>
              Connect wallet
            </Button>
          )}
        </ConnectButton.Custom>
      </Card>
    );
  const claimable = data ? data.claims.filter((c) => !c.claimed).reduce((s, c) => s + units(c.amount), 0) : 0;
  return (
    <Card featured className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Your claims</span>
          <div className="font-display mt-2 text-3xl font-semibold">
            {claimable.toFixed(4)} <span className="text-base text-muted">ETH</span>
          </div>
          <div className="text-xs text-muted">ready to claim</div>
        </div>
        <IconTile color={VIOLET} size={40}>
          <ShieldCheck size={18} />
        </IconTile>
      </div>
      {isError ? (
        <p className="mt-4 text-xs text-muted">Claims come from the indexer, which isn&apos;t reachable right now.</p>
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
                <ClaimRow key={c.epoch} claim={c} />
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
                      <span className="num">≈ {eth(p.estimatedEth)}</span>
                    </div>
                    <div className="num mt-1 text-[11px] text-muted">loss {eth(p.lossEth)}</div>
                    <div className="num mt-0.5 text-[11px] text-muted">
                      tier {bps(p.tierBps)} × funding {p.tierBps > 0 ? Math.round((p.coverageBps / p.tierBps) * 100) : 0}% ={" "}
                      <span className="text-fg">{bps(p.coverageBps)}</span> (≈ {eth(p.estimatedEth)})
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

function ClaimRow({ claim }: { claim: ProtectionClaim }) {
  const tx = useTx();
  const { wrong, switchToApp } = useWrongChain();
  const done = claim.claimed || tx.state.status === "success";
  const claim_ = () =>
    tx.send(`Claim epoch #${claim.epoch}`, {
      address: addresses.protectionFund!,
      abi: abis.protection,
      functionName: "claim",
      args: [BigInt(claim.epoch), claim.account as Address, BigInt(claim.amount), claim.proof as `0x${string}`[]],
    });
  return (
    <li className={clsx("rounded-2xl border p-4", done ? "border-line bg-sunk/50" : "border-line-strong bg-elev-2")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Epoch #{claim.epoch}</div>
          <div className="num mt-0.5 text-lg font-medium">{wei(claim.amount)}</div>
        </div>
        {done ? (
          <Badge tone="up">Claimed</Badge>
        ) : wrong ? (
          <Button size="sm" onClick={switchToApp}>
            Switch network
          </Button>
        ) : (
          <Button size="sm" disabled={tx.busy} onClick={claim_}>
            {tx.busy ? "Claiming…" : "Claim"}
          </Button>
        )}
      </div>
      {claim.breakdown.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px] text-muted">
          {claim.breakdown.map((b, i) => (
            <li key={`${b.coin}-${i}`} className="flex justify-between gap-2">
              <span>
                ${b.symbol} · held {duration(b.holdSeconds)}
              </span>
              <span className="num">
                loss {eth(b.lossEth)} × {bps(b.coverageBps)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <TxStatus state={tx.state} className="mt-3" />
    </li>
  );
}
