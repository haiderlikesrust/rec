"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PROTECTION_CAP_X_TAX, PROTECTION_PAYOUT_BPS, type CoveredLoss } from "@cook/shared";
import { explorerTx } from "@/lib/explorer";
import { age, bps, duration, short, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Badge, Button } from "@/components/ui";

/** Why a loss paid what it did, in a few words. */
export function payoutNote(l: CoveredLoss) {
  if (l.limit === "round") return "carried over from an earlier payout round";
  if (l.tierBps === 0) return "sold within 5 min of buying";
  if (l.status === "waiting") return "paid as soon as the fund can cover it";
  if (l.limit === "tax") return l.amountSol > 0 ? `capped at ${PROTECTION_CAP_X_TAX}× tax paid` : `${PROTECTION_CAP_X_TAX}× tax cap reached`;
  if (l.limit === "pot") return l.amountSol > 0 ? `capped at ${bps(PROTECTION_PAYOUT_BPS)} of the coin's pot` : "the coin's pot is empty";
  return null;
}

/** Covered losses, newest first: what each one lost, the rate it earned and the payout's status. */
export function PayoutList({
  items,
  solUsd,
  showWallet = false,
  images,
  initial,
}: {
  items: CoveredLoss[];
  solUsd: number;
  showWallet?: boolean;
  /** coin mint → image, when the caller has them */
  images?: Map<string, string>;
  /** show this many until asked for the rest (lists don't scroll inside the page, which traps the thumb on phones) */
  initial?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = initial && !all ? items.slice(0, initial) : items;
  return (
    <>
      <ul className="divide-y divide-line">
        {shown.map((l) => {
          const note = payoutNote(l);
          const paid = l.amountSol > 0;
          return (
            <li key={l.id} className="flex items-center gap-3 py-3.5">
              <CoinAvatar src={images?.get(l.coin)} symbol={l.symbol} seed={l.coin} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {/* the link's hit area reaches into the row's padding so it's an easy tap */}
                  <Link
                    href={`/token/${l.coin}`}
                    className="font-display -my-2.5 truncate py-2.5 text-[15px] font-semibold transition-colors hover:text-accent-2"
                  >
                    ${l.symbol}
                  </Link>
                  {showWallet && <span className="num truncate text-xs text-faint">{short(l.wallet)}</span>}
                </div>
                <div className="num mt-0.5 text-[11px] leading-snug text-muted">
                  lost {usd(l.lossSol * solUsd)} · held {duration(l.holdSeconds)} · rate {bps(l.tierBps)}
                </div>
                {note && <div className="mt-0.5 text-[11px] leading-snug text-faint">{note}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className={paid ? "num font-display text-base font-semibold text-up" : "num text-sm text-faint"}>
                  {paid ? `+${usd(l.amountSol * solUsd)}` : "—"}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <span className="num text-[11px] text-faint">{age(l.t)}</span>
                  {(paid || (l.status === "waiting" && l.tierBps > 0)) && <PayoutStatus l={l} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {initial !== undefined && items.length > initial && (
        <div className="border-t border-line py-2">
          <Button variant="ghost" size="sm" className="-ml-4 h-10" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        </div>
      )}
    </>
  );
}

function PayoutStatus({ l }: { l: CoveredLoss }) {
  if (l.status === "sent")
    return l.tx && l.tx !== "demo" ? (
      <a
        href={explorerTx(l.tx)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Payout transaction for $${l.symbol}`}
        className="-my-2.5 -mr-1 inline-flex py-2.5 pr-1"
      >
        <Badge tone="up">
          Paid <ArrowUpRight size={10} />
        </Badge>
      </a>
    ) : (
      <Badge tone="up">Paid</Badge>
    );
  if (l.status === "waiting") return <Badge>Pending</Badge>;
  return <Badge tone="sky">{l.status === "sending" ? "Sending" : "Queued"}</Badge>;
}
