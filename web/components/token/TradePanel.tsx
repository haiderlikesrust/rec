"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, Loader2, Settings2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buyTaxBpsAt, NATIVE_MINT, SNIPE, TAX_BPS, type Coin } from "@cook/shared";
import { client, useBalances } from "@/lib/data";
import { bps, formatRaw, num, pct, sig, toRaw, tokens, units, usd } from "@/lib/format";
import { errorMessage, useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteLogo } from "@/components/QuoteChip";
import { Button } from "@/components/ui";
import { TxStatus } from "@/components/TxStatus";
import { useWalletModal } from "@/components/wallet/WalletModal";

const SOL_RESERVE = 20_000_000n; // 0.02 SOL kept back on "max" for fees and token-account rent

function AssetPill({ symbol, image, seed, logo }: { symbol: string; image?: string; seed: string; logo?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-elev py-1 pr-3 pl-1 shadow-card">
      {logo !== undefined ? <QuoteLogo symbol={symbol} logo={logo} size={26} /> : <CoinAvatar src={image} symbol={symbol} seed={seed} size={26} />}
      <span className="text-sm font-semibold">{symbol}</span>
    </span>
  );
}

/** Ticks once a second while the launch anti-snipe fee is still decaying, so the fee row stays honest. */
function useSnipeFee(createdAt: number) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  const live = now - createdAt < SNIPE.seconds + 1;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now() / 1000), 500);
    return () => clearInterval(t);
  }, [live]);
  return buyTaxBpsAt(Math.max(0, now - createdAt));
}

