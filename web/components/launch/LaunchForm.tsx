"use client";

import clsx from "clsx";
import { GraduationCap, Globe, ImagePlus, Loader2, Lock, Rocket, Send, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { brand, buyTaxBpsAt, GRADUATION_MCAP_USD, LAUNCH_FEE_SOL, NATIVE_MINT, SNIPE, START_MCAP_USD, type QuoteAsset } from "@cook/shared";
import { buckets } from "@/lib/buckets";
import { client, useBalances, useQuotes, useStats } from "@/lib/data";
import { bps, formatRaw, sol, toRaw, tokens, units, usd } from "@/lib/format";
import { useSolanaTx } from "@/lib/tx";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { FeeSplitBar } from "@/components/FeeSplitBar";
import { GraduationBar } from "@/components/GraduationBar";
import { QuoteChip } from "@/components/QuoteChip";
import { Sparkline } from "@/components/Sparkline";
import { TxStatus } from "@/components/TxStatus";
import { Badge, Button, Field, Input } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { QuotePicker } from "./QuotePicker";

const textareaClass =
  "w-full resize-none rounded-2xl border border-line bg-sunk px-4 py-3 text-sm outline-none transition-all placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-elev focus:shadow-[0_0_0_4px_var(--accent-soft)]";

const LAUNCH_FEE_LAMPORTS = BigInt(Math.round(LAUNCH_FEE_SOL * 1e9));
const SOL_RESERVE = 30_000_000n; // ~0.03 SOL for rent and network fees on top of the launch fee

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function StepCard({
  n,
  title,
  sub,
  children,
  aside,
}: {
  n: number;
  title: string;
  sub?: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="surface rounded-[22px] p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xs font-semibold text-accent shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_25%,transparent)]">
            0{n}
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            {sub && <p className="mt-1 text-[13px] leading-relaxed text-muted">{sub}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}

function IconInput({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint">{icon}</span>
      <Input {...props} className="pl-10" />
    </div>
  );
}

function AntiSnipeChart() {
  const steps = Array.from({ length: SNIPE.seconds + 1 }, (_, s) => buyTaxBpsAt(s));
  return (
    <div className="grid grid-cols-7 items-end gap-1.5">
      {steps.map((t, s) => {
        const base = s === SNIPE.seconds;
        return (
          <div key={s} className="text-center">
            <div className="flex h-24 items-end justify-center rounded-xl bg-sunk p-1">
              <div
                className="w-full rounded-lg transition-[height] duration-700"
                style={{
                  height: `${Math.max(6, t / 100)}%`,
                  background: base
                    ? "var(--accent)"
                    : `linear-gradient(180deg, var(--b-coin), color-mix(in srgb, var(--b-coin) 45%, var(--b-main)))`,
                  boxShadow: base ? "0 0 12px -2px var(--accent)" : "0 0 12px -4px var(--b-coin)",
                }}
              />
            </div>
            <div className={clsx("num mt-1.5 text-[11px] font-medium", base ? "text-accent" : "text-fg")}>{bps(t)}</div>
            <div className="text-[10px] text-faint">{base ? `${SNIPE.seconds}s+` : `${s}s`}</div>
          </div>
        );
      })}
    </div>
  );
}

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

export function LaunchForm() {
  const router = useRouter();
  const address = useAddress();
  const { open: openWallet } = useWalletModal();
  const { data: allQuotes, isLoading: quotesLoading, isError: quotesError } = useQuotes();
  const { data: stats } = useStats();
  const balances = useBalances(address);
  const tx = useSolanaTx();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [quoteAddr, setQuoteAddr] = useState<string>("");
  const [initialBuy, setInitialBuy] = useState("");

  const quotes = useMemo(() => (allQuotes ?? []).filter((q) => q.available), [allQuotes]);
  const quote: QuoteAsset | undefined =
    quotes.find((q) => q.address === quoteAddr) ?? quotes.find((q) => q.address === NATIVE_MINT) ?? quotes[0];
  useEffect(() => setInitialBuy(""), [quote?.address]);

  const native = quote?.address === NATIVE_MINT;
  const solUsd = stats?.solUsd ?? 0;
  const b = balances.data;
  const quoteBalance = !b || !quote ? undefined : BigInt(native ? b.sol : b.tokens[quote.address] ?? "0");
  const solBalance = b ? BigInt(b.sol) : undefined;

  const initialRaw = quote ? toRaw(initialBuy, quote.decimals) : 0n;
  const initialUsd = quote ? units(initialRaw, quote.decimals) * quote.usdPerUnit : 0;
  const totalLamports = LAUNCH_FEE_LAMPORTS + (native ? initialRaw : 0n);
  const insufficient = (solBalance !== undefined && solBalance < totalLamports) || (!native && quoteBalance !== undefined && initialRaw > quoteBalance);

  const errors: string[] = [];
  if (!name.trim()) errors.push("Name your coin");
  if (!symbol.trim()) errors.push("Pick a ticker");
  if (!quote) errors.push("No quote asset available");
  if (address && insufficient) errors.push("Not enough balance");

  async function upload(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
      setImage(json.url);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  function maxBuy() {
    if (!quote || quoteBalance === undefined) return;
    const v = native ? (quoteBalance > LAUNCH_FEE_LAMPORTS + SOL_RESERVE ? quoteBalance - LAUNCH_FEE_LAMPORTS - SOL_RESERVE : 0n) : quoteBalance;
    setInitialBuy(formatRaw(v, quote.decimals));
  }

  async function submit() {
    if (!address || !quote || errors.length) return;
    const r = await tx.run(`Launch ${symbol.toUpperCase()}`, () =>
      client.launch({
        wallet: address,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        image: absoluteImage(image),
        website: website.trim(),
        twitter: twitter.trim(),
        telegram: telegram.trim(),
        quote: quote.address,
        initialBuy: initialRaw.toString(),
      }),
    );
    if (r) router.push(`/token/${r.res.mint}`);
  }

  const busy = tx.busy;
  const ticker = symbol || "TICKER";

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
      {/* ------------------------------------------------ form */}
      <div className="min-w-0 space-y-5">
        <StepCard n={1} title="Identity" sub="What people will see in lists, charts and wallets.">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={clsx(
                  "group relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-[22px] border-2 border-dashed transition-all",
                  dragOver
                    ? "scale-[1.02] border-accent bg-accent-soft text-accent"
                    : "border-line-strong bg-sunk text-muted hover:border-accent hover:text-fg",
                )}
              >
                {image && !dragOver ? (
                  <>
                    <CoinAvatar src={image} symbol={symbol || "?"} size={144} className="rounded-[20px]! shadow-none!" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Replace
                    </span>
                  </>
                ) : uploading ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <span className="flex flex-col items-center gap-2 px-3 text-center text-xs">
                    <ImagePlus size={24} />
                    <span className="font-medium">{dragOver ? "Drop it" : "Drop image"}</span>
                    <span className="text-[10px] text-faint">or click · PNG, JPG, GIF, WEBP</span>
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
            </div>
            <div className="grid flex-1 content-start gap-4 sm:grid-cols-2">
              <Field label="Name" hint={`${name.length}/32`}>
                <Input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Moon Cat" />
              </Field>
              <Field label="Ticker" hint={`${symbol.length}/10`}>
                <IconInput
                  icon={<span className="text-sm font-semibold">$</span>}
                  value={symbol}
                  maxLength={10}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder="MCAT"
                />
              </Field>
              <Field label="Image URL" hint="or drop a file" className="sm:col-span-2">
                <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://… or ipfs://…" />
              </Field>
              {uploadError && <p className="text-xs text-down sm:col-span-2">{uploadError}</p>}
            </div>
          </div>
        </StepCard>

        <StepCard n={2} title="Story & links" sub="Optional, but coins with a story and socials get found.">
          <Field label="Description" hint={`${description.length}/280`}>
            <textarea
              value={description}
              maxLength={280}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this coin about?"
              className={textareaClass}
            />
          </Field>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Website">
              <IconInput icon={<Globe size={15} />} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
            </Field>
            <Field label="X">
              <IconInput icon={<XIcon size={13} />} value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" />
            </Field>
            <Field label="Telegram">
              <IconInput icon={<Send size={14} />} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/group" />
            </Field>
          </div>
        </StepCard>

        <StepCard
          n={3}
          title="Market"
          sub="Pick what your coin trades against: SOL, a stablecoin or a tokenized stock. Whatever the pair, the protection fund and OTC reserve always receive SOL."
        >
          {quotesLoading && <p className="mb-3 text-xs text-muted">Loading pairs…</p>}
          {quotesError && <p className="mb-3 text-xs text-down">Couldn&apos;t load pairs from the Recur API.</p>}
          <QuotePicker quotes={quotes} value={quote} onChange={(q) => setQuoteAddr(q.address)} />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-sunk px-4 py-3">
              <div className="text-[11px] tracking-wider text-faint uppercase">Starts at</div>
              <div className="num mt-1 text-lg font-medium">{usd(quote?.startMcapUsd ?? START_MCAP_USD)}</div>
              <div className="text-[11px] text-faint">market cap</div>
            </div>
            <div className="rounded-2xl bg-sunk px-4 py-3">
              <div className="flex items-center gap-1.5 text-[11px] tracking-wider text-faint uppercase">
                <GraduationCap size={12} /> Graduates at
              </div>
              <div className="num mt-1 text-lg font-medium">{usd(quote?.graduationMcapUsd ?? GRADUATION_MCAP_USD)}</div>
              <div className="text-[11px] text-faint">then trades on Meteora DAMM v2</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Same USD targets for every pair, converted into {quote?.symbol ?? "the quote"} at its live price when the pair&apos;s curve is
            set up.
          </p>

          <div className="mt-6">
            <Field
              label="Your first buy (optional)"
              hint={
                address && quoteBalance !== undefined && quote ? (
                  <button type="button" onClick={maxBuy} className="num transition-colors hover:text-fg">
                    Balance {tokens(quoteBalance, quote.decimals)} {quote.symbol}
                  </button>
                ) : (
                  "skips the anti-snipe fee"
                )
              }
            >
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={initialBuy}
                  onChange={(e) => setInitialBuy(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.0"
                  className="num h-14 pr-28 text-lg"
                />
                <span className="absolute top-1/2 right-3 -translate-y-1/2">
                  {quote && <QuoteChip symbol={quote.symbol} logo={quote.logo} />}
                </span>
              </div>
            </Field>
            <p className="mt-2 text-[11px] text-faint">
              {initialRaw > 0n && quote && quote.usdPerUnit > 0 ? <span className="num text-muted">≈ {usd(initialUsd)} · </span> : null}
              You buy first, in the launch transaction itself, at the normal 3% with no anti-snipe surcharge.
            </p>
          </div>
        </StepCard>

        {/* sticky summary + CTA */}
        <div className="glass ring-spectrum shadow-pop sticky bottom-4 z-20 rounded-[22px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CoinAvatar src={image} symbol={symbol || "?"} seed={name + symbol} size={40} />
              <div className="min-w-0 text-xs">
                <div className="truncate text-sm font-semibold">
                  {name || "Your coin"} <span className="text-muted">${ticker}</span>
                </div>
                <div className="num mt-0.5 text-muted">
                  Fee {sol(LAUNCH_FEE_SOL)}
                  {solUsd > 0 && <> ({usd(LAUNCH_FEE_SOL * solUsd)})</>}
                  {initialRaw > 0n && quote && (
                    <>
                      {" "}
                      · first buy {initialBuy} {quote.symbol}
                      {quote.usdPerUnit > 0 && <> ({usd(initialUsd)})</>}
                    </>
                  )}
                  {native && initialRaw > 0n && <> · total {sol(units(totalLamports, 9))}</>}
                </div>
              </div>
            </div>
            <div className="w-full sm:w-auto">
              {!address ? (
                <Button className="w-full sm:min-w-56" size="lg" onClick={openWallet}>
                  Connect wallet
                </Button>
              ) : (
                <Button className="w-full sm:min-w-56" size="lg" disabled={busy || errors.length > 0} onClick={submit}>
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <Rocket size={17} />}
                  {busy ? "Launching…" : errors.length ? errors[0] : `Launch $${symbol || "coin"}`}
                </Button>
              )}
            </div>
          </div>
          <TxStatus state={tx.state} className="mt-3" />
        </div>
      </div>

      {/* ------------------------------------------------ live preview */}
      <aside className="no-scrollbar space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow flex items-center gap-2">
              <span className="live-dot" /> Live preview
            </span>
            <span className="text-[11px] text-faint">how it shows up in Trending</span>
          </div>
          <div className="ring-spectrum shadow-pop relative overflow-hidden rounded-[22px] p-5">
            <span className="font-display absolute top-3 right-4 text-5xl leading-none font-semibold text-fg/[0.06]">1</span>
            <div className="flex items-center gap-3">
              <CoinAvatar src={image} symbol={symbol || "?"} seed={name + symbol} size={48} />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">${ticker}</div>
                <div className="truncate text-xs text-muted">{name || "Your coin"}</div>
              </div>
            </div>
            {description ? (
              <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{description}</p>
            ) : (
              <p className="mt-3 text-xs text-faint">Your description shows here.</p>
            )}
            <Sparkline data={[1, 1.02, 1.01, 1.08, 1.12, 1.1, 1.22, 1.31]} width={340} height={46} strokeWidth={2} className="mt-4 w-full" />
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <div className="num text-lg font-medium">{usd(START_MCAP_USD)}</div>
                <div className="mt-1">{quote && <QuoteChip symbol={quote.symbol} logo={quote.logo} pair={ticker} />}</div>
              </div>
              <Badge tone="accent">New</Badge>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <Lock size={11} /> 1B supply on a Meteora curve
                </span>
                <span className="num">
                  {usd(START_MCAP_USD)} → {usd(GRADUATION_MCAP_USD)}
                </span>
              </div>
              <GraduationBar progress={0} graduated={false} />
            </div>
          </div>
        </section>

        <section className="surface rounded-[22px] p-5">
          <h3 className="text-[15px] font-semibold tracking-tight">Where this coin&apos;s fees go</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            3% of every buy and sell. Meteora keeps its protocol share; the rest is split the same way for every coin. You
            earn by holding, not by taxing.
          </p>
          <FeeSplitBar legend={false} className="mt-4" />
          <ul className="mt-4 space-y-3">
            {buckets.map((b) => (
              <li key={b.key} className="flex gap-3 text-xs">
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: b.color }} />
                <div className="min-w-0">
                  <div className="font-medium">
                    {b.label} <span className="num text-muted">· {b.bps / 100}%</span>
                  </div>
                  <div className="mt-0.5 leading-relaxed text-muted">{b.blurb}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">The launch fee buys back and burns ${brand.mainTicker}.</p>
        </section>

        <section className="surface rounded-[22px] p-5">
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-down" />
            <h3 className="text-[15px] font-semibold tracking-tight">Anti-snipe window</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            For the first {SNIPE.seconds} seconds the pool&apos;s fee starts at 99% and decays to 3%, so bots that buy in the launch
            block pay for it. Your own first buy, bundled into the launch, pays only 3%.
          </p>
          <div className="mt-5">
            <AntiSnipeChart />
          </div>
        </section>
      </aside>
    </div>
  );
}
