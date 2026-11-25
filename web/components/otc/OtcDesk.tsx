"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { brand, isSolanaAddress } from "@gantry/shared";
import { useOtc, useSolUsd, useStats, useWalletSummary } from "@/lib/data";
import { units, usd } from "@/lib/format";
import { useStickyTop } from "@/lib/useStickyTop";
import { useAddress } from "@/lib/wallet";
import { AnimatedNumber, Skeleton, Stat } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { AllCoins, YourCoins } from "./CoinList";
import { HowLimits } from "./HowLimits";
import { SellBox } from "./SellBox";

const pending = <Skeleton className="h-6 w-20" />;

/**
 * The reserve page under its header: two facts, then the coins on the left (the wallet's own first) and the sell box
 * on the right, which stays in view from 1024px. On a phone the sell box only shows once a coin is picked: it moves
 * above the lists and the page scrolls to it.
 */
export function OtcDesk() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(params.get("coin") ?? undefined);
  const [box, setBox] = useState<HTMLElement | null>(null);
  const top = useStickyTop(box, 88);
  const wallet = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const { data: stats } = useStats();
  const { data: otc, isLoading, isError } = useOtc();
  const summary = useWalletSummary(wallet);

  const rows = useMemo(() => [...(otc?.coins ?? [])].sort((a, b) => b.sellLimitSol - a.sellLimitSol), [otc]);
  const priceOf = useMemo(() => new Map(rows.map((r) => [r.coin, r])), [rows]);
  const held = useMemo(
    () => (summary.data?.positions ?? []).filter((p) => units(p.balance, p.coin.decimals) > 0).sort((a, b) => b.valueUsd - a.valueUsd),
    [summary.data],
  );
  const loaded = selected && isSolanaAddress(selected) ? selected : undefined;
  const priced = solUsd > 0;

  const pick = (coin: string) => {
    setSelected(coin);
    // under 1024px the sell box is not beside the lists: bring it into view once it has moved above them
    if (!window.matchMedia("(min-width: 1024px)").matches) requestAnimationFrame(() => box?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <>
      <div className="flex flex-wrap gap-x-14 gap-y-5">
        <Stat
          label="In the reserve"
          value={otc && priced ? <AnimatedNumber value={otc.reserveSol * solUsd} format={usd} /> : isError ? "—" : pending}
        />
        <Stat label="Paid to sellers" value={stats && priced ? usd(stats.otcPaidSol * solUsd) : isError ? "—" : pending} />
      </div>

      {!wallet ? (
        <p className="text-[15px] leading-relaxed text-ink-2">
          <button type="button" onClick={openWallet} className="link">
            Connect a wallet
          </button>{" "}
          to see the coins you can sell.
        </p>
      ) : summary.data && held.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-ink-2">
          This wallet holds no {brand.name} coins yet.{" "}
          <Link href="/" className="link">
            Browse coins
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {wallet && held.length > 0 && <YourCoins held={held} priceOf={priceOf} solUsd={solUsd} selected={loaded} onSelect={pick} />}

          <AllCoins
            rows={rows}
            dailyCapSol={otc?.walletDailyCapSol}
            solUsd={solUsd}
            selected={loaded}
            onSelect={pick}
            loading={isLoading}
            failed={isError}
          />
          <HowLimits reserveWallet={otc?.wallet} />
        </div>

        <aside
          ref={setBox}
          aria-label="Sell to the reserve"
          style={{ top }}
          className={clsx(
            "min-w-0 scroll-mt-[calc(var(--chrome-top)+1rem)] lg:sticky",
            // on a phone a picked coin goes above the lists, so arriving with ?coin= lands on it
            loaded ? "max-lg:order-first" : "max-lg:hidden",
          )}
        >
          <SellBox address={loaded} onClose={() => setSelected(undefined)} />
        </aside>
      </div>
    </>
  );
}
