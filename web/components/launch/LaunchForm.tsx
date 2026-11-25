"use client";

import clsx from "clsx";
import { ChevronDown, Loader2 } from "lucide-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LAUNCH_RENT_SOL, NATIVE_MINT, feeBreakdown, type QuoteAsset } from "@gantry/shared";
import { client, useBalances, useFleetCheck, useQuotes, useStats } from "@/lib/data";
import { bps, formatRaw, num, pct, sig, sol, toRaw, tokens, units } from "@/lib/format";
import { quoteTokens, rawToTyped, shownPrice, typedToRaw } from "@/lib/quoteUnits";
import { tokenDelta, useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { TxStatus } from "@/components/TxStatus";
import { Button, Field, Input, Notice, Panel, PanelBody, Skeleton, Textarea } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { CURVE_COST_USD, curveAfter } from "./curve";
import { FleetNotice } from "./FleetNotice";
import { ImageWell } from "./ImageWell";
import { PairPicker } from "./PairPicker";

/** The backend's limits: the name is stored in 32 bytes of on-chain metadata, a ticker is 1–10 letters or digits. */
const NAME_MAX_BYTES = 32;
const TICKER_MAX = 10;
const DESCRIPTION_MAX = 280;

const RENT_LAMPORTS = BigInt(Math.round(LAUNCH_RENT_SOL * 1e9));
/** What "Max" leaves in the wallet on top of the rent: network fees and the token accounts a first buy opens. */
const SOL_HEADROOM = 15_000_000n;
/** First-buy shortcuts: in SOL, or about this many dollars of the pair's token. */
const SOL_PRESETS = ["0.1", "0.5", "1"];
const USD_PRESETS = [10, 50, 100];

const byteLength = (s: string) => new TextEncoder().encode(s).length;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Wallets and explorers need an absolute image URL in token metadata. */
const absoluteImage = (src: string) => {
  const s = src.trim();
  if (!s || /^(https?:|ipfs:|ar:|data:)/.test(s)) return s;
  try {
    return new URL(s, window.location.origin).href;
  } catch {
    return s;
  }
};

/**
 * The launch form: one card with the coin's details, its pair and an optional first buy, then the total and the one
 * button that connects a wallet or launches. On a phone the button sits in a bar docked above the tab bar.
 */
export function LaunchForm() {
  const router = useRouter();
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const { data: listed, isLoading: quotesLoading, isError: quotesError } = useQuotes();
  const { data: stats } = useStats();
  const balances = useBalances(address);
  const tx = useSolanaTx();
  const { connection } = useConnection();

  // the launch bar is docked over the bottom of a phone screen: make room for it, and keep a focused field clear of it
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.scrollPaddingBottom;
    html.classList.add("has-dock");
    html.style.scrollPaddingBottom = "calc(var(--chrome-bottom) + var(--dock-h) + 1rem)";
    return () => {
      html.classList.remove("has-dock");
      html.style.scrollPaddingBottom = before;
    };
  }, []);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [quoteAddr, setQuoteAddr] = useState("");
  const pickQuote = useCallback((q: QuoteAsset) => setQuoteAddr(q.address), []);
  const [initialBuy, setInitialBuy] = useState("");
  // on a pair other than SOL the first buy can still be paid in SOL: it is swapped into the pair's token just before the launch
  const [payWith, setPayWith] = useState<"sol" | "quote">("sol");

  // ---------------------------------------------------------------- pair
  const quotes = listed ?? [];
  // the chosen pair, or SOL, or whichever pair can take a launch: never one that is paused
  const launchable = quotes.filter((q) => q.available);
  const quote = launchable.find((q) => q.address === quoteAddr) ?? launchable.find((q) => q.address === NATIVE_MINT) ?? launchable[0];
  const solQuote = quotes.find((q) => q.address === NATIVE_MINT);
  useEffect(() => {
    setInitialBuy("");
    setPayWith("sol");
  }, [quote?.address]);

  const native = quote?.address === NATIVE_MINT;
  const paySol = !!quote && !native && payWith === "sol";
  const inSol = native || paySol;
  const buyUnit = inSol ? "SOL" : (quote?.symbol ?? "");
  const solUsd = stats?.solUsd || solQuote?.usdPerUnit || 0;
  const b = balances.data;
  const solBalance = b ? BigInt(b.sol) : undefined;
  const quoteBalance = !b || !quote ? undefined : BigInt(native ? b.sol : (b.tokens[quote.address] ?? "0"));

  // ---------------------------------------------------------------- name and ticker
  const cleanName = name.trim();
  const nameBytes = byteLength(cleanName);
  const nameError =
    nameBytes > NAME_MAX_BYTES
      ? `Too long: ${nameBytes} of ${NAME_MAX_BYTES} bytes. Emoji and accented letters count for more than one.`
      : "";
  const tickerError = /[^A-Z0-9]/.test(symbol)
    ? "Letters A–Z and digits 0–9 only."
    : symbol.length > TICKER_MAX
      ? `Too long: ${TICKER_MAX} characters at most.`
      : "";

  // a copy of a coin whose family is active pays that family's entry; the check waits for typing to settle
  const [checked, setChecked] = useState({ symbol: "", name: "" });
  useEffect(() => {
    const t = setTimeout(() => setChecked({ symbol, name: cleanName }), 350);
    return () => clearTimeout(t);
  }, [symbol, cleanName]);
  const fleet = useFleetCheck({ ...checked, quote: quote?.address });
  const settled = checked.symbol === symbol && checked.name === cleanName && !fleet.isLoading;
  const family = settled ? (fleet.data?.family ?? null) : null;
  const entry = fleet.data?.entry ?? null;
  const entryRaw = entry ? BigInt(entry.quoteRaw) : 0n;
  const entryRent = entry ? BigInt(entry.rentLamports) : 0n;
  // the SOL that buys the entry: itself on the SOL pair, or swapped into the pair's token with 1% of room for the price
  const entrySol =
    !entry || !quote ? 0n : native ? entryRaw : paySol ? BigInt(Math.ceil(units(entryRaw, quote.decimals) * quote.solPerUnit * 1.01 * 1e9)) : 0n;
  const entryCost = !entry || !quote ? "" : inSol ? `≈ ${sol(units(entrySol, 9))}` : quoteTokens(entryRaw, quote, quote.symbol);

  // ---------------------------------------------------------------- first buy and cost
  // an amount of the pair's token is typed, and shown, the way a wallet counts it (lib/quoteUnits); everything from
  // `initialRaw` on is the raw amount the API and the chain use
  const initialRaw = !quote ? 0n : inSol ? toRaw(initialBuy, 9) : typedToRaw(initialBuy, quote);
  const buyUsd = inSol ? units(initialRaw, 9) * solUsd : quote ? units(initialRaw, quote.decimals) * quote.usdPerUnit : 0;
  const swapLamports = paySol ? initialRaw + entrySol : 0n;
  const solLamports = RENT_LAMPORTS + entryRent + (inSol ? initialRaw + entrySol : 0n);
  const quoteOut = !inSol && quote ? initialRaw + entryRaw : 0n;
  const shortSol = solBalance !== undefined && solBalance < solLamports;
  const shortQuote = quoteOut > 0n && quoteBalance !== undefined && quoteOut > quoteBalance;
  const total = `≈ ${sol(units(solLamports, 9))}${quoteOut > 0n && quote ? ` + ${quoteTokens(quoteOut, quote, quote.symbol)}` : ""}`;

  // what the first buy receives: a copy's entry is bought first, then the creator's own buy
  const afterEntry = curveAfter(entry?.usd ?? 0);
  const afterBuy = curveAfter((entry?.usd ?? 0) + buyUsd);
  const buyShare = Math.max(0, afterBuy.share - afterEntry.share);

  const balanceKnown = !!address && !!quote && (inSol ? solBalance : quoteBalance) !== undefined;
  const presets = inSol ? SOL_PRESETS : quote && quote.usdPerUnit > 0 ? USD_PRESETS.map((u) => sig(u / shownPrice(quote.usdPerUnit, quote), 2)) : [];

  // ---------------------------------------------------------------- what holds the launch, most important first
  const blocker = !cleanName
    ? "Add a name."
    : nameError
      ? "Shorten the name."
      : !symbol
        ? "Add a ticker."
        : tickerError
          ? "Fix the ticker."
          : uploading
            ? "The image is still uploading."
            : quotesLoading
              ? "Loading the pairs…"
              : !quote
                ? "No pair is open for launches right now."
                : !settled
                  ? "Checking the ticker…"
                  : shortSol && solBalance !== undefined
                    ? `Not enough SOL: you need ${sol(units(solLamports - solBalance, 9))} more.`
                    : shortQuote
                      ? `Not enough ${quote.symbol}: you need ${quoteTokens(quoteOut - (quoteBalance ?? 0n), quote)} more, or pay in SOL.`
                      : "";
  const fee = bps(feeBreakdown("curve", stats?.cluster ?? "mainnet-beta").taxBps);

  function maxBuy() {
    if (!quote) return;
    if (inSol) {
      if (solBalance === undefined) return;
      const keep = RENT_LAMPORTS + SOL_HEADROOM + entryRent + entrySol;
      setInitialBuy(formatRaw(solBalance > keep ? solBalance - keep : 0n, 9));
    } else if (quoteBalance !== undefined) setInitialBuy(rawToTyped(quoteBalance > entryRaw ? quoteBalance - entryRaw : 0n, quote));
  }

  async function launch() {
    if (!address || !quote || blocker) return;
    let buy = initialRaw;
    if (swapLamports > 0n) {
      const r = await tx.run(`Swap ${sol(units(swapLamports, 9))} into ${quote.symbol}`, () =>
        client.solToQuote({ wallet: address, quote: quote.address, lamports: swapLamports.toString() }),
      );
      if (!r) return;
      const got = r.res.demo ? BigInt(r.res.outAmount) : await tokenDelta(connection, r.signature, address, quote.address, BigInt(r.res.minOut));
      // the entry comes out of what arrived; the rest is the first buy
      buy = got > entryRaw ? got - entryRaw : 0n;
      // from here it is a first buy in the pair's token, so a failed or rejected launch retries without swapping again
      setPayWith("quote");
      setInitialBuy(rawToTyped(buy, quote));
    }
    const r = await tx.run(`Launch $${symbol}`, () =>
      client.launch({
        wallet: address,
        name: cleanName,
        symbol,
        description: description.trim(),
        image: absoluteImage(image),
        website: website.trim(),
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        quote: quote.address,
        initialBuy: buy.toString(),
        entry: entry ? entryRaw.toString() : undefined,
      }),
    );
    if (r) router.push(`/token/${r.res.mint}`);
  }

  // the one primary button, in the page on wide screens and in the dock on phones
  const action = (className?: string) =>
    !address ? (
      <Button type="button" size="lg" className={className} onClick={openWallet}>
        Connect wallet
      </Button>
    ) : (
      <Button type="button" size="lg" className={className} disabled={tx.busy || !!blocker} onClick={launch}>
        {tx.busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {tx.busy ? "Working…" : symbol && !tickerError ? `Launch $${symbol}` : "Launch"}
      </Button>
    );
  // why the button is off, once there is a wallet to launch with
  const hold = address && !tx.busy ? blocker : "";

  return (
    <div className={clsx("mt-6 sm:mt-8", tx.state.status !== "idle" && "max-lg:pb-14")}>
      <form noValidate aria-label="Coin details" onSubmit={(e) => e.preventDefault()}>
        <Panel>
          <PanelBody className="space-y-6">
            <div>
              <div className="flex items-start gap-4">
                <ImageWell value={image} symbol={symbol} onChange={setImage} onBusy={setUploading} onError={setImageError} />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <Field
                    label="Name"
                    hint={!nameError && nameBytes > NAME_MAX_BYTES - 6 ? `${nameBytes}/${NAME_MAX_BYTES}` : undefined}
                    error={nameError}
                  >
                    <Input
                      value={name}
                      maxLength={64}
                      autoComplete="off"
                      invalid={!!nameError}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Orbit Dog"
                    />
                  </Field>
                  <Field
                    label="Ticker"
                    hint={!tickerError && symbol.length > TICKER_MAX - 3 ? `${symbol.length}/${TICKER_MAX}` : undefined}
                    error={tickerError}
                  >
                    <span className="relative block">
                      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-3">
                        $
                      </span>
                      <Input
                        value={symbol}
                        maxLength={16}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        invalid={!!tickerError}
                        onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/^\$+/, "").replace(/\s+/g, ""))}
                        placeholder="ORBIT"
                        className="pl-7"
                      />
                    </span>
                  </Field>
                </div>
              </div>
              {imageError && (
                <p role="alert" className="mt-2 text-[13px] text-loss">
                  {imageError}
                </p>
              )}
              <div aria-live="polite">
                {family && fleet.data && quote && (
                  <div className="mt-4">
                    <FleetNotice check={fleet.data} entryCost={entryCost} entryRent={`≈ ${sol(units(entryRent, 9))}`} />
                  </div>
                )}
              </div>
            </div>

            <Field
              label="Description (optional)"
              hint={description.length > DESCRIPTION_MAX - 40 ? `${description.length}/${DESCRIPTION_MAX}` : undefined}
            >
              <Textarea
                value={description}
                maxLength={DESCRIPTION_MAX}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One or two lines on what this coin is."
                className="min-h-[4.75rem]"
              />
            </Field>

            <Field as="div" label="Pair">
              {quotesLoading ? (
                <Skeleton className="h-14 rounded-md sm:h-11" />
              ) : quotesError ? (
                <Notice tone="loss">The pairs didn&apos;t load. Refresh the page to try again.</Notice>
              ) : quotes.length === 0 ? (
                <Notice>No pairs are available right now.</Notice>
              ) : (
                <PairPicker aria-label="Pair" quotes={quotes} value={quote} onChange={pickQuote} tradeFee={fee} />
              )}
            </Field>

            <Field
              as="div"
              label="First buy (optional)"
              hint={
                balanceKnown && quote ? `Balance ${inSol ? tokens(solBalance!, 9) : quoteTokens(quoteBalance!, quote)} ${buyUnit}` : undefined
              }
            >
              <div className="relative">
                <Input
                  aria-label={`First buy amount in ${buyUnit || "the pair's token"}`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={!quote}
                  value={initialBuy}
                  onChange={(e) => setInitialBuy(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                  className="num pr-20"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-2">{buyUnit}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {presets.map((p) => (
                  <Button key={p} type="button" variant="secondary" size="sm" disabled={!quote} onClick={() => setInitialBuy(p)}>
                    <span className="num">{p}</span>
                  </Button>
                ))}
                {balanceKnown && (
                  <Button type="button" variant="secondary" size="sm" onClick={maxBuy}>
                    Max
                  </Button>
                )}
                {quote && !native && (
                  <label className="group ml-auto flex cursor-pointer items-center gap-2 py-1 text-[13px] text-ink-2">
                    <input
                      type="checkbox"
                      role="switch"
                      className="sr-only"
                      checked={payWith === "sol"}
                      onChange={(e) => {
                        setPayWith(e.target.checked ? "sol" : "quote");
                        setInitialBuy("");
                      }}
                    />
                    Pay in SOL
                    <span
                      aria-hidden
                      className="flex h-5 w-9 items-center rounded-[999px] bg-rule-strong p-0.5 transition-colors group-has-[:checked]:bg-signal group-has-[:focus-visible]:outline-2 group-has-[:focus-visible]:outline-offset-2 group-has-[:focus-visible]:outline-signal"
                    >
                      <span className="size-4 rounded-[999px] bg-ink transition-transform group-has-[:checked]:translate-x-4 group-has-[:checked]:bg-ink-inverse" />
                    </span>
                  </label>
                )}
              </div>
              <div aria-live="polite" className="text-[13px] leading-relaxed text-ink-2 empty:hidden">
                {initialRaw > 0n && afterBuy.full ? (
                  <p className="mt-2">That is more than the whole curve: about {dollars(CURVE_COST_USD)} buys all of it.</p>
                ) : buyShare > 0 ? (
                  <p className="mt-2">
                    You get ≈ <span className="num text-ink">{num(buyShare * 1e9)}</span> coins (
                    <span className="num">{pct(buyShare * 100, { digits: 2 })}</span> of supply).
                  </p>
                ) : null}
                {swapLamports > 0n && quote && (
                  <p className="mt-2">
                    You&apos;ll sign twice: first a swap of your SOL into {quote.symbol}, then the launch.
                  </p>
                )}
              </div>
            </Field>

            <details className="group/more">
              <summary className="flex list-none items-center justify-between gap-3 text-sm text-ink-2 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                <span>
                  More options <span className="text-ink-3">· website, X, Telegram</span>
                </span>
                <ChevronDown size={16} className="shrink-0 transition-transform group-open/more:rotate-180" aria-hidden />
              </summary>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Website">
                  <Input value={website} autoComplete="off" onChange={(e) => setWebsite(e.target.value)} placeholder="Default: coin page" />
                </Field>
                <Field label="X">
                  <Input value={twitter} autoComplete="off" onChange={(e) => setTwitter(e.target.value)} placeholder="@orbitdog" />
                </Field>
                <Field label="Telegram">
                  <Input value={telegram} autoComplete="off" onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/orbitdog" />
                </Field>
              </div>
            </details>
          </PanelBody>
        </Panel>
      </form>

      <p className="mt-5 text-sm leading-relaxed text-ink-2">
        <span className="max-lg:hidden">
          Total: <span className="num text-ink">{total}</span> ·{" "}
        </span>
        The {fee} fee on every trade goes to holders, none to you.
      </p>

      {/* wide screens: the button under the form */}
      <div className="mt-4 space-y-3 max-lg:hidden">
        {action("w-full")}
        {hold && (
          <p aria-live="polite" className="text-[13px] text-ink-2">
            {hold}
          </p>
        )}
        <TxStatus state={tx.state} />
      </div>

      {/* phones: the same button in a bar docked above the tab bar */}
      <div role="region" aria-label="Launch" className="dock lg:hidden">
        {tx.state.status !== "idle" && <TxStatus state={tx.state} className="mx-[var(--gutter)] mt-2" />}
        <div className="flex h-[67px] items-center gap-3 px-[var(--gutter)]">
          <p aria-live="polite" className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
            {hold || (
              <>
                Total <span className="num text-ink">{total}</span>
              </>
            )}
          </p>
          {action("shrink-0 px-5")}
        </div>
      </div>
    </div>
  );
}
