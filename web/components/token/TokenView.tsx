"use client";

import clsx from "clsx";
import { ArrowLeft, Check, Copy, ExternalLink, Globe, GraduationCap, Send } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { isSolanaAddress, type CoinDetail } from "@cook/shared";
import { useCoin, useStats } from "@/lib/data";
import { explorerAddress, explorerToken } from "@/lib/explorer";
import { age, num, short, tokens, units, usd } from "@/lib/format";
import { useStickyTop } from "@/lib/useStickyTop";
import { CoinAvatar } from "@/components/CoinAvatar";
import { GraduationBar } from "@/components/GraduationBar";
import { QuoteChip } from "@/components/QuoteChip";
import { Badge, ButtonLink, Change, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ActivityTabs } from "./ActivityTabs";
import { FeesPanel } from "./FeesPanel";
import { MobileTradeBar } from "./MobileTradeBar";
import { OtcPanel } from "./OtcPanel";
import { PositionCard } from "./PositionCard";
import { PriceChart } from "./PriceChart";
import { TinyPrice } from "./TinyPrice";
import { TradePanel } from "./TradePanel";

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ensureHttp(u: string) {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

function SocialButton({ href, label, children }: { href?: string; label: string; children: ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-sunk/60 text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      {children}
    </a>
  );
}

/** One cell of the stats strip. */
function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 bg-elev px-3.5 py-2.5 sm:px-4">
      <div className="truncate text-[10px] tracking-wider text-faint uppercase">{label}</div>
      <div className="num mt-1 truncate text-[15px] font-medium sm:text-base">{value}</div>
      {sub && <div className="num mt-0.5 truncate text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

/** Long descriptions stay two lines until opened. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-3 max-w-3xl">
      <p className={clsx("text-sm leading-relaxed text-muted", !open && "line-clamp-2")}>{text}</p>
      {text.length > 140 && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-medium text-accent hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function GraduationStatus({ coin }: { coin: CoinDetail }) {
  const q = coin.quote;
  if (coin.graduated)
    return (
      <div className="surface flex flex-col gap-2 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-up-soft text-up">
            <GraduationCap size={15} />
          </span>
          <span className="font-medium">Graduated to Meteora DAMM v2</span>
        </div>
        <span className="text-xs text-muted sm:flex-1">
          Same 3% fee on every trade. The pool&apos;s liquidity is locked for good, and its fees keep flowing to the buckets.
        </span>
        {coin.dammPool && (
          <a
            href={explorerAddress(coin.dammPool)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            View pool <ExternalLink size={12} />
          </a>
        )}
      </div>
    );
  return (
    <div className="surface flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex shrink-0 items-center gap-2 text-sm">
        <GraduationCap size={16} className="text-accent" />
        <span className="font-medium">Graduation</span>
        <span className="num text-xs text-muted">
          {num(coin.quoteInPool)} / {num(coin.graduationThreshold)} {q.symbol} in the curve
        </span>
      </div>
      <GraduationBar className="flex-1" progress={coin.graduationProgress} graduated={false} />
      <span className="shrink-0 text-[11px] text-faint">moves to Meteora DAMM v2 at {usd(q.graduationMcapUsd)}</span>
    </div>
  );
}

function TokenSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-[22px]" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-[440px] rounded-[22px]" />
      </div>
      <Skeleton className="h-[520px] rounded-[22px]" />
    </div>
  );
}

export function TokenView({ address }: { address: string }) {
  const valid = isSolanaAddress(address);
  const { data: coin, isLoading, isError, error } = useCoin(valid ? address : undefined);
  const { data: stats } = useStats();
  const solUsd = stats?.solUsd ?? 0;
  const [copied, setCopied] = useState(false);
  const [aside, setAside] = useState<HTMLElement | null>(null);
  const asideTop = useStickyTop(aside);

  if (!valid) return <EmptyState title="That's not a coin address" action={<ButtonLink href="/">Back to coins</ButtonLink>} />;
  if (isLoading) return <TokenSkeleton />;
  if (isError || !coin)
    return String(error).includes("404") ? (
      <EmptyState title="Coin not found" detail="It may not be indexed yet. Give it a few seconds." action={<ButtonLink href="/">Back to coins</ButtonLink>} />
    ) : (
      <ErrorState />
    );

  const q = coin.quote;
  const burnedPct = (units(coin.burned, coin.decimals) / 1e9) * 100;
  const copy = () => {
    navigator.clipboard?.writeText(coin.address).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  };
  const twitter = coin.twitter
    ? coin.twitter.startsWith("http")
      ? coin.twitter
      : `https://x.com/${coin.twitter.replace(/^@/, "")}`
    : undefined;
  const telegram = coin.telegram
    ? coin.telegram.startsWith("http")
      ? coin.telegram
      : `https://t.me/${coin.telegram.replace(/^@/, "")}`
    : undefined;
  const socials = (
    <>
      <SocialButton href={coin.website ? ensureHttp(coin.website) : undefined} label="Website">
        <Globe size={14} />
      </SocialButton>
      <SocialButton href={twitter} label="X">
        <XIcon size={12} />
      </SocialButton>
      <SocialButton href={telegram} label="Telegram">
        <Send size={13} />
      </SocialButton>
      <SocialButton href={explorerToken(coin.address)} label="Solscan">
        <ExternalLink size={13} />
      </SocialButton>
    </>
  );

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg">
        <ArrowLeft size={13} /> All coins
      </Link>

      {/* phones read top to bottom: header, chart, your position, then the details; desktop keeps trading in a side column */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-6 lg:gap-y-4">
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          <section className="surface relative overflow-hidden rounded-[22px] p-4 sm:p-5">
            <div className="spectrum pointer-events-none absolute -top-28 -right-24 h-56 w-56 rounded-full opacity-[0.14] blur-3xl" aria-hidden />
            <div className="relative flex items-start gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <div className="spectrum absolute -inset-1 rounded-full opacity-40 blur-md" aria-hidden />
                <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={48} className="relative" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h1 className="font-display truncate text-2xl leading-tight font-semibold sm:text-3xl">{coin.name}</h1>
                  <span className="font-display shrink-0 text-base text-muted sm:text-xl">${coin.symbol}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
                  <QuoteChip symbol={q.symbol} logo={q.logo} pair={coin.symbol} />
                  {coin.isMain && <Badge tone="accent">Platform token</Badge>}
                  {coin.graduated && (
                    <Badge tone="up">
                      <GraduationCap size={11} /> Graduated
                    </Badge>
                  )}
                  <span className="whitespace-nowrap">
                    by{" "}
                    <a href={explorerAddress(coin.creator)} target="_blank" rel="noreferrer" className="num text-fg/80 hover:text-fg">
                      {short(coin.creator)}
                    </a>
                  </span>
                  <span className="text-faint">·</span>
                  <span className="whitespace-nowrap">{age(coin.createdAt)} ago</span>
                  <button
                    onClick={copy}
                    className="num inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk/60 px-2.5 py-0.5 transition-colors hover:border-line-strong hover:text-fg"
                  >
                    {short(coin.address, 5)}
                    {copied ? <Check size={11} className="text-up" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>
              <div className="hidden shrink-0 gap-1.5 sm:flex">{socials}</div>
            </div>
            <div className="relative mt-3 flex gap-1.5 sm:hidden">{socials}</div>
            {coin.description && <Description text={coin.description} />}
          </section>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-6">
            <Stat label="Market cap" value={usd(coin.marketCapUsd)} sub={<Change value={coin.change24h} className="text-[11px]" />} />
            <Stat
              label="Price"
              value={
                <>
                  $<TinyPrice value={coin.priceUsd} />
                </>
              }
              sub={
                <>
                  <TinyPrice value={coin.price} /> {q.symbol}
                </>
              }
            />
            <Stat label="24h volume" value={usd(coin.volume24hUsd)} sub={`${coin.trades24h} trades`} />
            <Stat label="Holders" value={num(coin.holders)} sub="wallets" />
            <Stat label="Burned" value={`${burnedPct.toFixed(2)}%`} sub={`${tokens(coin.burned, coin.decimals)} ${coin.symbol}`} />
            <Stat label="Fees paid" value={usd(coin.feesUsd)} sub="all back to holders" />
          </div>
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <PriceChart coin={coin} />
        </div>

        {/* trading stays in view on desktop: the column sticks, and scrolls with the page when it's taller than the screen */}
        <aside ref={setAside} style={{ top: asideTop }} className="space-y-4 lg:sticky lg:col-start-2 lg:row-span-5 lg:row-start-1">
          {/* phones trade from the bottom bar's sheet instead */}
          <div className="hidden lg:block">
            <TradePanel coin={coin} />
          </div>
          <PositionCard coin={coin} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-3">
          <GraduationStatus coin={coin} />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-4">
          <ActivityTabs coin={coin} />
        </div>
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:col-start-1 lg:row-start-5 xl:grid-cols-2">
          <FeesPanel coin={coin} solUsd={solUsd} />
          <OtcPanel coin={coin} solUsd={solUsd} />
        </div>
      </div>
      <MobileTradeBar coin={coin} />
    </div>
  );
}