export function TradePanel({ coin, initialSide = "buy" }: { coin: Coin; initialSide?: "buy" | "sell" }) {
  const [side, setSide] = useState<"buy" | "sell">(initialSide);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [debounced, setDebounced] = useState("");
  const settingsRef = useRef<HTMLDivElement>(null);
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const tx = useSolanaTx();
  const balances = useBalances(address);

  const quote = coin.quote;
  const quoteIsSol = quote.address === NATIVE_MINT;
  const isBuy = side === "buy";
  const inDecimals = isBuy ? quote.decimals : coin.decimals;
  const outDecimals = isBuy ? coin.decimals : quote.decimals;
  const inSymbol = isBuy ? quote.symbol : coin.symbol;
  const outSymbol = isBuy ? coin.symbol : quote.symbol;
  const inUsd = isBuy ? quote.usdPerUnit : coin.priceUsd;
  const outUsd = isBuy ? coin.priceUsd : quote.usdPerUnit;

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

  const b = balances.data;
  const rawBalance = !b ? undefined : isBuy ? (quoteIsSol ? b.sol : b.tokens[quote.address] ?? "0") : b.tokens[coin.address] ?? "0";
  const balance = rawBalance !== undefined ? BigInt(rawBalance) : undefined;

  const scheduleBps = useSnipeFee(coin.createdAt);
  const amountRaw = toRaw(debounced, inDecimals);
  const quoteQuery = useQuery({
    queryKey: ["swapQuote", coin.address, side, amountRaw.toString(), slippage, address],
    enabled: amountRaw > 0n,
    queryFn: () =>
      client.swapQuote({ coin: coin.address, side, amount: amountRaw.toString(), wallet: address, slippageBps: slippage * 100 }),
    refetchInterval: 8_000,
    retry: false,
  });
  const q = quoteQuery.data;
  const out = q ? BigInt(q.amountOut) : 0n;
  const minOut = q ? BigInt(q.minOut) : 0n;
  const feeBps = q?.feeBps ?? scheduleBps;
  const sniping = feeBps > TAX_BPS;

  const inputRaw = toRaw(amount, inDecimals);
  const insufficient = balance !== undefined && inputRaw > balance;

  const setMax = () => {
    if (balance === undefined) return;
    const v = isBuy && quoteIsSol ? (balance > SOL_RESERVE ? balance - SOL_RESERVE : 0n) : balance;
    setAmount(formatRaw(v, inDecimals));
  };

  const presets: { label: string; apply: () => void }[] = isBuy
    ? quote.usdPerUnit > 0
      ? [10, 50, 100, 500].map((d) => ({ label: `$${d}`, apply: () => setAmount(sig(d / quote.usdPerUnit, 4)) }))
      : ["1", "5", "10"].map((p) => ({ label: `${p} ${quote.symbol}`, apply: () => setAmount(p) }))
    : [25, 50, 75, 100].map((p) => ({
        label: `${p}%`,
        apply: () => balance !== undefined && setAmount(formatRaw((balance * BigInt(p)) / 100n, coin.decimals)),
      }));

  async function submit() {
    if (!address || inputRaw === 0n) return;
    const r = await tx.run(`${isBuy ? "Buy" : "Sell"} ${coin.symbol}`, () =>
      client.swap({ wallet: address, coin: coin.address, side, amount: inputRaw.toString(), slippageBps: slippage * 100 }),
    );
    if (r) setAmount("");
  }

  const inAsset = isBuy
    ? { symbol: quote.symbol, seed: quote.symbol, logo: quote.logo }
    : { symbol: coin.symbol, image: coin.image, seed: coin.address };
  const outAsset = isBuy
    ? { symbol: coin.symbol, image: coin.image, seed: coin.address }
    : { symbol: quote.symbol, seed: quote.symbol, logo: quote.logo };
  const inValue = units(inputRaw, inDecimals) * inUsd;
  const outValue = units(out, outDecimals) * outUsd;

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
              <p className="mt-1 text-[11px] leading-relaxed text-faint">The trade fails if the price moves more than this before it lands.</p>
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
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={p.apply}
                className="num rounded-full border border-line bg-elev/60 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="num shrink-0 text-xs text-faint">{inputRaw > 0n && inUsd > 0 ? `≈ ${usd(inValue)}` : ""}</span>
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
          {quoteQuery.isFetching ? (
            <Loader2 size={12} className="animate-spin text-faint" />
          ) : (
            <span className="num text-faint">{out > 0n && outUsd > 0 ? `≈ ${usd(outValue)}` : ""}</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="num min-w-0 flex-1 truncate text-[32px] leading-none font-medium">
            {amountRaw > 0n ? (
              quoteQuery.isError ? (
                <span className="text-sm text-down">{errorMessage(quoteQuery.error)}</span>
              ) : q ? (
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
          <dt className="text-muted">Trade fee</dt>
          <dd className={clsx("num inline-flex items-center gap-1.5", sniping && "rounded-full bg-down-soft px-2 py-0.5 font-medium text-down")}>
            {sniping && <Zap size={11} />}
            {bps(feeBps)}
            {sniping && " · anti-snipe"}
          </dd>
        </div>
        {q && q.priceImpact > 0.005 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">Price impact</dt>
            <dd className={clsx("num", q.priceImpact > 0.05 && "text-down")}>{pct(q.priceImpact * 100, { digits: 2 })}</dd>
          </div>
        )}
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
          <Button className="h-14 w-full rounded-2xl text-base" size="lg" onClick={openWallet}>
            Connect wallet
          </Button>
        ) : (
          <Button
            className="h-14 w-full rounded-2xl text-base"
            size="lg"
            variant={isBuy ? "up" : "down"}
            disabled={tx.busy || inputRaw === 0n || insufficient}
            onClick={submit}
          >
            {tx.busy && <Loader2 size={16} className="animate-spin" />}
            {insufficient ? `Not enough ${inSymbol}` : tx.busy ? "Working…" : `${isBuy ? "Buy" : "Sell"} $${coin.symbol}`}
          </Button>
        )}
      </div>
      <TxStatus state={tx.state} className="mt-3" />
      <p className="mt-3 px-1 text-[11px] leading-relaxed text-faint">
        3% of the {quote.symbol} side goes to burns, the OTC reserve, the protection fund and high-entry airdrops, after
        Meteora&apos;s protocol share. None goes to the creator or the team.
      </p>
    </section>
  );
}
