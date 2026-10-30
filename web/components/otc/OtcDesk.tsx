"use client";

import clsx from "clsx";
import { ArrowDown, ChevronRight, Clock, Coins as CoinsIcon, Flame, Gauge, Percent, Scale, Search, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { brand, isSolanaAddress, otcPolicy, type Coin, type CoinDetail, type OtcCoin } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { client, useBalances, useCoin, useCoins, useOtc, useOtcCoin, useSolUsd } from "@/lib/data";
import { formatRaw, sol, toRaw, tokens, units, usd } from "@/lib/format";
import { useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteChip } from "@/components/QuoteChip";
import { TxStatus } from "@/components/TxStatus";
import { Button, Card, CardHeader, EmptyState, ErrorState, IconTile, Input, Skeleton } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const TEAL = bucketColor.otcReserve;

function Meter({ value, color = TEAL, className }: { value: number; color?: string; className?: string }) {
  const p = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={clsx("h-1.5 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(p * 100, p > 0 ? 3 : 0)}%`, background: color, boxShadow: `0 0 10px -2px ${color}` }}
      />
    </div>
  );
}

export function OtcDesk() {
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(params.get("coin") ?? undefined);
  const solUsd = useSolUsd();
  const { data: otc, isLoading, isError } = useOtc();
  const { data: coins } = useCoins({ sort: "active", limit: 200 });
  const coinOf = useMemo(() => new Map((coins ?? []).map((c) => [c.address, c])), [coins]);

  const rows = useMemo(() => [...(otc?.coins ?? [])].sort((a, b) => b.sellLimitSol - a.sellLimitSol), [otc]);
  const maxLimit = rows.reduce((m, r) => Math.max(m, r.sellLimitSol), 0);
  const withLimit = rows.filter((r) => r.sellLimitSol > 0).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { icon: CoinsIcon, label: "Coins open", value: otc ? `${withLimit} / ${rows.length}` : "…", sub: "earned by their own fees" },
            { icon: Percent, label: "Spread", value: `${otcPolicy.spreadBps / 100}%`, sub: "the same 3% fee, split like every trade" },
            {
              icon: Users,
              label: "Per-wallet cap",
              value: otc ? usd(otc.walletDailyCapSol * solUsd) : `${otcPolicy.walletDailyBps / 100}%`,
              sub: "per coin, per day (5% of the reserve)",
            },
          ].map((s) => (
            <Card key={s.label} className="min-w-0 p-3.5 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="hidden sm:inline-flex">
                  <IconTile color={TEAL} size={30}>
                    <s.icon size={14} />
                  </IconTile>
                </span>
                <span className="text-[11px] leading-tight text-muted sm:text-xs">{s.label}</span>
              </div>
              <div className="num mt-2 text-xl font-medium sm:mt-3 sm:text-2xl">{s.value}</div>
              <div className="mt-0.5 hidden text-xs text-faint sm:block">{s.sub}</div>
            </Card>
          ))}
        </div>

        {isError ? (
          <ErrorState detail="The OTC list comes from the Recur API. You can still paste a coin address in the ticket." />
        ) : isLoading ? (
          <Skeleton className="h-96 rounded-[22px]" />
        ) : rows.length === 0 ? (
          <EmptyState title="No coins yet" detail="Once coins start paying fees, they earn OTC limits here." />
        ) : (
          <div className="surface overflow-hidden rounded-[22px]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] tracking-wider text-faint uppercase">
                  <th className="py-3.5 pr-3 pl-4 font-medium sm:pl-5">Coin</th>
                  <th className="px-3 py-3.5 font-medium">Sell limit now</th>
                  <th className="hidden px-3 py-3.5 font-medium sm:table-cell">Activity</th>
                  <th className="hidden px-3 py-3.5 text-right font-medium xl:table-cell">Contributed</th>
                  <th className="hidden px-3 py-3.5 text-right font-medium xl:table-cell">Burned via OTC</th>
                  <th className="w-8 py-3.5 pr-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <OtcRow
                    key={r.coin}
                    r={r}
                    solUsd={solUsd}
                    maxLimit={maxLimit}
                    info={coinOf.get(r.coin)}
                    active={selected === r.coin}
                    onSelect={() => setSelected(r.coin)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <HowLimitsWork />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {selected && isSolanaAddress(selected) ? (
          <OtcTicket address={selected} onClose={() => setSelected(undefined)} />
        ) : (
          <Card featured className="p-6">
            <IconTile color={TEAL} size={44}>
              <Scale size={20} />
            </IconTile>
            <h3 className="font-display mt-5 text-2xl font-semibold">Pick a coin</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Search for a coin, pick one from the list, or paste its mint address. Every coin the reserve buys is burned in the same transaction.
            </p>
            <CoinSearch rows={rows} coinOf={coinOf} solUsd={solUsd} onPick={setSelected} />
          </Card>
        )}
      </aside>
    </div>
  );
}

/** Finds a coin by ticker or name among those with OTC limits, or opens any mint address pasted in. */
function CoinSearch({
  rows,
  coinOf,
  solUsd,
  onPick,
}: {
  rows: OtcCoin[];
  coinOf: Map<string, Coin>;
  solUsd: number;
  onPick: (coin: string) => void;
}) {
  const [text, setText] = useState("");
  const q = text.trim().toLowerCase();
  const matches = q
    ? rows
        .filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.coin.toLowerCase() === q)
        .slice(0, 6)
    : [];
  const pasted = isSolanaAddress(text.trim()) && !matches.some((m) => m.coin === text.trim());
  return (
    <div className="mt-5">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ticker, name or mint address" className="pl-10 text-sm" />
      </div>
      {(matches.length > 0 || pasted) && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-elev">
          {matches.map((m) => (
            <li key={m.coin}>
              <button onClick={() => onPick(m.coin)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-elev-2">
                <CoinAvatar src={m.image} symbol={m.symbol} seed={m.coin} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">${m.symbol}</span>
                  <span className="block truncate text-[11px] text-muted">{coinOf.get(m.coin)?.name ?? m.name}</span>
                </span>
                <span className="num text-right text-xs">
                  {usd(m.sellLimitSol * solUsd)}
                  <span className="block text-[10px] text-faint">limit now</span>
                </span>
              </button>
            </li>
          ))}
          {pasted && (
            <li>
              <button onClick={() => onPick(text.trim())} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-elev-2">
                <span className="num truncate text-xs text-muted">{text.trim()}</span>
                <span className="shrink-0 font-medium text-accent">Open</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {q && matches.length === 0 && !pasted && <p className="mt-2 text-xs text-muted">No coin with an OTC limit matches that.</p>}
    </div>
  );
}

function OtcRow({
  r,
  solUsd,
  maxLimit,
  info,
  active,
  onSelect,
}: {
  r: OtcCoin;
  solUsd: number;
  maxLimit: number;
  info?: Coin;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={clsx("group cursor-pointer border-b border-line transition-colors last:border-0", active ? "bg-elev-2" : "hover:bg-elev-2")}
    >
      <td className="relative py-3 pr-3 pl-4 sm:pl-5">
        {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full" style={{ background: TEAL }} />}
        <div className="flex items-center gap-3">
          <CoinAvatar src={r.image} symbol={r.symbol} seed={r.coin} size={34} />
          <div className="min-w-0">
            <div className="truncate font-semibold">${r.symbol}</div>
            {info && <QuoteChip symbol={info.quote.symbol} logo={info.quote.logo} className="mt-0.5" />}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="num font-medium">{usd(r.sellLimitSol * solUsd)}</div>
        <Meter className="mt-1.5 w-24 sm:w-28" value={maxLimit > 0 ? r.sellLimitSol / maxLimit : 0} />
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        <div className="flex items-center gap-2">
          <Meter className="w-16" value={r.activityBps / 10_000} color={r.activityBps >= 10_000 ? TEAL : "var(--faint)"} />
          <span className={clsx("num text-xs", r.activityBps >= 10_000 ? "text-fg" : "text-muted")}>{(r.activityBps / 100).toFixed(0)}%</span>
        </div>
      </td>
      <td className="num hidden px-3 py-3 text-right text-muted xl:table-cell">{usd(r.contributedSol * solUsd)}</td>
      <td className="num hidden px-3 py-3 text-right text-muted xl:table-cell">{info ? tokens(r.burned, info.decimals) : "—"}</td>
      <td className="py-3 pr-4 text-right">
        <ChevronRight size={16} className={clsx("inline transition-colors", active ? "text-fg" : "text-faint group-hover:text-fg")} />
      </td>
    </tr>
  );
}

function HowLimitsWork() {
  const items = [
    { icon: CoinsIcon, title: "Credit = 2× contribution", body: "Each coin's limit is 2× the SOL its fees put into the reserve, minus what holders already sold into it." },
    { icon: Clock, title: "Drops when quiet", body: "Full strength while the coin keeps paying fees. After 2 days without any, it drops to 5%; fresh trading restores it to 100%." },
    { icon: Gauge, title: "Caps", body: "One coin can draw at most 10% of the reserve at a time, one wallet at most 5% of it per coin per day." },
    {
      icon: Scale,
      title: "Fair, atomic settlement",
      body: "Sellers get the lower of spot and the 30-minute TWAP. Each sale is one transaction signed by you and the reserve wallet: you're paid and the coins are burned together, or nothing happens.",
    },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="How limits work" sub="Coins that pay more fees earn bigger limits; dead coins drop to next to nothing." />
      <div className="mt-4 grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3.5 bg-elev p-5">
            <IconTile color={TEAL} size={36}>
              <it.icon size={16} />
            </IconTile>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{it.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OtcTicket({ address: coinAddress, onClose }: { address: string; onClose: () => void }) {
  const { data: coin, isLoading, isError } = useCoin(coinAddress);
  if (isLoading) return <Skeleton className="h-[480px] rounded-[22px]" />;
  if (isError || !coin)
    return (
      <Card className="p-6">
        <p className="text-sm font-medium">That coin isn&apos;t on {brand.name} yet</p>
        <p className="mt-1 text-xs text-muted">Check the mint address, or give a new launch a few seconds to index.</p>
        <Button variant="secondary" className="mt-4" onClick={onClose}>
          Back
        </Button>
      </Card>
    );
  return <Ticket coin={coin} onClose={onClose} />;
}

function Ticket({ coin, onClose }: { coin: CoinDetail; onClose: () => void }) {
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
    ? "OTC opens after 30 min of history"
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
    <Card featured className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">${coin.symbol}</div>
          <div className="truncate text-xs text-muted">{coin.name}</div>
        </div>
        <QuoteChip symbol={coin.quote.symbol} logo={coin.quote.logo} />
        <button
          onClick={onClose}
          aria-label="Close ticket"
          className="flex h-8 w-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-sunk hover:text-fg"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-sunk/60 px-3 py-2 text-xs text-muted">
        <Flame size={13} className="shrink-0 text-accent" />
        Sell to the reserve for SOL. The coins are burned in the same transaction.
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-sunk px-4 py-3.5 transition-all focus-within:border-accent focus-within:bg-elev focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
        <div className="flex justify-between text-xs text-muted">
          <span>You sell</span>
          {wallet && balance !== undefined && (
            <button onClick={setMax} className="num transition-colors hover:text-fg">
              Balance {tokens(balance, coin.decimals)} · <span className="text-accent">Max</span>
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="num min-w-0 flex-1 bg-transparent text-3xl outline-none placeholder:text-faint"
          />
          <span className="rounded-full border border-line bg-elev px-3 py-1 text-sm font-medium">{coin.symbol}</span>
        </div>
        <div className="num mt-1 text-xs text-faint">
          {inputRaw > 0n ? `≈ ${usd(inputUnits * coin.priceUsd)}` : " "}
        </div>
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elev text-muted shadow-card">
          <ArrowDown size={14} />
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-sunk/60 px-4 py-3.5">
        <div className="flex justify-between text-xs text-muted">
          <span>You receive (est.)</span>
          {outUnits > 0 && <span className="num text-faint">≈ {usd(outUnits * solUsd)}</span>}
        </div>
        <div className="num mt-1.5 min-h-9 text-3xl">
          {inputRaw === 0n ? (
            <span className="text-faint">0.0</span>
          ) : !l ? (
            <Skeleton className="mt-1 h-8 w-32" />
          ) : (
            sol(outUnits)
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Coin limit now</span>
            <span className={clsx("num", overLimit ? "text-down" : "text-fg")}>{l ? usd(l.sellLimitSol * solUsd) : "…"}</span>
          </div>
          <Meter className="mt-1.5" value={limitUse} color={overLimit ? "var(--down)" : TEAL} />
        </div>
        <div>
          <div className="flex justify-between text-xs">
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
      <p className="mt-3 text-center text-[11px] text-faint">
        One transaction signed by you and the reserve wallet · quotes hold for {otcPolicy.quoteTtlSeconds}s
      </p>
    </Card>
  );
}
