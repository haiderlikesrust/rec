"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PROTECTION_CAP_X_TAX, PROTECTION_PAYOUT_BPS, type CoveredLoss } from "@cook/shared";
import { explorerTx } from "@/lib/explorer";
import { age, bps, duration, short, usd } from "@/lib/format";
import { Badge } from "@/components/ui";

/** Why a loss paid what it did, in a few words. */
export function payoutNote(l: CoveredLoss) {
  if (l.limit === "round") return "from a 6-day round";
  if (l.tierBps === 0) return "sold within 5 min of buying";
  if (l.status === "waiting") return "paid as soon as the fund can cover it";
  if (l.limit === "tax") return l.amountSol > 0 ? `capped at ${PROTECTION_CAP_X_TAX}× tax paid` : `${PROTECTION_CAP_X_TAX}× tax cap reached`;
  if (l.limit === "pot") return l.amountSol > 0 ? `capped at ${bps(PROTECTION_PAYOUT_BPS)} of the coin's pot` : "the coin's pot is empty";
  return null;
}

/** Covered losses, newest first: what each one lost, the rate it earned and the payout's status. */
export function PayoutList({ items, solUsd, showWallet = false }: { items: CoveredLoss[]; solUsd: number; showWallet?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((l) => {
        const note = payoutNote(l);
        return (
          <li key={l.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <Link href={`/token/${l.coin}`} className="font-medium hover:text-accent">
                  ${l.symbol}
                </Link>
                {showWallet && <span className="num truncate text-xs text-faint">{short(l.wallet)}</span>}
              </div>
              <div className="num mt-0.5 text-[11px] text-muted">
                lost {usd(l.lossSol * solUsd)} · held {duration(l.holdSeconds)} · rate {bps(l.tierBps)}
              </div>
              {note && <div className="mt-0.5 text-[11px] text-faint">{note}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className={l.amountSol > 0 ? "num text-sm font-medium text-up" : "num text-sm text-faint"}>
                {l.amountSol > 0 ? `+${usd(l.amountSol * solUsd)}` : "—"}
              </div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="num text-[11px] text-faint">{age(l.t)}</span>
                {(l.amountSol > 0 || (l.status === "waiting" && l.tierBps > 0)) && <PayoutStatus l={l} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PayoutStatus({ l }: { l: CoveredLoss }) {
  if (l.status === "sent")
    return l.tx && l.tx !== "demo" ? (
      <a href={explorerTx(l.tx)} target="_blank" rel="noreferrer">
        <Badge tone="up">
          Paid <ArrowUpRight size={10} />
        </Badge>
      </a>
    ) : (
      <Badge tone="up">Paid</Badge>
    );
  if (l.status === "waiting") return <Badge>Pending</Badge>;
  return <Badge tone="accent">{l.status === "sending" ? "Sending" : "Queued"}</Badge>;
}
