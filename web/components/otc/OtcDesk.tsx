"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ChevronRight, Clock, Coins as CoinsIcon, Gauge, Percent, Scale, Users, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import type { Coin } from "@cook/shared";
import { CHAIN_ID, abis, addresses, errorMessage } from "@/lib/contracts";
import { bucketColor } from "@/lib/buckets";
import { useCoins } from "@/lib/data";
import { eth, toRaw, tokens, units } from "@/lib/format";
import { useEnsureAllowance, useTx, useWrongChain } from "@/lib/tx";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteChip } from "@/components/QuoteChip";
import { TxStatus } from "@/components/TxStatus";
import { Button, Card, CardHeader, EmptyState, ErrorState, IconTile, Input, Segmented, Skeleton } from "@/components/ui";

const OTC_SLIPPAGE_BPS = 50n; // quotes are TWAP-based and barely move; 0.5% covers block-to-block drift
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
  const [manual, setManual] = useState("");
  const { data: coins, isLoading, isError } = useCoins({ sort: "active", limit: 100 });

  const list = coins ?? [];
  const base = { address: addresses.otcReserve!, abi: abis.otc, chainId: CHAIN_ID } as const;
  const limits = useReadContracts({
    contracts: list.flatMap((c) => [
      { ...base, functionName: "sellLimit" as const, args: [c.address] as const },
      { ...base, functionName: "activityBps" as const, args: [c.address] as const },
      { ...base, functionName: "coins" as const, args: [c.address] as const },
    ]),
    query: { enabled: list.length > 0 && !!addresses.otcReserve, refetchInterval: 15_000 },
  });
  const rows = list
    .map((c, i) => {
      const lim = limits.data?.[i * 3]?.result as bigint | undefined;
      const act = limits.data?.[i * 3 + 1]?.result as bigint | undefined;
      const info = limits.data?.[i * 3 + 2]?.result as readonly bigint[] | undefined;
      return { coin: c, limit: lim ?? 0n, activity: Number(act ?? 0n), contributed: info?.[1] ?? 0n, inventory: info?.[3] ?? 0n };
    })
    .sort((a, b) => (b.limit > a.limit ? 1 : b.limit < a.limit ? -1 : 0));
  const maxLimit = rows.reduce((m, r) => (r.limit > m ? r.limit : m), 0n);
  const withLimit = rows.filter((r) => r.limit > 0n).length;

  const selectedCoin = list.find((c) => c.address.toLowerCase() === selected?.toLowerCase());

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { icon: CoinsIcon, label: "Coins with a limit", value: limits.data ? `${withLimit} / ${rows.length}` : "…", sub: "earned by their own fees" },
            { icon: Percent, label: "Spread", value: "3%", sub: "stays in the reserve" },
            { icon: Users, label: "Per-wallet cap", value: "5%", sub: "of the reserve, per coin, per day" },
          ].map((s) => (
            <Card key={s.label} className="min-w-0 p-3.5 sm:p-5">
              <div className="flex items-center gap-2.5">
                <span className="hidden sm:inline-flex">
                  <IconTile color={TEAL} size={30}>
                    <s.icon size={14} />
                  </IconTile>
                </span>
                <span className="truncate text-[11px] text-muted sm:text-xs">{s.label}</span>
              </div>
              <div className="num mt-2 text-xl font-medium sm:mt-3 sm:text-2xl">{s.value}</div>
              <div className="mt-0.5 hidden text-xs text-faint sm:block">{s.sub}</div>
            </Card>
          ))}
        </div>

        {isError ? (
          <ErrorState detail="The coin list comes from the indexer. You can still paste a coin address in the ticket." />
        ) : isLoading ? (
          <Skeleton className="h-96 rounded-[22px]" />
        ) : rows.length === 0 ? (
          <EmptyState title="No coins yet" detail="Once coins start paying fees, they earn OTC limits here." />
        ) : (
          <div className="surface scroll-x overflow-hidden rounded-[22px]">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] tracking-wider text-faint uppercase">
                  <th className="py-3.5 pr-3 pl-5 font-medium">Coin</th>
                  <th className="px-3 py-3.5 font-medium">Sell limit now</th>
                  <th className="px-3 py-3.5 font-medium">Activity</th>
                  <th className="px-3 py-3.5 text-right font-medium">Contributed</th>
                  <th className="px-3 py-3.5 text-right font-medium">Inventory</th>
                  <th className="w-10 py-3.5 pr-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const active = selected?.toLowerCase() === r.coin.address.toLowerCase();
                  return (
                    <tr
                      key={r.coin.address}
                      onClick={() => setSelected(r.coin.address)}
                      className={clsx(
                        "group cursor-pointer border-b border-line transition-colors last:border-0",
                        active ? "bg-elev-2" : "hover:bg-elev-2",
                      )}
                    >
                      <td className="relative py-3 pr-3 pl-5">
                        {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full" style={{ background: TEAL }} />}
                        <div className="flex items-center gap-3">
                          <CoinAvatar src={r.coin.image} symbol={r.coin.symbol} seed={r.coin.address} size={34} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">${r.coin.symbol}</div>
                            <QuoteChip symbol={r.coin.quote.symbol} className="mt-0.5" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="num font-medium">{eth(units(r.limit))}</div>
                        <Meter className="mt-1.5 w-28" value={maxLimit > 0n ? Number((r.limit * 10_000n) / maxLimit) / 10_000 : 0} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Meter className="w-16" value={r.activity / 10_000} color={r.activity >= 10_000 ? TEAL : "var(--faint)"} />
                          <span className={clsx("num text-xs", r.activity >= 10_000 ? "text-fg" : "text-muted")}>
                            {(r.activity / 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="num px-3 py-3 text-right text-muted">{eth(units(r.contributed))}</td>
                      <td className="num px-3 py-3 text-right text-muted">{tokens(r.inventory, 18)}</td>
                      <td className="py-3 pr-4 text-right">
                        <ChevronRight size={16} className={clsx("inline transition-colors", active ? "text-fg" : "text-faint group-hover:text-fg")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <HowLimitsWork />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {selectedCoin ? (
          <OtcTicket coin={selectedCoin} onClose={() => setSelected(undefined)} />
        ) : (
          <Card featured className="p-6">
            <IconTile color={TEAL} size={44}>
              <Scale size={20} />
            </IconTile>
            <h3 className="font-display mt-5 text-2xl font-semibold">Pick a coin</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Choose a coin from the list to sell into the reserve or buy its inventory, or paste its address.
            </p>
            <div className="mt-5 flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value.trim())} placeholder="0x…" className="num text-xs" />
              <Button variant="secondary" className="h-12" disabled={!isAddress(manual)} onClick={() => setSelected(manual)}>
                Open
              </Button>
            </div>
            {selected && !selectedCoin && !isLoading && (
              <p className="mt-3 text-xs text-muted">That coin isn&apos;t in the indexed list yet.</p>
            )}
          </Card>
        )}
      </aside>
    </div>
  );
}

function HowLimitsWork() {
  const items = [
    { icon: CoinsIcon, title: "Credit = 2× contribution", body: "Each coin's limit is 2× the ETH its fees put into the reserve, minus what holders already sold into it." },
    { icon: Clock, title: "Fades when quiet", body: "Full strength while the coin keeps paying fees (3 days), then fades linearly to 5% over the next 27 days." },
    { icon: Gauge, title: "Caps", body: "One coin can draw at most 10% of the reserve at a time, one wallet at most 5% of it per coin per day." },
    { icon: Scale, title: "Fair pricing", body: "Sellers get the lower of spot and the 30-minute TWAP, inventory buyers pay the higher. The 3% spread stays in the reserve." },
  ];
  return (
    <Card className="overflow-hidden">
      <CardHeader title="How limits work" sub="Coins that pay more fees earn bigger limits; dead coins fade to next to nothing." />
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

function OtcTicket({ coin, onClose }: { coin: Coin; onClose: () => void }) {
  const [mode, setMode] = useState<"sell" | "buy">("sell");
  const [amount, setAmount] = useState("");
  const [debounced, setDebounced] = useState("");
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { wrong, switchToApp } = useWrongChain();
  const tx = useTx();
  const allowance = useEnsureAllowance();
  const token = coin.address as Address;
  const otc = addresses.otcReserve!;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 300);
    return () => clearTimeout(t);
  }, [amount]);
  useEffect(() => setAmount(""), [mode, coin.address]);

  const day = useMemo(() => BigInt(Math.floor(Date.now() / 1000 / 86_400)), []);
  const base = { address: otc, abi: abis.otc, chainId: CHAIN_ID } as const;
  const reads = useReadContracts({
    contracts: [
      { ...base, functionName: "sellLimit", args: [token] },
      { ...base, functionName: "walletDailyBps" },
      { ...base, functionName: "walletSold", args: [token, address ?? zeroAddress, day] },
      { ...base, functionName: "coins", args: [token] },
    ],
    query: { refetchInterval: 10_000 },
  });
  const limit = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const walletBps = (reads.data?.[1]?.result as bigint | undefined) ?? 0n;
  const soldToday = (reads.data?.[2]?.result as bigint | undefined) ?? 0n;
  const inventory = ((reads.data?.[3]?.result as readonly bigint[] | undefined) ?? [])[3] ?? 0n;
  const reserve = useBalance({ address: otc, chainId: CHAIN_ID });
  const walletCap = reserve.data ? (reserve.data.value * walletBps) / 10_000n : 0n;
  const walletLeft = walletCap > soldToday ? walletCap - soldToday : 0n;

  const coinBal = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: CHAIN_ID,
    query: { enabled: !!address && mode === "sell" },
  });
  const ethBal = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address && mode === "buy" } });

  const raw = toRaw(debounced, 18);
  const quote = useQuery({
    queryKey: ["otcQuote", token, mode, raw.toString()],
    enabled: raw > 0n && !!publicClient,
    queryFn: async () =>
      (await publicClient!.readContract({
        address: otc,
        abi: abis.otc,
        functionName: mode === "sell" ? "quoteSell" : "quoteBuy",
        args: [token, raw],
      })) as bigint,
    retry: false,
    refetchInterval: 10_000,
  });
  const out = quote.data ?? 0n;
  const inputRaw = toRaw(amount, 18);
  const overLimit = mode === "sell" && out > limit;
  const overWallet = mode === "sell" && out > walletLeft;
  const overInventory = mode === "buy" && out > inventory;
  const balance = mode === "sell" ? coinBal.data : ethBal.data?.value;
  const insufficient = balance !== undefined && inputRaw > balance;

  async function submit() {
    if (!address || inputRaw === 0n || out === 0n) return;
    const minOut = (out * (10_000n - OTC_SLIPPAGE_BPS)) / 10_000n;
    if (mode === "sell") {
      const ok = await allowance.ensure(token, otc, inputRaw, `Approve ${coin.symbol}`);
      if (!ok) return;
      const r = await tx.send(`Sell ${coin.symbol} to reserve`, {
        address: otc,
        abi: abis.otc,
        functionName: "sellToReserve",
        args: [token, inputRaw, minOut],
      });
      if (r) setAmount("");
    } else {
      const r = await tx.send(`Buy ${coin.symbol} from reserve`, {
        address: otc,
        abi: abis.otc,
        functionName: "buyFromReserve",
        args: [token, minOut],
        value: inputRaw,
      });
      if (r) setAmount("");
    }
  }

  const blocked = overLimit || overWallet || overInventory || insufficient;
  const busy = tx.busy || allowance.busy;
  const label = insufficient
    ? "Insufficient balance"
    : overLimit
      ? "Above this coin's limit"
      : overWallet
        ? "Above your daily cap"
        : overInventory
          ? "Not enough inventory"
          : busy
            ? "Working…"
            : mode === "sell"
              ? `Sell ${coin.symbol} for ETH`
              : `Buy ${coin.symbol} with ETH`;

  const limitUse = limit > 0n ? Number((out * 10_000n) / limit) / 10_000 : out > 0n ? 1 : 0;
  const capUse = walletCap > 0n ? Number(((soldToday + out) * 10_000n) / walletCap) / 10_000 : 0;

  return (
    <Card featured className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">${coin.symbol}</div>
          <div className="truncate text-xs text-muted">{coin.name}</div>
        </div>
        <QuoteChip symbol={coin.quote.symbol} />
        <button
          onClick={onClose}
          aria-label="Close ticket"
          className="flex h-8 w-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-sunk hover:text-fg"
        >
          <X size={15} />
        </button>
      </div>

      <Segmented
        className="mt-5 flex w-full [&>button]:flex-1"
        value={mode}
        onChange={setMode}
        options={[
          { value: "sell", label: "Sell to reserve" },
          { value: "buy", label: "Buy inventory" },
        ]}
      />

      <div className="mt-4 rounded-2xl border border-line bg-sunk px-4 py-3.5 transition-all focus-within:border-accent focus-within:bg-elev focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
        <div className="flex justify-between text-xs text-muted">
          <span>{mode === "sell" ? "You sell" : "You spend"}</span>
          {address && balance !== undefined && (
            <button onClick={() => setAmount(formatUnits(balance, 18))} className="num transition-colors hover:text-fg">
              Balance {tokens(balance, 18)} · <span className="text-accent">Max</span>
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
          <span className="rounded-full border border-line bg-elev px-3 py-1 text-sm font-medium">{mode === "sell" ? coin.symbol : "ETH"}</span>
        </div>
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elev text-muted shadow-card">
          <ArrowDown size={14} />
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-sunk/60 px-4 py-3.5">
        <div className="text-xs text-muted">You receive</div>
        <div className="num mt-1.5 min-h-9 text-3xl">
          {raw === 0n ? (
            <span className="text-faint">0.0</span>
          ) : quote.isError ? (
            <span className="text-sm text-down">{errorMessage(quote.error)}</span>
          ) : quote.data === undefined ? (
            <Skeleton className="mt-1 h-8 w-32" />
          ) : (
            <>
              {tokens(out, 18)} <span className="text-base text-muted">{mode === "sell" ? "ETH" : coin.symbol}</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        {mode === "sell" ? (
          <>
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Coin limit now</span>
                <span className={clsx("num", overLimit ? "text-down" : "text-fg")}>{tokens(limit, 18)} ETH</span>
              </div>
              <Meter className="mt-1.5" value={limitUse} color={overLimit ? "var(--down)" : TEAL} />
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Your cap left today</span>
                <span className={clsx("num", overWallet ? "text-down" : "text-fg")}>{address ? `${tokens(walletLeft, 18)} ETH` : "—"}</span>
              </div>
              <Meter className="mt-1.5" value={capUse} color={overWallet ? "var(--down)" : "var(--accent)"} />
            </div>
          </>
        ) : (
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Reserve inventory</span>
              <span className={clsx("num", overInventory ? "text-down" : "text-fg")}>
                {tokens(inventory, 18)} {coin.symbol}
              </span>
            </div>
            <Meter className="mt-1.5" value={inventory > 0n ? Number((out * 10_000n) / inventory) / 10_000 : 0} color={overInventory ? "var(--down)" : TEAL} />
          </div>
        )}
      </div>

      <div className="mt-5">
        {!address ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button className="w-full" size="lg" onClick={openConnectModal}>
                Connect wallet
              </Button>
            )}
          </ConnectButton.Custom>
        ) : wrong ? (
          <Button className="w-full" size="lg" onClick={switchToApp}>
            Switch network
          </Button>
        ) : (
          <Button className="w-full" size="lg" disabled={busy || blocked || inputRaw === 0n || out === 0n} onClick={submit}>
            {label}
          </Button>
        )}
      </div>
      <TxStatus state={allowance.state.status === "error" || allowance.busy ? allowance.state : tx.state} className="mt-3" />
      <p className="mt-3 text-center text-[11px] text-faint">0.5% slippage guard · 3% spread stays in the reserve</p>
    </Card>
  );
}
