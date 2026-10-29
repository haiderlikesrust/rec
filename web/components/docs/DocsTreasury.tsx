"use client";

import { useStats } from "@/lib/data";
import { TreasuryWallets } from "@/components/home/StatsBento";

/** Live list of the backend-controlled wallets, for the docs. */
export function DocsTreasury() {
  const { data: s, isError } = useStats();
  if (isError) return <p className="text-xs">The wallet list comes from the Recur API, which isn&apos;t reachable right now.</p>;
  if (!s) return <p className="text-xs">Loading wallets…</p>;
  if (!s.treasury.length) return <p className="text-xs">Wallets appear here once the backend is configured.</p>;
  return <TreasuryWallets wallets={s.treasury} solUsd={s.solUsd} className="not-prose my-4" />;
}
