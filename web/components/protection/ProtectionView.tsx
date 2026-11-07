"use client";

import { ArrowRight, ArrowUpRight, Check, Clock, Coins, Egg, Scale, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  brand,
  coverageBpsForHold,
  PROTECTION_CAP_X_TAX,
  PROTECTION_MIN_PAYOUT_SOL,
  PROTECTION_PAYOUT_BPS,
  protectionTiers,
  RUG_COVERAGE_BPS,
  type CoinProtection,
  type CoveredLoss,
  type ProtectionStatus,
} from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useProtection, useSolUsd, useWalletSummary } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { age, bps, short, sol, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { PayoutList } from "@/components/protection/Payouts";
import { AnimatedNumber, Button, Card, CardHeader, EmptyState, ErrorState, Eyebrow, IconTile, SectionHeading, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const MINT = bucketColor.protection;
const two = "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";

export function ProtectionView() {
  const { data: status, isLoading, isError } = useProtection();
  const solUsd = useSolUsd();
  const payoutBps = status?.payoutBps ?? PROTECTION_PAYOUT_BPS;
  const images = useMemo(() => new Map((status?.coins ?? []).map((c) => [c.coin, c.image])), [status]);

  return (
    <div className="space-y-16 sm:space-y-24">
      {/* the fund and what it has paid */}
      <section className={two}>
        <FundHero status={status} error={isError} solUsd={solUsd} />
        <div className="grid min-w-0 content-start gap-5">
          <LatestPayout loaded={!!status} error={isError} latest={status?.recent?.[0]} solUsd={solUsd} images={images} />
          <YourPayouts images={images} />
        </div>
      </section>

      {/* how coverage works */}
      <section className="space-y-8">
        <SectionHeading
          eyebrow="Coverage"
          title="How a payout is worked out"
          sub="Three rules, applied to every losing sale from public trade data. The same open-source rules run the payouts."
        />
        <div className={two}>
          <TierCard />
          <div className="grid min-w-0 content-start gap-5">
            <PotCard payoutBps={payoutBps} />
            <CapsCard payoutBps={payoutBps} />
          </div>
        </div>
      </section>

      {/* per coin, and the live feed */}
      <section className={two}>
        <CoinPots coins={status?.coins} loading={isLoading} error={isError} solUsd={solUsd} />
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            icon={
              <IconTile color={MINT} size={40}>
                <Timer size={18} />
              </IconTile>
            }
            title="Recent payouts"
            sub="Every covered loss, newest first, paid from the protection wallet."
          />
          <div className="mt-3 border-t border-line px-5 sm:px-6">
            {isError ? (
              <ErrorState className="my-5" detail={`Payouts come from the ${brand.name} API, which isn't reachable right now.`} />
            ) : isLoading ? (
              <Skeleton className="my-5 h-40" />
            ) : !status?.recent?.length ? (
              <EmptyState className="my-5" title="No payouts yet" detail="The first one goes out about a minute after someone sells a coin at a loss." />
            ) : (
              <PayoutList items={status.recent} solUsd={solUsd} images={images} showWallet initial={8} />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- the fund

function FundHero({ status, error, solUsd }: { status?: ProtectionStatus; error: boolean; solUsd: number }) {
  const fund = status?.fundSol;
  const tiles = [
    { label: "Paid out so far", value: status?.totalPaidSol, sub: undefined as string | undefined },
    { label: "Last 24 hours", value: status?.paid24hSol, sub: undefined },
    {
      label: "Waiting to send",
      value: status?.owedSol,
      sub: status?.waitingLosses
        ? `+ ${status.waitingLosses} loss${status.waitingLosses === 1 ? "" : "es"} waiting for the fund`
        : `sent once a wallet is owed ${PROTECTION_MIN_PAYOUT_SOL} SOL`,
    },
  ];
  return (
    <div className="ring-spectrum shadow-card relative min-w-0 overflow-hidden rounded-[32px] p-6 sm:p-8">
      <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full opacity-20 blur-3xl" style={{ background: MINT }} aria-hidden />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconTile color={MINT} size={40}>
              <ShieldCheck size={18} />
            </IconTile>
            <Eyebrow>Fund balance</Eyebrow>
          </div>
          {status?.wallet && (
            <a
              href={explorerAddress(status.wallet)}
              target="_blank"
              rel="noreferrer"
              className="num inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-sunk/70 px-3.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Wallet {short(status.wallet)} <ArrowUpRight size={12} />
            </a>
          )}
        </div>

        <div className="num font-display mt-6 text-5xl leading-none font-semibold sm:text-6xl">
          {fund !== undefined && solUsd > 0 ? (
            <AnimatedNumber value={fund * solUsd} format={usd} />
          ) : error ? (
            <span className="text-faint">—</span>
          ) : (
            <Skeleton className="inline-block h-12 w-44 align-middle" />
          )}
        </div>
        <p className="num mt-3 text-sm text-muted">
          {fund !== undefined ? `${sol(fund)} ready for the next losing sale` : error ? `The ${brand.name} API isn't reachable right now.` : " "}
        </p>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {tiles.map((s, i) => (
            <div key={s.label} className={i === 2 ? "col-span-2 min-w-0 bg-sunk p-4 sm:col-span-1" : "min-w-0 bg-sunk p-4"}>
              <div className="text-xs text-muted">{s.label}</div>
              <div className="num font-display mt-1.5 text-2xl font-semibold">
                {s.value !== undefined ? usd(s.value * solUsd) : <Skeleton className="inline-block h-6 w-16 align-middle" />}
              </div>
              <div className="num mt-0.5 text-[11px] leading-snug text-faint">{s.sub ?? (s.value !== undefined ? sol(s.value) : " ")}</div>
            </div>
          ))}
        </div>

        <p className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: MINT }} />
          <span>
            Funded by half of every trading fee on every coin, converted to SOL after Meteora&apos;s share. The other half goes to the{" "}
            <Link href="/otc" className="font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-sky">
              OTC reserve
            </Link>
            .
          </span>
        </p>
      </div>
    </div>
  );
}

/** The most recent payout, so the fund reads as something that pays, not something to wait for. */
function LatestPayout({
  loaded,
  error,
  latest,
  solUsd,
  images,
}: {
  loaded: boolean;
  error: boolean;
  latest?: CoveredLoss;
  solUsd: number;
  images: Map<string, string>;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Latest payout</Eyebrow>
        {latest && (
          <span className="font-display inline-flex items-center gap-2 text-xs font-semibold text-up">
            <span className="live-dot" />
            Live
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-4">
        {latest && <CoinAvatar src={images.get(latest.coin)} symbol={latest.symbol} seed={latest.coin} size={44} />}
        <div className="min-w-0">
          <div className="num font-display text-3xl leading-none font-semibold">
            {!loaded && !error ? (
              <Skeleton className="inline-block h-8 w-28 align-middle" />
            ) : latest ? (
              <span className="text-up">+{usd(latest.amountSol * solUsd)}</span>
            ) : (
              "None yet"
            )}
          </div>
          <div className="mt-2 text-[13px] text-muted">
            {latest ? (
              <>
                <Link href={`/token/${latest.coin}`} className="font-semibold text-fg transition-colors hover:text-accent-2">
                  ${latest.symbol}
                </Link>{" "}
                seller <span className="num">{short(latest.wallet)}</span> · <span className="num">{age(latest.t)} ago</span>
              </>
            ) : (
              "Losing sales are paid about a minute after they happen."
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function YourPayouts({ images }: { images: Map<string, string> }) {
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const { data, isLoading, isError } = useWalletSummary(address);

  if (!address)
    return (
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <IconTile color={MINT} size={44}>
            <ShieldCheck size={20} />
          </IconTile>
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold">Your payouts</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">Connect to see your covered losses. Payouts arrive in your wallet on their own.</p>
          </div>
        </div>
        <Button className="mt-5 w-full" size="lg" onClick={openWallet}>
          Connect wallet
        </Button>
      </Card>
    );

  const p = data?.protection;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <Eyebrow>Your payouts</Eyebrow>
          <div className="num font-display mt-3 text-3xl leading-none font-semibold">
            {p ? usd(p.receivedSol * solUsd) : isError ? "—" : <Skeleton className="inline-block h-8 w-24 align-middle" />}
          </div>
          <div className="num mt-2 text-xs text-muted">
            {p ? `${sol(p.receivedSol)} received${p.owedSol > 0 ? ` · ${usd(p.owedSol * solUsd)} on its way` : ""}` : " "}
          </div>
        </div>
        <IconTile color={MINT} size={40}>
          <ShieldCheck size={18} />
        </IconTile>
      </div>
      <div className="border-t border-line px-5 sm:px-6">
        {isError ? (
          <p className="py-4 text-xs text-muted">Payouts come from the {brand.name} API, which isn&apos;t reachable right now.</p>
        ) : isLoading || !p ? (
          <Skeleton className="my-4 h-20" />
        ) : p.losses.length === 0 ? (
          <p className="my-4 rounded-2xl bg-sunk px-4 py-3 text-xs text-muted">No losing sales. That&apos;s the good outcome.</p>
        ) : (
          <PayoutList items={p.losses.slice(0, 40)} solUsd={solUsd} images={images} initial={4} />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the rules

function TierCard() {
  const tiers = protectionTiers.map((t) => ({ label: t.label, bps: t.coverageBps }));
  // a worked example from the live tiers: two hours held, 1 SOL below entry
  const exBps = coverageBpsForHold(2 * 3600);
  return (
    <Card className="min-w-0">
      <CardHeader
        icon={
          <IconTile color={MINT} size={40}>
            <Clock size={18} />
          </IconTile>
        }
        title="1 · Hold time sets the rate"
        sub="Realized losses only: you sold below your average entry. The longer you held, the more of the loss is covered."
      />
      <div className="px-5 pt-6 pb-6 sm:px-6">
        <ul className="space-y-4" aria-label="Coverage by hold time">
          {tiers.map((t) => (
            <TierBar key={t.label} label={t.label} bps={t.bps} />
          ))}
        </ul>
        <div className="mt-5 border-t border-dashed border-line-strong pt-5">
          <ul aria-label="Coverage for rug-flagged coins">
            <TierBar label="Rug-flagged" sub="any hold time" bps={RUG_COVERAGE_BPS} />
          </ul>
        </div>
        <p className="mt-5 text-center text-[11px] text-faint">
          of your loss, &quot;up to&quot;: capped at {PROTECTION_CAP_X_TAX}× the tax you paid and {bps(PROTECTION_PAYOUT_BPS)} of the coin&apos;s pot
        </p>
        <div className="mt-5 rounded-2xl bg-sunk px-4 py-3.5 text-[13px] leading-relaxed text-muted">
          <span className="font-display font-semibold text-fg">Example. </span>
          You held for 2 hours and sold 1 SOL below your entry. The rate is {bps(exBps)}, so up to{" "}
          <span className="num font-semibold text-up">{sol(exBps / 10_000)}</span> comes back to your wallet about a minute later, inside the caps.
        </div>
      </div>
    </Card>
  );
}

function TierBar({ label, sub, bps: b }: { label: string; sub?: string; bps: number }) {
  const pct = b / 100;
  return (
    <li
      className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3 sm:grid-cols-[112px_minmax(0,1fr)_52px]"
      title={`${label}: up to ${pct}% of the loss`}
    >
      <span className="min-w-0">
        <span className="block text-[13px] leading-tight font-semibold">{label}</span>
        {sub && <span className="block text-[11px] text-faint">{sub}</span>}
      </span>
      {/* a 0–100% track, so the bars read as a share of the loss */}
      <span className="h-3 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(pct, 0)}%`, background: MINT, boxShadow: `0 0 12px -2px ${MINT}` }} />
      </span>
      <span className="num font-display text-right text-base font-semibold">{pct}%</span>
    </li>
  );
}

function PotCard({ payoutBps }: { payoutBps: number }) {
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconTile color={MINT} size={40}>
          <Coins size={18} />
        </IconTile>
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold">2 · Each coin pays from its own pot</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            A coin&apos;s pot is what its fees put into the fund, minus what it has paid out. One payout takes at most {bps(payoutBps)} of what&apos;s left, so
            a single loss can&apos;t empty it, and coins that paid little cover little.
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-nest-soft px-4 py-3">
        <Egg size={16} className="mt-0.5 shrink-0 text-nest" />
        <p className="text-[12px] leading-relaxed text-muted">
          <span className="font-semibold text-nest">The {brand.nest}.</span> Copies of a coin send their protection half to their {brand.nest}&apos;s leader, so
          a leader&apos;s pot grows from its copies too.
        </p>
      </div>
    </Card>
  );
}

function CapsCard({ payoutBps }: { payoutBps: number }) {
  const rules = [
    `Your payouts on one coin add up to at most ${PROTECTION_CAP_X_TAX}× the tax you paid on it.`,
    `One payout takes at most ${bps(payoutBps)} of its coin's pot.`,
    "Sent automatically, about a minute after the sale. Nothing to claim, nothing expires.",
    "Creators selling their own coin aren't covered.",
  ];
  return (
    <Card className="min-w-0 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconTile color={MINT} size={40}>
          <Scale size={18} />
        </IconTile>
        <h3 className="font-display pt-2 text-[17px] font-semibold">3 · Caps keep it solvent</h3>
      </div>
      <ul className="mt-4 space-y-2.5">
        {rules.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
            <Check size={15} className="mt-0.5 shrink-0 text-up" />
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3">
        <p className="text-xs text-faint">Coverage is discretionary and capped. It is not insurance.</p>
        <Link href="/docs#protection" className="font-display inline-flex h-10 items-center gap-1.5 text-[13px] font-semibold text-accent-2 hover:underline">
          Full rules <ArrowRight size={14} />
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- per coin

function CoinPots({ coins, loading, error, solUsd }: { coins?: CoinProtection[]; loading: boolean; error: boolean; solUsd: number }) {
  const [all, setAll] = useState(false);
  const shown = coins ? (all ? coins : coins.slice(0, 8)) : [];
  return (
    <Card className="min-w-0 self-start overflow-hidden">
      <CardHeader
        icon={
          <IconTile color={MINT} size={40}>
            <Coins size={18} />
          </IconTile>
        }
        title="Coin pots"
        sub={`What each coin paid into the fund, what it paid its sellers, and what's left. A ${brand.nest} leader's pot includes what its copies sent it.`}
      />
      <div className="mt-5">
        {error ? (
          <div className="px-5 pb-6 sm:px-6">
            <ErrorState detail={`Per-coin pots come from the ${brand.name} API, which isn't reachable right now.`} />
          </div>
        ) : loading ? (
          <div className="px-5 pb-6 sm:px-6">
            <Skeleton className="h-56" />
          </div>
        ) : !coins || coins.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState title="No pots yet" detail="A coin gets a pot as soon as its first fees reach the protection fund." />
          </div>
        ) : (
          <>
            <div className="thin-scrollbar overflow-x-auto border-t border-line">
              <table className="w-full min-w-[580px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="eyebrow sticky left-0 z-10 bg-elev py-3 pr-3 pl-5 sm:pl-6">Coin</th>
                    <th className="eyebrow px-3 py-3 text-right">Paid in</th>
                    <th className="eyebrow px-3 py-3 text-right">Paid out</th>
                    <th className="eyebrow px-3 py-3">Pot left</th>
                    <th className="eyebrow py-3 pr-5 pl-3 text-right sm:pr-6">Next payout up to</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const left = c.contributedSol > 0 ? Math.min(1, c.potSol / c.contributedSol) : 0;
                    return (
                      <tr key={c.coin} className="group border-b border-line transition-colors last:border-0 hover:bg-elev-2">
                        <td className="sticky left-0 z-10 bg-elev py-3.5 pr-3 pl-5 transition-colors group-hover:bg-elev-2 sm:pl-6">
                          <Link href={`/token/${c.coin}`} className="flex min-h-10 items-center gap-3 transition-colors hover:text-accent-2">
                            <CoinAvatar src={c.image} symbol={c.symbol} seed={c.coin} size={32} />
                            <span className="font-display max-w-[110px] truncate font-semibold">${c.symbol}</span>
                          </Link>
                        </td>
                        <td className="num px-3 py-3.5 text-right">{usd(c.contributedSol * solUsd)}</td>
                        <td className="num px-3 py-3.5 text-right text-muted">{c.paidSol > 0 ? usd(c.paidSol * solUsd) : "—"}</td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]">
                              <div className="h-full rounded-full" style={{ width: `${left * 100}%`, background: MINT }} />
                            </div>
                            <span className="num text-xs">{usd(c.potSol * solUsd)}</span>
                          </div>
                        </td>
                        <td className="num py-3.5 pr-5 pl-3 text-right font-semibold sm:pr-6">{usd(c.maxPayoutSol * solUsd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {coins.length > 8 && (
              <div className="border-t border-line px-5 py-2 sm:px-6">
                <Button variant="ghost" size="sm" className="h-10" onClick={() => setAll((a) => !a)}>
                  {all ? "Show fewer" : `Show all ${coins.length} coins`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
