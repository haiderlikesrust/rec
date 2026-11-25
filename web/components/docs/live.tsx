"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  CPMM_PROGRAM_ID,
  CPMM_TIER,
  GRADUATION_RAISE_USD,
  LAUNCHLAB_PROGRAM_ID,
  LP_LOCK_PROGRAM_ID,
  brand,
  explorer,
  quoteCatalog,
  type Cluster,
  type TreasuryWallet,
} from "@gantry/shared";
import { QuoteLogo } from "@/components/QuoteChip";
import { Badge, DataTable, Notice, Panel, Skeleton, Td, Th } from "@/components/ui";
import { bucketColor } from "@/lib/buckets";
import { useQuotes, useStats } from "@/lib/data";
import { bps, num, sol, usd } from "@/lib/format";
import { groupOf, groupPairs, mainPairs, transferFeeBps, type ListedPair } from "@/lib/pairs";
import { shownPrice, shownUnits, type QuoteUnit } from "@/lib/quoteUnits";
import { CLUSTER } from "./figures";

/*
 * The parts of the guide that read the running system: which pairs can launch right now, the three wallets with
 * their balances, the Raydium programs in use and the platform token's mint. Each one still shows something true
 * when the API is not answering.
 */

// Raydium's floor on a curve's raise for a quote, from the shared catalog's copy (the backend re-reads it on-chain)
const floorOf = (cluster: Cluster, mint: string) => quoteCatalog[cluster].find((q) => q.mint === mint)?.minRaise;
/** Raydium's floor, in whole raw units, as the number of tokens a wallet would show; "None" when it is next to nothing. */
const floorText = (min: number | undefined, q: QuoteUnit, symbol: string) => {
  if (min === undefined) return "—";
  const shown = shownUnits(min, q);
  return shown < 0.01 ? "None" : `${num(shown)} ${symbol}`;
};
const tokenPrice = (n: number) => (n >= 1 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : usd(n));
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One pair as the tables print it. Amounts and the price are per token as a wallet counts it (lib/quoteUnits). */
type PairRow = ListedPair & {
  mint: string;
  name: string;
  logo: string;
  /** the heading it is listed under (lib/pairs) */
  group: string;
  /** what the token's issuer takes on every transfer, in basis points; 0 for none */
  transferFee: number;
  usd: number;
  raise: number;
  floor: string;
  open: boolean;
  why: string | null;
};

/** A pair from the API or from the shared catalog, with the figures the two name differently passed in raw units. */
function pairRow(
  q: ListedPair & QuoteUnit & { name: string; logo: string },
  v: { mint: string; usd: number; raise: number; min: number | undefined; open: boolean; why: string | null },
): PairRow {
  return {
    mint: v.mint,
    symbol: q.symbol,
    name: q.name,
    logo: q.logo,
    category: q.category,
    issuer: q.issuer,
    group: groupOf(q),
    transferFee: transferFeeBps(q),
    usd: shownPrice(v.usd, q),
    raise: shownUnits(v.raise, q),
    floor: floorText(v.min, q, q.symbol),
    open: v.open,
    why: v.why,
  };
}

/**
 * The launch pairs, read from the running system. SOL and the main stablecoins come first, in a table that says
 * whether each is open, what a full curve raises on it and Raydium's minimum for that raise. Every other pair
 * follows under its group, one closed card per group with a count, so a catalog of hundreds of pairs stays out of
 * the way until someone asks for part of it.
 */
