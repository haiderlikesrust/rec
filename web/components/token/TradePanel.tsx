"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, Loader2, Settings2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract } from "wagmi";
import type { Coin } from "@cook/shared";
import { TAX_BPS } from "@cook/shared";
import { CHAIN_ID, abis, addresses, errorMessage, isNative } from "@/lib/contracts";
import { bps, num, toRaw, tokens } from "@/lib/format";
import { useEnsureAllowance, useTx, useWrongChain } from "@/lib/tx";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Button } from "@/components/ui";
import { TxStatus } from "@/components/TxStatus";

const GAS_BUFFER = 2_000_000_000_000_000n; // 0.002 ETH kept for gas on "max"

function AssetPill({ symbol, image, seed }: { symbol: string; image?: string; seed: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-elev py-1 pr-3 pl-1 shadow-card">
      <CoinAvatar src={image} symbol={symbol} seed={seed} size={26} />
      <span className="text-sm font-semibold">{symbol}</span>
    </span>
  );
}

export function TradePanel({ coin }: { coin: Coin }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [debounced, setDebounced] = useState("");
  const settingsRef = useRef<HTMLDivElement>(null);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { wrong, switchToApp, switching } = useWrongChain();
  const tx = useTx();
  const allowance = useEnsureAllowance();

  const token = coin.address as Address;
  const quote = coin.quote;
  const quoteIsNative = isNative(quote.address);
  const isBuy = side === "buy";
  const inDecimals = isBuy ? quote.decimals : 18;
  const outDecimals = isBuy ? 18 : quote.decimals;
  const inSymbol = isBuy ? quote.symbol : coin.symbol;
  const outSymbol = isBuy ? coin.symbol : quote.symbol;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 300);
    return () => clearTimeout(t);
  }, [amount]);
  useEffect(() => {
    setAmount("");
    tx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);
  useEffect(() => {
    if (!showSettings) return;
    const close = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSettings]);

  const ethBal = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address && quoteIsNative && isBuy } });
  const ercBal = useReadContract({
    address: (isBuy ? quote.address : token) as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: CHAIN_ID,
    query: { enabled: !!address && !(isBuy && quoteIsNative), refetchInterval: 10_000 },
  });
  const balance = isBuy && quoteIsNative ? ethBal.data?.value : ercBal.data;

  const taxQuery = useReadContract({
    address: addresses.hook,
    abi: abis.hook,
    functionName: "currentTaxBps",
    args: [token, address ?? zeroAddress, isBuy],
    chainId: CHAIN_ID,
    query: { enabled: !!addresses.hook, refetchInterval: 2_000 },
  });
  const taxBps = taxQuery.data !== undefined ? Number(taxQuery.data) : TAX_BPS;
  const sniping = taxBps > TAX_BPS;

  const amountRaw = toRaw(debounced, inDecimals);
  const quoteQuery = useQuery({
    queryKey: ["tradeQuote", token, side, amountRaw.toString(), address],
    enabled: amountRaw > 0n && !!publicClient && !!addresses.router,
    queryFn: async () => {
      const { result } = await publicClient!.simulateContract({
        address: addresses.router!,
        abi: abis.router,
        functionName: "quote",
        args: [token, isBuy, amountRaw],
        account: address ?? zeroAddress,
      });
      return result as bigint;
    },
    refetchInterval: 8_000,
    retry: false,
  });
  const out = quoteQuery.data ?? 0n;
  const minOut = (out * BigInt(Math.round((100 - slippage) * 100))) / 10_000n;

  const insufficient = balance !== undefined && toRaw(amount, inDecimals) > balance;
  const inputRaw = toRaw(amount, inDecimals);

  const setMax = () => {
    if (balance === undefined) return;
    const v = isBuy && quoteIsNative ? (balance > GAS_BUFFER ? balance - GAS_BUFFER : 0n) : balance;
    setAmount(formatUnits(v, inDecimals));
  };

  const presets: { label: string; apply: () => void }[] = isBuy
    ? (quoteIsNative ? ["0.1", "0.5", "1"] : quote.decimals <= 8 ? ["100", "500", "1000"] : ["1", "5", "10"]).map((p) => ({
        label: p,
        apply: () => setAmount(p),
      }))
    : [25, 50, 75, 100].map((p) => ({
        label: `${p}%`,
        apply: () => balance !== undefined && setAmount(formatUnits((balance * BigInt(p)) / 100n, 18)),
      }));

  async function submit() {
    if (!address || !addresses.router || inputRaw === 0n) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    if (isBuy) {
      if (!quoteIsNative) {
        const ok = await allowance.ensure(quote.address as Address, addresses.router, inputRaw, `Approve ${quote.symbol}`);
        if (!ok) return;
      }
      const r = await tx.send(`Buy ${coin.symbol}`, {
        address: addresses.router,
        abi: abis.router,
        functionName: "buy",
        args: [token, inputRaw, minOut, address, deadline],
        value: quoteIsNative ? inputRaw : 0n,
      });
      if (r) setAmount("");
    } else {
      const ok = await allowance.ensure(token, addresses.router, inputRaw, `Approve ${coin.symbol}`);
      if (!ok) return;
      const r = await tx.send(`Sell ${coin.symbol}`, {
        address: addresses.router,
        abi: abis.router,
        functionName: "sell",
        args: [token, inputRaw, minOut, address, deadline],
      });
      if (r) setAmount("");
    }
  }

  const busy = tx.busy || allowance.busy;
  const status = allowance.state.status === "error" || allowance.busy ? allowance.state : tx.state;
  const inAsset = isBuy ? { symbol: quote.symbol, image: undefined, seed: quote.symbol } : { symbol: coin.symbol, image: coin.image, seed: coin.address };
  const outAsset = isBuy ? { symbol: coin.symbol, image: coin.image, seed: coin.address } : { symbol: quote.symbol, image: undefined, seed: quote.symbol };

  return (
    <section className="ring-spectrum shadow-pop relative rounded-[22px] p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-2 rounded-full border border-line bg-sunk/80 p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={clsx(
                "rounded-full py-2 text-sm font-semibold capitalize transition-all duration-200",
                side === s
                  ? s === "buy"
                    ? "bg-up-soft text-up shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--up)_35%,transparent)]"
                    : "bg-down-soft text-down shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--down)_35%,transparent)]"
                  : "text-muted hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div ref={settingsRef} className="relative">
          <button
            aria-label="Slippage settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            className={clsx(
              "flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
              showSettings ? "border-line-strong bg-elev-2 text-fg" : "border-line text-muted hover:text-fg",
            )}
          >
            <Settings2 size={14} />
            <span className="num">{num(slippage)}%</span>
          </button>
          {showSettings && (
            <div className="surface shadow-pop absolute top-12 right-0 z-20 w-60 rounded-2xl p-4">
              <div className="text-xs font-medium">Max slippage</div>
              <p className="mt-1 text-[11px] leading-relaxed text-faint">The trade reverts if the price moves more than this before it lands.</p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[1, 3, 5, 10].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSlippage(s);
                      setShowSettings(false);
                    }}
                    className={clsx(
                      "num rounded-xl py-1.5 text-xs transition-colors",
                      slippage === s ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--accent)]" : "bg-sunk text-muted hover:text-fg",
                    )}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* pay */}
      <div className="mt-4 rounded-2xl border border-line bg-sunk p-4 transition-all focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-soft)]">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>You pay</span>
          {address && (
            <button onClick={setMax} className="num inline-flex items-center gap-1.5 transition-colors hover:text-fg">
              {balance !== undefined ? tokens(balance, inDecimals) : "…"}
              <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold tracking-wide text-accent">MAX</span>
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            className="num min-w-0 flex-1 bg-transparent text-[32px] leading-none font-medium outline-none placeholder:text-faint"
            aria-label={`Amount of ${inSymbol}`}
          />
          <AssetPill {...inAsset} />
        </div>
        <div className="mt-3 flex gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.apply}
              className="num rounded-full border border-line bg-elev/60 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {p.label}
              {isBuy && ` ${quote.symbol}`}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 -my-3 flex justify-center">
        <button
          onClick={() => setSide(isBuy ? "sell" : "buy")}
          aria-label="Switch side"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-elev text-muted shadow-card transition-all hover:rotate-180 hover:text-fg"
        >
          <ArrowDown size={15} />
        </button>
      </div>

      {/* receive */}
      <div className="rounded-2xl border border-line bg-sunk/50 p-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>You receive</span>
          {quoteQuery.isFetching && <Loader2 size={12} className="animate-spin text-faint" />}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="num min-w-0 flex-1 truncate text-[32px] leading-none font-medium">
            {amountRaw > 0n ? (
              quoteQuery.isError ? (
                <span className="text-sm text-down">{errorMessage(quoteQuery.error)}</span>
              ) : quoteQuery.data !== undefined ? (
                tokens(out, outDecimals)
              ) : (
                <span className="text-faint">…</span>
              )
            ) : (
              <span className="text-faint">0</span>
            )}
          </div>
          <AssetPill {...outAsset} />
        </div>
      </div>

      <dl className="mt-4 space-y-2 px-1 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-muted">Trade tax</dt>
          <dd
            className={clsx(
              "num inline-flex items-center gap-1.5",
              sniping && "rounded-full bg-down-soft px-2 py-0.5 font-medium text-down",
            )}
          >
            {sniping && <Zap size={11} />}
            {bps(taxBps)}
            {sniping && " · anti-snipe"}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Minimum received</dt>
          <dd className="num">{amountRaw > 0n && out > 0n ? `${tokens(minOut, outDecimals)} ${outSymbol}` : "—"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Max slippage</dt>
          <dd className="num">{num(slippage)}%</dd>
        </div>
      </dl>

      <div className="mt-4">
        {!address ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button className="h-14 w-full rounded-2xl text-base" size="lg" onClick={openConnectModal}>
                Connect wallet
              </Button>
            )}
          </ConnectButton.Custom>
        ) : wrong ? (
          <Button className="h-14 w-full rounded-2xl text-base" size="lg" onClick={switchToApp} disabled={switching}>
            Switch network
          </Button>
        ) : (
          <Button
            className="h-14 w-full rounded-2xl text-base"
            size="lg"
            variant={isBuy ? "up" : "down"}
            disabled={busy || inputRaw === 0n || insufficient || !addresses.router}
            onClick={submit}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {insufficient ? `Not enough ${inSymbol}` : busy ? "Working…" : `${isBuy ? "Buy" : "Sell"} $${coin.symbol}`}
          </Button>
        )}
      </div>
      <TxStatus state={status} className="mt-3" />
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-faint">
        3% of the {quote.symbol} side funds burns, the OTC reserve, the protection fund and high-entry airdrops. None goes to
        the creator or the team.
      </p>
    </section>
  );
}
