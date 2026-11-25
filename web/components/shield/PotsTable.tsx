"use client";

import Link from "next/link";
import { useState } from "react";
import type { CoinProtection } from "@gantry/shared";
import { usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Button, DataTable, Td, Th } from "@/components/ui";

const INITIAL = 8;

/** Each coin's pot: what its fees paid into the fund, what its sellers were paid, and what is left. */
export function PotsTable({ coins, solUsd }: { coins: CoinProtection[]; solUsd: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? coins : coins.slice(0, INITIAL);
  return (
    <>
      <DataTable caption="The fund, coin by coin">
        <thead>
          <tr>
            <Th>Coin</Th>
            <Th num className="hidden sm:table-cell">
              Paid in
            </Th>
            <Th num>Paid out</Th>
            <Th num>Left</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.coin}>
              <Td>
                <Link href={`/token/${c.coin}`} className="inline-flex items-center gap-2.5 font-medium text-ink hover:underline">
                  <CoinAvatar src={c.image} symbol={c.symbol} seed={c.coin} size={24} />
                  {c.symbol}
                </Link>
              </Td>
              <Td num className="hidden text-ink-2 sm:table-cell">
                {usd(c.contributedSol * solUsd)}
              </Td>
              <Td num className="text-ink-2">
                {c.paidSol > 0 ? usd(c.paidSol * solUsd) : "—"}
              </Td>
              <Td num>{usd(c.potSol * solUsd)}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {coins.length > INITIAL && (
        <div className="px-[calc(var(--card-pad)-12px)] pt-1">
          <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? "Show fewer" : `Show all ${coins.length} coins`}
          </Button>
        </div>
      )}
    </>
  );
}
