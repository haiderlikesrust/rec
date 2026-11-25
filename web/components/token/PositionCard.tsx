"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { brand, coverageBpsForHold, otcPolicy, protectionTiers, type CoinDetail } from "@gantry/shared";
import { useSolUsd, useWalletSummary } from "@/lib/data";
import { bps, price, tokens, units, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { ButtonLink, Panel, PanelBody, Row } from "@/components/ui";

/** A result in USD with its sign in front: +$12.40, −$3.10, $0. */
const signedUsd = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${usd(Math.abs(v))}`;

/** "5 minutes", "6 hours": a waiting time in plain words. */
const wait = (seconds: number) => {
  const n = seconds >= 3600 ? seconds / 3600 : seconds / 60;
  return `${n} ${seconds >= 3600 ? "hour" : "minute"}${n === 1 ? "" : "s"}`;
};

/**
 * What the connected wallet holds of this coin: the amount, what it is worth and the result so far, then the two
 * ways out besides the market: what the protection fund would pay back on a loss, and the OTC reserve's price.
 * It renders nothing for a wallet that holds none.
 */
export function PositionCard({ coin, className }: { coin: CoinDetail; className?: string }) {
  const address = useAddress();
  const { data } = useWalletSummary(address);
  const solUsd = useSolUsd();

  const pos = address ? data?.positions.find((p) => p.coin.address === coin.address) : undefined;
  if (!pos || units(pos.balance, coin.decimals) === 0) return null;

  const basis = units(pos.costBasis, coin.quote.decimals);
  const pnlPct = basis > 0 ? (pos.unrealized / basis) * 100 : 0;
  const up = pos.unrealizedUsd >= 0;

  const hold = pos.firstBuyAt ? Date.now() / 1000 - pos.firstBuyAt : 0;
  const coverBps = coverageBpsForHold(hold);
  const firstCover = protectionTiers.find((t) => t.coverageBps > 0);

  const otc = coin.otc;
  const otcOpen = otc.twapReady && otc.sellPriceSol > 0 && otc.sellLimitSol > 0;

  return (
    <Panel as="section" aria-label={`Your ${coin.symbol}`} className={className}>
      <PanelBody className="space-y-4">
        <div>
          <h2 className="display-3">Your position</h2>
          <div className="mt-1.5">
            <Row label="You hold" value={`${tokens(pos.balance, coin.decimals)} ${coin.symbol}`} />
            <Row label="Value" value={usd(pos.valueUsd)} />
            <Row
              label={up ? "Profit" : "Loss"}
              value={
                <span className={up ? "text-gain" : "text-loss"}>
                  {signedUsd(pos.unrealizedUsd)}
                  {basis > 0 && ` (${pnlPct >= 0 ? "+" : "−"}${Math.abs(pnlPct).toFixed(1)}%)`}
                </span>
              }
            />
          </div>
        </div>

        <div className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
          <p>
            <Link href="/shield" className="link">
              {brand.shield}
            </Link>{" "}
            {coverBps > 0 ? (
              <>
                covers up to <span className="num text-ink">{bps(coverBps)}</span> of a loss right now.
              </>
            ) : (
              <>cover starts after {wait(firstCover?.minHold ?? 0)} of holding.</>
            )}
          </p>
          <p>
            {otcOpen ? (
              <>
                OTC reserve price:{" "}
                <span className="num text-ink">{solUsd > 0 ? `$${price(otc.sellPriceSol * solUsd)}` : price(otc.sellPriceSol, "SOL")}</span>, no
                slippage.
              </>
            ) : otc.twapReady ? (
              "The OTC reserve is not buying this coin right now."
            ) : (
              `The OTC reserve opens after ${wait(otcPolicy.twapSeconds)} of trading.`
            )}
          </p>
        </div>

        {otcOpen && (
          <ButtonLink href={`/otc?coin=${coin.address}`} variant="secondary" size="sm" block>
            Sell to the OTC reserve <ArrowRight size={14} aria-hidden />
          </ButtonLink>
        )}
      </PanelBody>
    </Panel>
  );
}
