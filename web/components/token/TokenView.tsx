"use client";

import clsx from "clsx";
import { ArrowLeft, Check, Copy, ExternalLink, Globe, GraduationCap, Send } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { isSolanaAddress } from "@cook/shared";
import { useCoin, useStats } from "@/lib/data";
import { explorerAddress, explorerToken } from "@/lib/explorer";
import { age, num, short, tokens, units, usd } from "@/lib/format";
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
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-sunk/60 text-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      {children}
    </a>
  );
}

function StatTile({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("surface min-w-0 rounded-2xl px-4 py-3.5", className)}>
      <div className="text-[11px] tracking-wider text-faint uppercase">{label}</div>
      <div className="num mt-1.5 truncate text-lg font-medium sm:text-xl">{value}</div>
      {sub && <div className="num mt-0.5 truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

function TokenSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Skeleton className="h-36 w-full rounded-[22px]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
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

  return (
    <div className="space-y-5">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg">
        <ArrowLeft size={13} /> All coins
      </Link>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        {/* header + stats */}
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <section className="surface relative overflow-hidden rounded-[22px] p-5 sm:p-6">
            <div className="spectrum pointer-events-none absolute -top-28 -right-24 h-56 w-56 rounded-full opacity-[0.14] blur-3xl" aria-hidden />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="relative shrink-0">
                  <div className="spectrum absolute -inset-1 rounded-full opacity-40 blur-md" aria-hidden />
                  <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={64} className="relative" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    <h1 className="font-display truncate text-3xl leading-tight font-semibold sm:text-4xl">{coin.name}</h1>
                    <span className="font-display text-xl text-muted">${coin.symbol}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <QuoteChip symbol={q.symbol} logo={q.logo} pair={coin.symbol} />
                    {coin.isMain && <Badge tone="accent">Platform token</Badge>}
                    {coin.graduated && (
                      <Badge tone="up">
                        <GraduationCap size={11} /> Graduated
                      </Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                    <span>
                      by{" "}
                      <a href={explorerAddress(coin.creator)} target="_blank" rel="noreferrer" className="num text-fg/80 hover:text-fg">
                        {short(coin.creator)}
                      </a>
                    </span>
                    <span className="text-faint">·</span>
                    <span>{age(coin.createdAt)} ago</span>
                    <span className="text-faint">·</span>
                    <button
                      onClick={copy}
                      className="num inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk/60 px-2.5 py-0.5 transition-colors hover:border-line-strong hover:text-fg"
                    >
                      {short(coin.address, 5)}
                      {copied ? <Check size={11} className="text-up" /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <SocialButton href={coin.website ? ensureHttp(coin.website) : undefined} label="Website">
                  <Globe size={15} />
                </SocialButton>
                <SocialButton href={twitter} label="X">
                  <XIcon size={13} />
                </SocialButton>
                <SocialButton href={telegram} label="Telegram">
                  <Send size={14} />
                </SocialButton>
                <SocialButton href={explorerToken(coin.address)} label="Solscan">
                  <ExternalLink size={14} />
                </SocialButton>
              </div>
            </div>
            {coin.description && <p className="relative mt-5 max-w-3xl text-sm leading-relaxed text-muted">{coin.description}</p>}
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Market cap"
              value={usd(coin.marketCapUsd)}
              sub={<Change value={coin.change24h} pill className="text-[11px]" />}
            />
            <StatTile
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
            <StatTile label="24h volume" value={usd(coin.volume24hUsd)} sub={`${coin.trades24h} trades`} />
            <StatTile label="Holders" value={num(coin.holders)} sub="wallets holding" />
            <StatTile className="col-span-2 sm:col-span-1" label="Burned" value={`${burnedPct.toFixed(2)}%`} sub={`${tokens(coin.burned, coin.decimals)} ${coin.symbol}`} />
          </div>

          {coin.graduated ? (
            <div className="surface flex flex-col gap-2 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-up-soft text-up">
                  <GraduationCap size={15} />
                </span>
                <span className="font-medium">Graduated to Meteora DAMM v2</span>
              </div>
              <span className="text-xs text-muted sm:flex-1">
                Same 3% fee on every trade. The pool's liquidity is locked for good, and its fees keep flowing to the buckets.
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
          ) : (
            <div className="surface flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:gap-5">
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
          )}
        </div>

        {/* trade column: your position and the fee panels after the header on phones, sticky with its own scroll on desktop */}
        <aside className="no-scrollbar space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-2">
          {/* phones trade from the bottom bar's sheet instead */}
          <div className="hidden lg:block">
            <TradePanel coin={coin} />
          </div>
          <PositionCard coin={coin} />
          <FeesPanel coin={coin} solUsd={solUsd} />
          <OtcPanel coin={coin} solUsd={solUsd} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <PriceChart coin={coin} />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-3">
          <ActivityTabs coin={coin} />
        </div>
      </div>
      <MobileTradeBar coin={coin} />
    </div>
  );
}
