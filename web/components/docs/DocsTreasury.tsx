"use client";

import { ArrowLeftRight, ArrowUpRight, Egg, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { brand, type TreasuryWallet } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { useStats } from "@/lib/data";
import { explorerAddress } from "@/lib/explorer";
import { short, sol, usd } from "@/lib/format";
import { IconTile, Skeleton } from "@/components/ui";

type Slot = { key: "fees" | "otc" | "protection" | "entries"; icon: LucideIcon; color: string; title: string; body: string };

const slots: Slot[] = [
  {
    key: "fees",
    icon: Wallet,
    color: "var(--violet)",
    title: "Fee wallet",
    body: "Claims every pool's fees (and owns the locked LP after graduation), converts them to SOL and splits them in half.",
  },
  {
    key: "otc",
    icon: ArrowLeftRight,
    color: bucketColor.otcReserve,
    title: "OTC reserve",
    body: "Holds the SOL you can sell into, co-signs every OTC trade and burns every coin it buys.",
  },
  {
    key: "protection",
    icon: ShieldCheck,
    color: bucketColor.protection,
    title: brand.landing,
    body: "Holds the SOL for loss cover and sends every payout, with nothing to claim.",
  },
  {
    key: "entries",
    icon: Egg,
    color: "var(--nest)",
    title: `${brand.nest} entries wallet`,
    body: `Holds the coins copies pay as their ${brand.nest} entry until they're airdropped to the leader's holders.`,
  },
];

const KNOWN = new Set<string>(["fees", "otc", "protection"]);

/** The match for a slot: by role, and the entries wallet is the one role that isn't fees, OTC or protection. */
function walletFor(slot: Slot["key"], wallets: TreasuryWallet[]) {
  return slot === "entries" ? wallets.find((w) => !KNOWN.has(w.role)) : wallets.find((w) => w.role === slot);
}

/** The four backend-controlled wallets, what each does, and (when the API answers) their live balances and addresses. */
export function DocsTreasury() {
  const { data: s, isError } = useStats();
  const wallets = s?.treasury ?? [];
  const solUsd = s?.solUsd ?? 0;

  return (
    <div className="mt-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const w = walletFor(slot.key, wallets);
          return (
            <div key={slot.key} className="flex flex-col rounded-2xl bg-sunk p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
              <div className="flex items-center gap-3">
                <IconTile color={slot.color} size={36}>
                  <slot.icon size={17} />
                </IconTile>
                <span className="font-display text-[15px] font-semibold text-fg">{slot.title}</span>
              </div>
              <div className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted">{slot.body}</div>
              <div className="mt-4 border-t border-line pt-3">
                {w ? (
                  <a
                    href={explorerAddress(w.address)}
                    target="_blank"
                    rel="noreferrer"
                    title={w.label}
                    className="group flex items-center justify-between gap-3 rounded-xl !text-fg !no-underline"
                  >
                    <span className="min-w-0">
                      <span className="num block truncate text-[13px] font-semibold">{usd(w.sol * solUsd)}</span>
                      <span className="num block truncate text-[11px] text-faint">
                        {sol(w.sol)} · {short(w.address)}
                      </span>
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elev text-faint transition-colors group-hover:text-fg">
                      <ArrowUpRight size={14} />
                    </span>
                  </a>
                ) : !s && !isError ? (
                  <Skeleton className="h-9 w-40" />
                ) : (
                  <span className="text-[12px] text-faint">
                    {isError ? `Live balance unavailable: the ${brand.name} API isn't reachable right now.` : "Appears here once the backend is configured."}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
