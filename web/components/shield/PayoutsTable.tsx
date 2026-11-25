"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PROTECTION_CAP_X_TAX, protectionTiers, type CoveredLoss } from "@gantry/shared";
import { explorerTx } from "@/lib/explorer";
import { age, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Button, DataTable, Td, Th } from "@/components/ui";
import { payoutPath } from "./payout";

/** A quiet action at the end of a row, as in the holdings table. */
const quiet = "text-[13px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline";

/** The shortest hold that earns anything, in minutes (the first tier above 0%). */
const minHoldMinutes = (protectionTiers.find((t) => t.coverageBps > 0)?.minHold ?? 0) / 60;

/** Why a loss paid less than its rate, or where its payout is, in a few words. Null for a payout sent in full. */
function payoutNote(l: CoveredLoss) {
  if (l.tierBps === 0) return `held under ${minHoldMinutes} min`;
  if (l.status === "waiting") return "waiting on the fund";
  if (l.limit === "tax") return l.amountSol > 0 ? `capped at ${PROTECTION_CAP_X_TAX}× your fees` : `${PROTECTION_CAP_X_TAX}× your fees already paid back`;
  if (l.limit === "pot") return l.amountSol > 0 ? "capped by the coin's pot" : "the coin's pot is empty";
  if (l.status === "owed") return "on the way";
  if (l.status === "sending") return "sending now";
  return null;
}

/**
 * Losing sales, newest first: the coin, what was lost, what the fund paid back, and when. A paid amount is the link
 * to that payout's own page. `notes` adds a few words under a payout that came out lower than its rate or has not
 * been sent yet, and `share` adds a quiet "Share" to each paid row: both are for a wallet's own list.
 */
export function PayoutsTable({
  items,
  solUsd,
  images,
  notes = false,
  share = false,
  initial = 8,
  caption,
}: {
  items: CoveredLoss[];
  solUsd: number;
  /** coin mint → image, when the caller has them */
  images?: Map<string, string>;
  notes?: boolean;
  share?: boolean;
  /** rows shown before "show all" */
  initial?: number;
  caption: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <>
      <DataTable caption={caption}>
        <thead>
          <tr>
            <Th>Coin</Th>
            <Th num>Loss</Th>
            <Th num>Paid back</Th>
            <Th num className="hidden sm:table-cell">
              When
            </Th>
            {share && (
              <Th>
                <span className="sr-only">Share</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => {
            const note = notes ? payoutNote(l) : null;
            const paid = l.amountSol > 0;
            const hasTx = l.status === "sent" && !!l.tx && l.tx !== "demo";
            return (
              <tr key={l.id}>
                <Td>
                  <Link href={`/token/${l.coin}`} className="inline-flex items-center gap-2.5 font-medium text-ink hover:underline">
                    <CoinAvatar src={images?.get(l.coin)} symbol={l.symbol} seed={l.coin} size={24} />
                    {l.symbol}
                  </Link>
                </Td>
                <Td num className="text-ink-2">
                  {usd(l.lossSol * solUsd)}
                </Td>
                <Td num className={note ? "py-2" : undefined}>
                  {paid ? (
                    <Link href={payoutPath(l.id)} aria-label={`${usd(l.amountSol * solUsd)} paid back on ${l.symbol}: open this payout`} className="text-gain hover:underline">
                      +{usd(l.amountSol * solUsd)}
                    </Link>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                  {note && <span className="ml-auto block text-[12px] leading-snug whitespace-normal text-ink-3 max-sm:max-w-[7rem]">{note}</span>}
                </Td>
                <Td num className="hidden text-ink-3 sm:table-cell">
                  {hasTx ? (
                    <a
                      href={explorerTx(l.tx!)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Payout transaction for ${l.symbol}, ${age(l.t)} ago`}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {age(l.t)} ago <ArrowUpRight size={13} aria-hidden />
                    </a>
                  ) : (
                    `${age(l.t)} ago`
                  )}
                </Td>
                {share && (
                  <Td align="right" className="w-px max-sm:pl-0">
                    {paid && (
                      <Link href={payoutPath(l.id)} aria-label={`Share your ${l.symbol} payout`} className={quiet}>
                        Share
                      </Link>
                    )}
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {items.length > initial && (
        <div className="px-[calc(var(--card-pad)-12px)] pb-3">
          <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        </div>
      )}
    </>
  );
}
