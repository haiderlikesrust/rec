"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { brand, type ProtectionStatus, type WalletSummary } from "@gantry/shared";
import { useProtection, useSolUsd, useWalletSummary } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { short, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { AnimatedNumber, EmptyState, ErrorState, Panel, PanelBody, PanelHeader, Segmented, Skeleton, Stat } from "@/components/ui";
import { Coverage } from "./Coverage";
import { Disclosure } from "./Disclosure";
import { PayoutEstimator } from "./PayoutEstimator";
import { PayoutsTable } from "./PayoutsTable";
import { PotsTable } from "./PotsTable";

const pending = <Skeleton className="h-6 w-20" />;

/** The fund page under its header: up to three numbers, what is covered beside the latest payouts, then two closed extras. */
export function ShieldView() {
  const { data: status, isLoading, isError } = useProtection();
  const solUsd = useSolUsd();
  const wallet = useAddress();
  const mine = useWalletSummary(wallet);
  const images = useMemo(() => new Map((status?.coins ?? []).map((c) => [c.coin, c.image])), [status]);
  const ready = !!status && solUsd > 0;
  const idle = isError ? "—" : pending;
  const paid = mine.data?.protection;

  return (
    <>
      <div className="flex flex-wrap gap-x-14 gap-y-5">
        <Stat label="In the fund" value={ready ? <AnimatedNumber value={status.fundSol * solUsd} format={usd} /> : idle} />
        <Stat label="Paid out so far" value={ready ? usd(status.totalPaidSol * solUsd) : idle} />
        {wallet && (
          <Stat
            label="Paid to you"
            value={paid && solUsd > 0 ? usd(paid.receivedSol * solUsd) : mine.isError ? "—" : pending}
            sub={paid && paid.owedSol > 0 ? `${usd(paid.owedSol * solUsd)} more on the way` : undefined}
          />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Coverage payoutBps={status?.payoutBps} />
        <RecentPayouts
          status={status}
          loading={isLoading}
          failed={isError}
          solUsd={solUsd}
          images={images}
          wallet={wallet}
          mine={mine.data}
          mineLoading={mine.isLoading}
          mineFailed={mine.isError}
        />
      </div>

      <Disclosure title="Estimate a payout">
        <PayoutEstimator solUsd={solUsd} />
      </Disclosure>

      <Disclosure title="Fund by coin">
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Each coin&apos;s payouts come out of the fees its own trades paid into the fund.{" "}
          <Link href={`${brand.docsPath}#fees`} className="link">
            How fees are split
          </Link>
          {status && (
            <>
              {" · "}
              <a href={explorerAddress(status.wallet)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                Fund wallet <span className="font-mono text-[13px]">{short(status.wallet)}</span> <ArrowUpRight size={14} aria-hidden />
              </a>
            </>
          )}
        </p>
        <div className="-mx-[var(--card-pad)] mt-3">
          {isError ? (
            <p className="px-[var(--card-pad)] text-[15px] text-ink-2">This list didn&apos;t load. It retries on its own.</p>
          ) : !status ? (
            <Skeleton className="mx-[var(--card-pad)] h-40" />
          ) : status.coins.length === 0 ? (
            <p className="px-[var(--card-pad)] text-[15px] text-ink-2">No coin has paid into the fund yet.</p>
          ) : (
            <PotsTable coins={status.coins} solUsd={solUsd} />
          )}
        </div>
      </Disclosure>
    </>
  );
}

type Scope = "all" | "mine";

/** The latest payouts from the fund; a connected wallet can switch to its own losing sales. */
function RecentPayouts({
  status,
  loading,
  failed,
  solUsd,
  images,
  wallet,
  mine,
  mineLoading,
  mineFailed,
}: {
  status?: ProtectionStatus;
  loading: boolean;
  failed: boolean;
  solUsd: number;
  images: Map<string, string>;
  wallet?: string;
  mine?: WalletSummary;
  mineLoading: boolean;
  mineFailed: boolean;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const own = !!wallet && scope === "mine";
  const unreachable = `${brand.name} isn't answering right now. It retries on its own.`;

  let body: ReactNode;
  if (own) {
    const losses = mine?.protection.losses ?? [];
    body = mineFailed ? (
      <PanelBody>
        <ErrorState title="Your payouts didn't load" detail={unreachable} />
      </PanelBody>
    ) : mineLoading || !mine ? (
      <PanelBody>
        <Skeleton className="h-40" />
      </PanelBody>
    ) : losses.length === 0 ? (
      <PanelBody>
        <EmptyState title="No losses on this wallet" detail="If you sell a coin for less than you paid, the sale shows up here about a minute later." />
      </PanelBody>
    ) : (
      <PayoutsTable caption="Your losing sales and what was paid back" items={losses} solUsd={solUsd} images={images} notes share />
    );
  } else {
    const all = status?.recent ?? [];
    body = failed ? (
      <PanelBody>
        <ErrorState title="Payouts didn't load" detail={unreachable} />
      </PanelBody>
    ) : loading ? (
      <PanelBody>
        <Skeleton className="h-64" />
      </PanelBody>
    ) : all.length === 0 ? (
      <PanelBody>
        <EmptyState title="Nothing paid out yet" detail="The first payout shows up here about a minute after the sale it covers." />
      </PanelBody>
    ) : (
      <PayoutsTable caption="Latest payouts from the fund" items={all} solUsd={solUsd} images={images} />
    );
  }

  return (
    <Panel as="section">
      <PanelHeader
        as="h2"
        label="Recent payouts"
        aside={
          wallet && (
            <Segmented
              size="sm"
              aria-label="Whose payouts"
              value={own ? "mine" : "all"}
              onChange={setScope}
              options={[
                { value: "all", label: "All" },
                { value: "mine", label: "Mine" },
              ]}
            />
          )
        }
      />
      {body}
    </Panel>
  );
}
