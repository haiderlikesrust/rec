"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, Loader2, Settings, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { brand, feeBreakdown, NATIVE_MINT, type Coin, type SwapSide } from "@gantry/shared";
import { client, useBalances } from "@/lib/data";
import { runtime } from "@/lib/explorer";
import { bps, formatRaw, pct, sig, toRaw, tokens, units, usd } from "@/lib/format";
import { isMainPair, transferFeeBps } from "@/lib/pairs";
import { quoteTokens, rawToTyped, shownPrice, typedToRaw } from "@/lib/quoteUnits";
import { errorMessage, useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { QuoteLogo } from "@/components/QuoteChip";
import { TxStatus } from "@/components/TxStatus";
import { Button, Field, Input, Panel, PanelBody, Segmented } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { venueOf } from "./venue";

const SOL_RESERVE = 20_000_000n; // 0.02 SOL stays in the wallet on "Max", for network fees and token-account rent
const SLIPPAGE_STEPS = ["1", "3", "5", "10"] as const;
/** A trade that moves the price by more than this gets a warning. */
const HIGH_IMPACT = 0.05;

const sides: { value: SwapSide; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
];

/** Where a wallet with none of a pair's token can swap SOL for it. */
const jupiterSwap = (mint: string) => `https://jup.ag/swap?sell=${NATIVE_MINT}&buy=${mint}`;

/** A square icon button: the settings control and the sheet's close button. */
const iconButton = "size-9 shrink-0 px-0 max-lg:size-11";

/**
 * The buy/sell box: side, amount, what you get, the fee, one button. It is a card in the right column on desktop and
 * the content of the bottom sheet on phones (`onClose` adds the close button and drops the card).
 *
 * A coin is bought with its pair's token and sold for it: SOL, a stablecoin or a stock token. Amounts of that token
 * are typed and shown the way a wallet counts them (lib/quoteUnits); what goes to the API is the raw amount.
 */
export function TradePanel({
  coin,
  initialSide = "buy",
  className,
  onClose,
}: {
  coin: Coin;
  initialSide?: SwapSide;
  className?: string;
  onClose?: () => void;
}) {
  const [side, setSide] = useState<SwapSide>(initialSide);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(5);
  const [tuning, setTuning] = useState(false);
  const [debounced, setDebounced] = useState("");
  const tuneId = useId();
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const tx = useSolanaTx();
  const balances = useBalances(address);

  const quote = coin.quote;
  const quoteIsSol = quote.address === NATIVE_MINT;
  const isBuy = side === "buy";
  const outDecimals = isBuy ? coin.decimals : quote.decimals;
  // the side that is paid in is the pair's token on a buy and the coin on a sell; the other side is what comes out
  const parseIn = (text: string) => (isBuy ? typedToRaw(text, quote) : toRaw(text, coin.decimals));
  const fieldText = (raw: bigint) => (isBuy ? rawToTyped(raw, quote) : formatRaw(raw, coin.decimals));
  const showIn = (raw: bigint) => (isBuy ? quoteTokens(raw, quote) : tokens(raw, coin.decimals));
  const showOut = (raw: bigint) => (isBuy ? tokens(raw, coin.decimals) : quoteTokens(raw, quote));
  const inSymbol = isBuy ? quote.symbol : coin.symbol;
  const outSymbol = isBuy ? coin.symbol : quote.symbol;
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

  const b = balances.data;
  const rawBalance = !b ? undefined : isBuy ? (quoteIsSol ? b.sol : b.tokens[quote.address] ?? "0") : b.tokens[coin.address] ?? "0";
  const balance = rawBalance !== undefined ? BigInt(rawBalance) : undefined;

  const amountRaw = parseIn(debounced);
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

  // the fee the quote was priced with; before there is a quote, the venue's standing rate
  const feeBps = q?.feeBps ?? feeBreakdown(venueOf(coin), runtime.cluster).taxBps;

  const inputRaw = parseIn(amount);
  const insufficient = balance !== undefined && inputRaw > balance;
  // on a pair other than SOL and the main stablecoins, the box says in words what the coin trades against: the token,
  // what kind it is and who issues it, and the fee that issuer takes on transfers when it takes one
  const unusualPair = !isMainPair(quote);
  const pairToken = !unusualPair
    ? quote.symbol
    : `${quote.symbol} (${quote.name})${
        quote.category === "stock" ? `, a stock token${quote.issuer ? ` from ${quote.issuer}` : ""}` : quote.issuer ? `, a token issued by ${quote.issuer}` : ""
      }`;
  const transferFee = transferFeeBps(quote);
  const transferNote = transferFee > 0 ? `Its issuer charges a ${bps(transferFee)} fee on every transfer, on top of the ${bps(feeBps)} trading fee.` : "";

  // buying with a token the wallet has none of: say where to get it, not just that there isn't enough
  const payToken = isBuy && !quoteIsSol;
  const holdsNone = payToken && balance === 0n;
  const getIt = (label: string) => (
    <a href={jupiterSwap(quote.address)} target="_blank" rel="noreferrer" className="link whitespace-nowrap">
      {label}
      <ArrowUpRight size={13} aria-hidden className="ml-0.5 inline align-[-2px]" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );

  const setMax = () => {
    if (balance === undefined) return;
    const v = isBuy && quoteIsSol ? (balance > SOL_RESERVE ? balance - SOL_RESERVE : 0n) : balance;
    setAmount(fieldText(v));
  };

  const presets: { label: string; hint: string; needsBalance: boolean; apply: () => void }[] = isBuy
    ? [
        ...(quote.usdPerUnit > 0
          ? [10, 50, 100].map((d) => ({
              label: `$${d}`,
              hint: `Spend $${d} of ${quote.symbol}`,
              needsBalance: false,
              apply: () => setAmount(sig(d / shownPrice(quote.usdPerUnit, quote), 4)),
            }))
          : ["1", "5", "10"].map((p) => ({ label: p, hint: `Spend ${p} ${quote.symbol}`, needsBalance: false, apply: () => setAmount(p) }))),
        { label: "Max", hint: `Spend the whole ${quote.symbol} balance`, needsBalance: true, apply: setMax },
      ]
    : [25, 50, 75, 100].map((p) => ({
        label: p === 100 ? "All" : `${p}%`,
        hint: `Sell ${p}% of the ${coin.symbol} balance`,
        needsBalance: true,
        apply: () => balance !== undefined && setAmount(formatRaw((balance * BigInt(p)) / 100n, coin.decimals)),
      }));

  async function submit() {
    if (!address || inputRaw === 0n) return;
    const r = await tx.run(`${isBuy ? "Buy" : "Sell"} ${coin.symbol}`, () =>
      client.swap({ wallet: address, coin: coin.address, side, amount: inputRaw.toString(), slippageBps: slippage * 100 }),
    );
    if (r) setAmount("");
  }

  const quoted = amountRaw > 0n && !!q && !quoteQuery.isError;
  const outValue = units(out, outDecimals) * outUsd;

  const body = (
    <PanelBody className="space-y-5">
      <div className="flex items-center gap-1.5">
        <Segmented block aria-label="Buy or sell" className="min-w-0 flex-1 max-lg:[&>button]:h-11" value={side} onChange={setSide} options={sides} />
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={tuning}
          aria-controls={tuneId}
          aria-label={`Trade settings. Slippage ${slippage}%`}
          title={`Slippage ${slippage}%`}
          onClick={() => setTuning((v) => !v)}
          className={clsx(iconButton, tuning && "bg-raise text-ink")}
        >
          <Settings size={17} aria-hidden />
        </Button>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className={iconButton}>
            <X size={18} aria-hidden />
          </Button>
        )}
      </div>

      {tuning && (
        <div id={tuneId} className="space-y-3 rounded-lg bg-raise p-4">
          <Field as="div" label="Slippage">
            <Segmented
              block
              size="sm"
              aria-label="Slippage"
              className="max-lg:[&>button]:h-10"
              value={String(slippage) as (typeof SLIPPAGE_STEPS)[number]}
              onChange={(v) => setSlippage(Number(v))}
              options={SLIPPAGE_STEPS.map((s) => ({ value: s, label: `${s}%` }))}
            />
          </Field>
          <p className="text-[13px] leading-relaxed text-ink-2">
            If the price moves more than this before your trade lands, nothing is swapped.
            {quoted && out > 0n && (
              <>
                {" "}
                You get at least{" "}
                <span className="num text-ink">
                  {showOut(minOut)} {outSymbol}
                </span>
                .
              </>
            )}
          </p>
        </div>
      )}

      <Field
        as="div"
        label={isBuy ? "You pay" : "You sell"}
        hint={address ? `Balance ${balance !== undefined ? showIn(balance) : "…"}` : undefined}
        error={
          insufficient && !holdsNone ? (
            <>
              That is more {inSymbol} than this wallet holds.{payToken && <> {getIt("Get more on Jupiter")}</>}
            </>
          ) : undefined
        }
      >
        <div className="relative">
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            invalid={insufficient && !holdsNone}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            aria-label={`Amount of ${inSymbol} to ${isBuy ? "spend" : "sell"}`}
            className="num h-14 pr-28 text-xl font-medium"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex max-w-[45%] items-center gap-2">
            {isBuy ? (
              <QuoteLogo symbol={quote.symbol} logo={quote.logo} size={20} />
            ) : (
              <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={20} />
            )}
            <span className="truncate text-sm font-medium text-ink">{inSymbol}</span>
          </span>
        </div>
        <div role="group" aria-label="Quick amounts" className="mt-2.5 grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <Button
              key={p.label}
              variant="secondary"
              size="sm"
              title={p.hint}
              onClick={p.apply}
              disabled={p.needsBalance && balance === undefined}
              className="num px-0 max-lg:h-11"
            >
              {p.label}
            </Button>
          ))}
        </div>
        {holdsNone ? (
          <p role="note" className="mt-3 rounded-lg bg-white/5 px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
            {coin.symbol} is bought with {pairToken}, and this wallet holds none. {transferNote} {getIt(`Get ${quote.symbol} on Jupiter`)}
          </p>
        ) : (
          unusualPair && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              {isBuy ? "You pay in" : "You are paid in"} {pairToken}, not in SOL. {transferNote}
            </p>
          )
        )}
      </Field>

      <dl className="space-y-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-ink-2">You get ≈</dt>
          <dd className="num min-w-0 text-right text-base font-medium text-ink">
            {amountRaw === 0n ? (
              <span className="text-ink-3">0 {outSymbol}</span>
            ) : quoteQuery.isError ? (
              <span role="alert" className="block text-[13px] leading-snug font-normal text-loss">
                {errorMessage(quoteQuery.error)}
              </span>
            ) : q ? (
              <>
                {showOut(out)} {outSymbol}
                {outUsd > 0 && <span className="ml-2 text-[13px] font-normal text-ink-3">{usd(outValue)}</span>}
              </>
            ) : (
              <Loader2 size={14} className="inline animate-spin text-ink-3" aria-label="Getting a price" />
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-2">Fee</dt>
          <dd className="num text-right text-ink-2">
            {bps(feeBps)}
            {quoted && BigInt(q.fee) > 0n && <span className="text-ink-3"> · {quoteTokens(q.fee, quote, quote.symbol)}</span>}
          </dd>
        </div>
      </dl>

      {quoted && q.priceImpact > HIGH_IMPACT && (
        <p role="alert" className="text-[13px] leading-relaxed text-loss">
          This trade moves the price by {pct(q.priceImpact * 100, { digits: 1 })}. A smaller amount gets a better price.
        </p>
      )}

      <div className="space-y-3">
        {!address ? (
          <Button variant="primary" size="lg" block onClick={openWallet}>
            Connect wallet
          </Button>
        ) : (
          <Button variant="primary" size="lg" block disabled={tx.busy || inputRaw === 0n || insufficient} onClick={submit}>
            {tx.busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {holdsNone && inputRaw > 0n ? `No ${quote.symbol} to pay with` : insufficient ? `Not enough ${inSymbol}` : tx.busy ? "Sending…" : `${isBuy ? "Buy" : "Sell"} ${coin.symbol}`}
          </Button>
        )}
        <TxStatus state={tx.state} />
        <p className="text-xs leading-relaxed text-ink-3">
          None of the fee goes to the creator: it funds the OTC reserve and {brand.shield}.{" "}
          <Link href={`${brand.docsPath}#fees`} className="link whitespace-nowrap">
            How fees work
          </Link>
        </p>
      </div>
    </PanelBody>
  );

  const label = `Buy or sell ${coin.symbol}`;
  return onClose ? (
    <section aria-label={label} className={className}>
      {body}
    </section>
  ) : (
    <Panel as="section" aria-label={label} className={className}>
      {body}
    </Panel>
  );
}