export function PairsTable() {
  const { data, isError } = useQuotes();
  const liveCluster = useStats().data?.cluster ?? CLUSTER;
  const live = !!data?.length;
  const cluster = live ? liveCluster : CLUSTER;
  const rows: PairRow[] = live
    ? data!.map((q) =>
        pairRow(q, { mint: q.address, usd: q.usdPerUnit, raise: q.graduationThreshold, min: floorOf(cluster, q.address), open: q.available, why: q.unavailableReason }),
      )
    : quoteCatalog[CLUSTER].map((q) => {
        const raise = GRADUATION_RAISE_USD / q.refUsd;
        return pairRow(q, { mint: q.mint, usd: q.refUsd, raise, min: q.minRaise, open: raise >= q.minRaise, why: null });
      });

  const main = mainPairs(rows);
  const groups = groupPairs(rows.filter((r) => !main.includes(r)));
  const grouped = groups.flatMap((g) => g.items);

  return (
    <div className="space-y-3">
      <Panel>
        <DataTable caption="SOL and the main stablecoins: whether launches are open, what a full curve raises on each and Raydium's minimum for that raise">
          <thead>
            <tr>
              <Th>Pair</Th>
              <Th num>A full curve raises</Th>
              <Th num className="hidden sm:table-cell">
                Raydium&apos;s minimum
              </Th>
            </tr>
          </thead>
          <tbody>
            {main.map((r) => (
              <tr key={r.mint}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <QuoteLogo symbol={r.symbol} logo={r.logo} size={20} />
                    <span className="font-medium text-ink">{r.symbol}</span>
                    {r.open ? <Badge tone="gain">Open</Badge> : <Badge>Paused</Badge>}
                  </span>
                </Td>
                <Td num className="py-2.5">
                  {num(r.raise, 2)} {r.symbol}
                  {/* on a phone the minimum sits under the raise instead of in a column of its own */}
                  <span className="block text-[13px] text-ink-3 sm:hidden">{r.floor === "None" ? "no minimum" : `minimum ${r.floor}`}</span>
                </Td>
                <Td num className="hidden text-ink-2 sm:table-cell">
                  {r.floor}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      {groups.map((g) => {
        const off = g.items.filter((r) => !r.open);
        return (
          <Panel key={g.name}>
            <details className="group/pairs">
              <summary className="focus-inset flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-[var(--card-pad)] py-4 text-[15px] [&::-webkit-details-marker]:hidden">
                <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open/pairs:rotate-90" />
                <span className="font-medium text-ink">{g.name}</span>
                <span className="num text-[13px] text-ink-3">{count(g.items.length, "pair")}</span>
                <span className="ml-auto">{off.length ? <Badge>{off.length} unavailable</Badge> : <Badge tone="gain">All open</Badge>}</span>
              </summary>
              {off.length > 0 && (
                <p className="px-[var(--card-pad)] pb-3 text-[13px] leading-relaxed text-ink-2">
                  {off.map((r) => r.why ?? `${r.symbol} can't take a launch right now.`).join(" ")}
                </p>
              )}
              <DataTable dense caption={`${g.name} pairs: the price of one token and what a full curve raises on each`}>
                <thead>
                  <tr>
                    <Th>Pair</Th>
                    <Th num className="hidden sm:table-cell">
                      Price
                    </Th>
                    <Th num>A full curve raises</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => {
                    const minimum = r.floor !== "None" && r.floor !== "—";
                    return (
                      <tr key={r.mint}>
                        <Td>
                          <span className="flex items-center gap-2.5">
                            <QuoteLogo symbol={r.symbol} logo={r.logo} size={20} />
                            <span className="font-medium text-ink">{r.symbol}</span>
                            <span className="max-w-[6rem] truncate text-ink-3 sm:max-w-[13rem]">{r.name}</span>
                            {r.transferFee > 0 && <Badge>{bps(r.transferFee)} transfer fee</Badge>}
                            {!r.open && <Badge>Unavailable</Badge>}
                          </span>
                        </Td>
                        <Td num className="hidden text-ink-2 sm:table-cell">
                          {r.usd > 0 ? tokenPrice(r.usd) : "—"}
                        </Td>
                        <Td num className={minimum ? "py-2" : undefined}>
                          {num(r.raise, 2)} {r.symbol}
                          {minimum && <span className="block text-[13px] text-ink-3">minimum {r.floor}</span>}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </details>
          </Panel>
        );
      })}

      <p className="text-[13px] leading-relaxed text-ink-3">
        {live
          ? `${count(rows.length, "pair")}, worked out from live prices.`
          : isError
            ? "Live prices could not be loaded, so this uses the reference prices built into the app."
            : "Showing reference prices until the live ones load."}
        {grouped.length > 0 &&
          (grouped.every((r) => r.floor === "None")
            ? " Raydium sets a minimum only on pairs in the first table."
            : grouped.some((r) => r.floor !== "None" && r.floor !== "—") && " Where Raydium sets a minimum on another pair, it is under its raise.")}
        {grouped.some((r) => r.transferFee > 0) && " A transfer fee is set by the token's issuer and comes on top of the trading fee."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- addresses

/** An address in full, linked to the explorer. The one place the guide uses the mono face. */
function AddressLine({ address, cluster }: { address: string; cluster: Cluster }) {
  return (
    <a
      href={explorer(cluster).address(address)}
      target="_blank"
      rel="noreferrer"
      className="link mt-2 inline-flex max-w-full items-start gap-1.5 font-mono text-xs break-all"
      aria-label={`${address} on Solscan (opens in a new tab)`}
    >
      <span>{address}</span>
      <ArrowUpRight size={12} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
    </a>
  );
}

function Entry({ name, dot, reading, children }: { name: ReactNode; dot?: string; reading?: ReactNode; children: ReactNode }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex items-center gap-2.5 text-[15px] font-medium text-ink">
          {dot && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
          {name}
        </p>
        {reading && <div className="num shrink-0 text-right text-[15px] text-ink">{reading}</div>}
      </div>
      {children}
    </li>
  );
}

const walletInfo: { role: TreasuryWallet["role"]; name: string; dot: string; job: string }[] = [
  {
    role: "fees",
    name: "Fee wallet",
    dot: "var(--ink-3)",
    job: "Collects the fee from Raydium, swaps it to SOL and sends half to each of the two wallets below. It also pays the network fees.",
  },
  {
    role: "otc",
    name: "OTC reserve",
    dot: bucketColor.otcReserve,
    job: "Holds the SOL that sellers are paid from, and burns the coins it buys in the same transaction.",
  },
  {
    role: "protection",
    name: brand.shield,
    dot: bucketColor.protection,
    job: "Holds the SOL that pays back losses. Its only outgoing transfers are those payouts.",
  },
];

/** The three backend-held wallets: what each one does, its address on the explorer and its live balance. */
export function WalletsList() {
  const { data: s, isError } = useStats();
  const cluster = s?.cluster ?? CLUSTER;
  return (
    <div className="space-y-3">
      <Panel className="p-5 sm:p-6">
        <ul className="space-y-6">
          {walletInfo.map((w) => {
            const live = s?.treasury.find((t) => t.role === w.role);
            return (
              <Entry
                key={w.role}
                name={w.name}
                dot={w.dot}
                reading={live ? sol(live.sol) : !s && !isError ? <Skeleton className="h-4 w-20" /> : null}
              >
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{w.job}</p>
                {live ? (
                  <AddressLine address={live.address} cluster={cluster} />
                ) : !s && !isError ? (
                  <Skeleton className="mt-2 h-4 w-full max-w-sm" />
                ) : (
                  <p className="mt-2 text-[13px] text-ink-3">{isError ? "The address could not be loaded right now." : "Not set up on this server."}</p>
                )}
              </Entry>
            );
          })}
        </ul>
      </Panel>
      {s?.demo && (
        <Notice title="Demo mode">
          This server runs a simulated market. The addresses are real, but their balances exist only in the demo, so an explorer
          shows them empty.
        </Notice>
      )}
    </div>
  );
}

/** The Raydium programs and the pool tier this cluster uses: where to point an explorer to check the guide's claims. */
export function ProgramsList() {
  const cluster = useStats().data?.cluster ?? CLUSTER;
  const tier = CPMM_TIER[cluster];
  const items = [
    { name: "Raydium LaunchLab", job: "The price-curve program every coin launches on.", address: LAUNCHLAB_PROGRAM_ID[cluster] },
    { name: "Raydium CPMM", job: "The pool program coins graduate to.", address: CPMM_PROGRAM_ID[cluster] },
    { name: "Raydium LP lock", job: "Holds each graduated pool's liquidity for good.", address: LP_LOCK_PROGRAM_ID[cluster] },
    {
      name: "Pool fee tier",
      job: `The settings graduated pools trade on: a ${tier.tradeFeeBps / 100}% trade fee plus a ${tier.creatorFeeBps / 100}% creator fee, which the fee wallet collects.`,
      address: tier.config,
    },
  ];
  return (
    <Panel className="p-5 sm:p-6">
      <ul className="space-y-6">
        {items.map((p) => (
          <Entry key={p.address} name={p.name}>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{p.job}</p>
            <AddressLine address={p.address} cluster={cluster} />
          </Entry>
        ))}
      </ul>
    </Panel>
  );
}

/** The platform token's mint, as the backend reports it. */
export function TokenMint() {
  const { data: s, isError } = useStats();
  if (s?.mainToken) {
    return (
      <Panel className="p-5 sm:p-6">
        <p className="text-[14px] leading-relaxed text-ink-2">
          This is the only ${brand.mainTicker} address to trust. Compare it character by character before you buy.
        </p>
        <AddressLine address={s.mainToken} cluster={s.cluster} />
      </Panel>
    );
  }
  if (!s && !isError) return <Skeleton className="h-4 w-full max-w-sm" />;
  return (
    <p className="text-[14px] leading-relaxed text-ink-2">
      {isError
        ? "Its address could not be loaded right now."
        : `Its address has not been published on this server yet. Until one appears here and on the home page, any coin calling itself $${brand.mainTicker} is someone else's.`}
    </p>
  );
}
