"use client";

import clsx from "clsx";
import { ArrowDown, ChevronRight, Clock, Coins as CoinsIcon, Egg, Flame, Gauge, Scale, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { brand, isSolanaAddress, otcPolicy, type Coin, type CoinDetail, type OtcCoin } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { client, useBalances, useCoin, useCoins, useOtc, useOtcCoin, useSolUsd } from "@/lib/data";
import { bps, formatRaw, sol, toRaw, tokens, units, usd } from "@/lib/format";
import { useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteChip } from "@/components/QuoteChip";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Eyebrow, IconTile, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { ReservePanel } from "./ReserveMetric";

const SKY = bucketColor.otcReserve;
const creditX = otcPolicy.creditMultiplierBps / 10_000;

function Meter({ value, color = SKY, className }: { value: number; color?: string; className?: string }) {
  const p = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={clsx("h-2 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(p * 100, p > 0 ? 3 : 0)}%`, background: color, boxShadow: `0 0 10px -2px ${color}` }}
      />
    </div>
  );
}

/** A coin's place in its Nest: a copy feeds its leader, a leader collects from its copies. */
function nestRole(info?: Pick<Coin, "address" | "bloodline">) {
  const b = info?.bloodline;
  if (!b) return null;
  return b.leader.address === info.address ? ({ kind: "leader" } as const) : ({ kind: "copy", leader: b.leader } as const);
}

function NestBadge({ info }: { info?: Coin }) {
  const role = nestRole(info);
  if (!role) return null;
  return (
    <Badge tone="nest" className="max-w-[140px]">
      <Egg size={11} className="shrink-0" />
      <span className="truncate">{role.kind === "leader" ? `Leads a ${brand.nest}` : `Feeds $${role.leader.symbol}`}</span>
    </Badge>
  );
}

export function OtcDesk() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(params.get("coin") ?? undefined);
  const ticketRef = useRef<HTMLElement>(null);
  const solUsd = useSolUsd();
  const { data: otc, isLoading, isError } = useOtc();
  const { data: coins } = useCoins({ sort: "active", limit: 200 });
  const coinOf = useMemo(() => new Map((coins ?? []).map((c) => [c.address, c])), [coins]);

  const rows = useMemo(() => [...(otc?.coins ?? [])].sort((a, b) => b.sellLimitSol - a.sellLimitSol), [otc]);
  const maxLimit = rows.reduce((m, r) => Math.max(m, r.sellLimitSol), 0);

  const pick = (coin: string) => {
    setSelected(coin);
    // below lg the ticket sits above the list: bring it into view
    if (!window.matchMedia("(min-width: 1024px)").matches)
      requestAnimationFrame(() => ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <ReservePanel className="lg:col-start-1 lg:row-start-1" />

      {/* the sell desk: beside everything on desktop, right under the reserve on phones */}
      <aside ref={ticketRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
        {selected && isSolanaAddress(selected) ? (
          <OtcTicket address={selected} onClose={() => setSelected(undefined)} onPick={pick} />
        ) : (
          <div className="ring-spectrum shadow-card rounded-[24px] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <IconTile color={SKY} size={44}>
                <Scale size={20} />
              </IconTile>
              <div className="min-w-0">
                <Eyebrow>Sell desk</Eyebrow>
                <h3 className="font-display mt-1 text-2xl font-semibold">Pick a coin to sell</h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Search, pick one from the list, or paste a mint address. The reserve pays SOL and burns the coins in the same transaction.
            </p>
            <CoinSearch rows={rows} coinOf={coinOf} solUsd={solUsd} onPick={pick} />
          </div>
        )}
      </aside>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        {isError ? (
          <ErrorState detail={`The OTC list comes from the ${brand.name} API. You can still paste a coin address in the sell desk.`} />
        ) : isLoading ? (
          <Skeleton className="h-96 rounded-[24px]" />
        ) : rows.length === 0 ? (
          <EmptyState title="No coins yet" detail="Once coins start paying fees, they earn OTC limits here." />
        ) : (
          <OtcTable rows={rows} coinOf={coinOf} solUsd={solUsd} maxLimit={maxLimit} selected={selected} onSelect={pick} />
        )}
      </div>

      <HowLimitsWork className="lg:col-start-1 lg:row-start-3" />
    </div>
  );
}

/** Finds a coin by ticker or name among those with OTC limits, or opens any mint address pasted in. */
function CoinSearch({ rows, coinOf, solUsd, onPick }: { rows: OtcCoin[]; coinOf: Map<string, Coin>; solUsd: number; onPick: (coin: string) => void }) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const matches = q ? rows.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.coin.toLowerCase() === q).slice(0, 6) : [];
  const pasted = isSolanaAddress(text.trim()) && !matches.some((m) => m.coin === text.trim());
  // with nothing typed, offer the biggest limits right now
  const top = q ? [] : rows.filter((r) => r.sellLimitSol > 0).slice(0, 4);
  const list = q ? matches : top;
  return (
    <div className="mt-5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ticker, name or mint address"
          aria-label="Find a coin"
          className="h-12 w-full rounded-2xl border-[1.5px] border-line-strong bg-sunk pr-4 pl-11 text-sm font-semibold outline-none transition-all placeholder:font-normal placeholder:text-faint hover:border-muted/40 focus:border-sky focus:bg-elev focus:shadow-[0_0_0_4px_var(--sky-soft)]"
        />
      </div>
      {!q && top.length > 0 && <p className="eyebrow mt-5 mb-2">Biggest limits now</p>}
      {(list.length > 0 || pasted) && (
        <ul className={clsx("divide-y divide-line overflow-hidden rounded-2xl border border-line bg-sunk/60", q && "mt-2")}>
          {list.map((m) => (
            <li key={m.coin}>
              <button
                onClick={() => onPick(m.coin)}
                className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-elev-2"
              >
                <CoinAvatar src={m.image} symbol={m.symbol} seed={m.coin} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="font-display block truncate text-sm font-semibold">${m.symbol}</span>
                  <span className="block truncate text-[11px] text-muted">{coinOf.get(m.coin)?.name ?? m.name}</span>
                </span>
                <span className="num text-right text-sm font-semibold">
                  {usd(m.sellLimitSol * solUsd)}
                  <span className="block text-[10px] font-normal text-faint">limit now</span>
                </span>
              </button>
            </li>
          ))}
          {pasted && (
            <li>
              <button
                onClick={() => onPick(text.trim())}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-elev-2"
              >
                <span className="num truncate text-xs text-muted">{text.trim()}</span>
                <span className="font-display shrink-0 font-semibold text-sky">Open</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {q && matches.length === 0 && !pasted && <p className="mt-2 text-xs text-muted">No coin with an OTC limit matches that.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the list

function OtcTable({
  rows,
  coinOf,
  solUsd,
  maxLimit,
  selected,
  onSelect,
}: {
  rows: OtcCoin[];
  coinOf: Map<string, Coin>;
  solUsd: number;
  maxLimit: number;
  selected?: string;
  onSelect: (coin: string) => void;
}) {
  // on lg the list shares the row with the sell desk: the price and paid-in columns come back at xl
  const extra = "lg:hidden xl:table-cell";
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={
          <IconTile color={SKY} size={40}>
            <CoinsIcon size={18} />
          </IconTile>
        }
        title="Sell limits"
        sub={`What the reserve will buy of each coin right now. Copies in a ${brand.nest} build their leader's limit, not their own.`}
      />
      <div className="thin-scrollbar mt-5 overflow-x-auto border-t border-line">
        <table className="w-full min-w-[620px] text-left text-sm lg:min-w-0 xl:min-w-[620px]">
          <thead>
            <tr className="border-b border-line">
              <th className="eyebrow sticky left-0 z-10 bg-elev py-3 pr-3 pl-5 sm:pl-6">Coin</th>
              <th className="eyebrow px-3 py-3">Limit now</th>
              <th className={clsx("eyebrow px-3 py-3 text-right", extra)}>Reserve pays</th>
              <th className="eyebrow px-3 py-3">Activity</th>
              <th className={clsx("eyebrow px-3 py-3 text-right", extra)}>Paid in</th>
              <th className="w-10 py-3 pr-4" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const info = coinOf.get(r.coin);
              const active = selected === r.coin;
              const live = r.activityBps >= 10_000;
              const select = (e: MouseEvent) => {
                e.stopPropagation();
                onSelect(r.coin);
              };
              return (
                <tr
                  key={r.coin}
                  onClick={() => onSelect(r.coin)}
                  className={clsx("group cursor-pointer border-b border-line transition-colors last:border-0", active ? "bg-elev-2" : "hover:bg-elev-2")}
                >
                  <td className={clsx("sticky left-0 z-10 py-3.5 pr-3 pl-5 transition-colors sm:pl-6", active ? "bg-elev-2" : "bg-elev group-hover:bg-elev-2")}>
                    {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full" style={{ background: SKY }} />}
                    <button onClick={select} aria-pressed={active} className="flex min-h-10 w-full min-w-0 items-center gap-3 text-left">
                      <CoinAvatar src={r.image} symbol={r.symbol} seed={r.coin} size={36} />
                      <span className="min-w-0">
                        <span className="font-display block max-w-[120px] truncate text-[15px] font-semibold">${r.symbol}</span>
                        <span className="mt-1 flex items-center gap-1.5">
                          {info && <QuoteChip symbol={info.quote.symbol} logo={info.quote.logo} />}
                          <NestBadge info={info} />
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="num font-semibold">{usd(r.sellLimitSol * solUsd)}</div>
                    <Meter className="mt-1.5 w-24 sm:w-28" value={maxLimit > 0 ? r.sellLimitSol / maxLimit : 0} />
                  </td>
                  <td className={clsx("num px-3 py-3.5 text-right", extra)}>
                    {r.twapReady ? (
                      <>
                        <div>{usd(r.sellPriceSol * solUsd)}</div>
                        <div className="text-[11px] text-faint">per coin</div>
                      </>
                    ) : (
                      <span className="text-xs text-faint">TWAP filling</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <Meter className="w-14" value={r.activityBps / 10_000} color={live ? SKY : "var(--faint)"} />
                      <span className={clsx("num text-xs", live ? "text-fg" : "text-muted")}>{(r.activityBps / 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 text-[11px] text-faint">{live ? "paying fees" : r.lastContribution ? "gone quiet" : "no fees yet"}</div>
                  </td>
                  <td className={clsx("num px-3 py-3.5 text-right", extra)}>
                    <div className="text-muted">{usd(r.contributedSol * solUsd)}</div>
                    {info && units(r.burned, info.decimals) > 0 && <div className="text-[11px] text-faint">{tokens(r.burned, info.decimals)} burned</div>}
                  </td>
                  <td className="py-3.5 pr-4 text-right">
                    <ChevronRight size={16} className={clsx("inline transition-colors", active ? "text-fg" : "text-faint group-hover:text-fg")} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HowLimitsWork({ className }: { className?: string }) {
  const items = [
    {
      icon: CoinsIcon,
      title: `Credit = ${creditX}× what it paid in`,
      body: `Each coin's limit is ${creditX}× the SOL its fees put into the reserve, minus what holders already sold into it.`,
    },
    {
      icon: Clock,
      title: "Drops when quiet",
      body: `Full strength while the coin keeps paying fees. After ${otcPolicy.activeSeconds / 86_400} days without any, it drops to ${bps(otcPolicy.floorBps)}; fresh trading restores it.`,
    },
    {
      icon: Gauge,
      title: "Caps",
      body: `One coin can draw at most ${bps(otcPolicy.maxShareOfReserveBps)} of the reserve at a time; one wallet at most ${bps(otcPolicy.walletDailyBps)} of it per coin per day.`,
    },
    {
      icon: Scale,
      title: "Fair price, one transaction",
      body: `You get the lower of spot and the ${otcPolicy.twapSeconds / 60}-minute TWAP, minus the ${bps(otcPolicy.spreadBps)} spread. You and the reserve sign one transaction: you're paid and the coins are burned together, or nothing happens.`,
    },
  ];
  return (
    <Card className={clsx("min-w-0 overflow-hidden", className)}>
      <CardHeader title="How limits work" sub="Coins that pay more fees earn bigger limits; dead coins drop to next to nothing." />
      <div className="mt-5 grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3.5 bg-elev p-5 sm:p-6">
            <IconTile color={SKY} size={40}>
              <it.icon size={18} />
            </IconTile>
            <div className="min-w-0">
              <div className="font-display text-[15px] font-semibold">{it.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3.5 border-t border-line bg-nest-soft p-5 sm:p-6">
        <IconTile color="var(--nest)" size={40}>
          <Egg size={18} />
        </IconTile>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold text-nest">Copies feed their {brand.nest}&apos;s leader</div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Look-alike copies of a coin join its {brand.nest} and send their whole fee split to the leader, so the leader&apos;s limit grows from its
            copies&apos; trading too.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- the ticket

function OtcTicket({ address: coinAddress, onClose, onPick }: { address: string; onClose: () => void; onPick: (coin: string) => void }) {
  const { data: coin, isLoading, isError } = useCoin(coinAddress);
  if (isLoading) return <Skeleton className="h-[520px] rounded-[24px]" />;
  if (isError || !coin)
    return (
      <Card className="p-6">
        <p className="font-display text-base font-semibold">That coin isn&apos;t on {brand.name} yet</p>
        <p className="mt-1 text-xs text-muted">Check the mint address, or give a new launch a few seconds to index.</p>
        <Button variant="secondary" className="mt-4" onClick={onClose}>
          Back
        </Button>
      </Card>
    );
  return <Ticket coin={coin} onClose={onClose} onPick={onPick} />;
}

function Ticket({ coin, onClose, onPick }: { coin: CoinDetail; onClose: () => void; onPick: (coin: string) => void }) {
  const [amount, setAmount] = useState("");
  const wallet = useAddress();
  const { open: openWallet } = useWalletModal();
  const solUsd = useSolUsd();
  const limits = useOtcCoin(coin.address, wallet);
  const balances = useBalances(wallet);
  const tx = useSolanaTx();

  useEffect(() => setAmount(""), [coin.address]);

  const l = limits.data;
  const inputRaw = toRaw(amount, coin.decimals);
  const inputUnits = units(inputRaw, coin.decimals);
  // previews from the reserve's posted price; the signed quote fixes the exact amounts
  const outUnits = l ? inputUnits * l.sellPriceSol : 0;

  const overLimit = !!l && outUnits > l.sellLimitSol;
  const overWallet = !!l && !!wallet && outUnits > l.walletRemainingSol;
  const notReady = !!l && !l.twapReady;
  const balance = balances.data ? BigInt(balances.data.tokens[coin.address] ?? "0") : undefined;
  const insufficient = balance !== undefined && inputRaw > balance;
  const role = nestRole(coin);

  async function submit() {
    if (!wallet || inputRaw === 0n) return;
    const r = await tx.run(
      `Sell ${coin.symbol} to reserve`,
      () => client.otcQuote({ wallet, coin: coin.address, side: "sell", amount: inputRaw.toString() }),
      (signature, quote) => client.otcConfirm(quote.id, signature),
    );
    if (r) setAmount("");
  }

  const blocked = notReady || overLimit || overWallet || insufficient;
  const label = notReady
    ? `OTC opens after ${otcPolicy.twapSeconds / 60} min of history`
    : insufficient
      ? "Insufficient balance"
      : overLimit
        ? "Above this coin's limit"
        : overWallet
          ? "Above your daily cap"
          : tx.busy
            ? "Working…"
            : `Sell ${coin.symbol} for SOL`;

  const limitUse = l && l.sellLimitSol > 0 ? outUnits / l.sellLimitSol : outUnits > 0 ? 1 : 0;
  const capUse = l && l.walletRemainingSol > 0 ? outUnits / l.walletRemainingSol : 0;
  const setMax = () => {
    if (balance !== undefined) setAmount(formatRaw(balance, coin.decimals));
  };

  return (
    <div className="ring-spectrum shadow-card rounded-[24px] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={44} />
        <div className="min-w-0 flex-1">
          <div className="font-display truncate text-lg font-semibold">${coin.symbol}</div>
          <div className="truncate text-xs text-muted">{coin.name}</div>
        </div>
        <QuoteChip symbol={coin.quote.symbol} logo={coin.quote.logo} />
        <button
          onClick={onClose}
          aria-label="Close sell desk"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-elev-2 hover:text-fg"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-sunk px-3.5 py-2.5 text-xs leading-snug text-muted">
        <Flame size={14} className="shrink-0 text-accent" />
        Sold to the reserve for SOL. The coins are burned in the same transaction.
      </div>

      {role && (
        <div className="mt-2 flex items-start gap-2.5 rounded-2xl bg-nest-soft px-3.5 py-2.5 text-xs leading-snug text-muted">
          <Egg size={14} className="mt-px shrink-0 text-nest" />
          {role.kind === "leader" ? (
            <span>
              <span className="font-semibold text-nest">Leads its {brand.nest}.</span> Its copies&apos; fees add to this limit.
            </span>
          ) : (
            <span>
              <span className="font-semibold text-nest">
                A copy in ${role.leader.symbol}&apos;s {brand.nest}.
              </span>{" "}
              {`Its fees build $${role.leader.symbol}'s limit, not this one.`}{" "}
              <button onClick={() => onPick(role.leader.address)} className="font-display -my-2.5 py-2.5 font-semibold text-fg underline underline-offset-2">
                Open ${role.leader.symbol}
              </button>
            </span>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl border-[1.5px] border-line-strong bg-sunk px-4 py-3.5 transition-all focus-within:border-sky focus-within:bg-elev focus-within:shadow-[0_0_0_4px_var(--sky-soft)]">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>You sell</span>
          {wallet && balance !== undefined && <span className="num truncate">Balance {tokens(balance, coin.decimals)}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            aria-label={`Amount of ${coin.symbol} to sell`}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="num font-display min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none placeholder:text-faint"
          />
          {wallet && balance !== undefined && balance > 0n && (
            <button
              onClick={setMax}
              className="font-display h-10 shrink-0 rounded-full bg-elev-2 px-3.5 text-xs font-semibold text-accent-2 shadow-[inset_0_0_0_1px_var(--line-strong)] transition-colors hover:text-fg"
            >
              Max
            </button>
          )}
          <span className="font-display max-w-[96px] shrink-0 truncate rounded-full border border-line bg-elev px-3 py-1.5 text-sm font-semibold">
            {coin.symbol}
          </span>
        </div>
        <div className="num mt-1 text-xs text-faint">{inputRaw > 0n ? `≈ ${usd(inputUnits * coin.priceUsd)} at spot` : " "}</div>
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-elev text-muted shadow-card">
          <ArrowDown size={15} />
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-sunk/60 px-4 py-3.5">
        <div className="flex justify-between gap-3 text-xs text-muted">
          <span>You receive (est.)</span>
          {outUnits > 0 && <span className="num text-faint">≈ {usd(outUnits * solUsd)}</span>}
        </div>
        <div className="num font-display mt-1.5 min-h-9 text-3xl font-semibold">
          {inputRaw === 0n ? <span className="text-faint">0.0</span> : !l ? <Skeleton className="mt-1 h-8 w-32" /> : sol(outUnits)}
        </div>
      </div>

      <div className="mt-4 space-y-1 rounded-2xl border border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3 py-1 text-xs">
          <span className="text-muted">Reserve pays</span>
          <span className="num text-right">{!l ? "…" : l.twapReady ? `${usd(l.sellPriceSol * solUsd)} per coin` : "TWAP still filling"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1 text-[11px] text-faint">
          <span>
            min(spot, {otcPolicy.twapSeconds / 60}-min TWAP) − {bps(otcPolicy.spreadBps)}
          </span>
          <span className="num">spot {usd(coin.priceUsd)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <div>
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted">Coin limit now</span>
            <span className={clsx("num", overLimit ? "text-down" : "text-fg")}>{l ? usd(l.sellLimitSol * solUsd) : "…"}</span>
          </div>
          <Meter className="mt-1.5" value={limitUse} color={overLimit ? "var(--down)" : SKY} />
        </div>
        <div>
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted">Your cap left today</span>
            <span className={clsx("num", overWallet ? "text-down" : "text-fg")}>{wallet && l ? usd(l.walletRemainingSol * solUsd) : "—"}</span>
          </div>
          <Meter className="mt-1.5" value={capUse} color={overWallet ? "var(--down)" : "var(--accent)"} />
        </div>
      </div>

      <div className="mt-5">
        {!wallet ? (
          <Button className="w-full" size="lg" onClick={openWallet}>
            Connect wallet
          </Button>
        ) : (
          <Button className="w-full" size="lg" disabled={tx.busy || blocked || inputRaw === 0n || outUnits <= 0} onClick={submit}>
            {label}
          </Button>
        )}
      </div>
      <TxStatus state={tx.state} className="mt-3" />
      <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
        One transaction signed by you and the reserve wallet · quotes hold for {otcPolicy.quoteTtlSeconds}s
      </p>
    </div>
  );
}
