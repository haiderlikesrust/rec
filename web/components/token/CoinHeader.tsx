"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GRADUATION_MCAP_USD, type Coin } from "@gantry/shared";
import { num, price, short, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { GraduationBar } from "@/components/GraduationBar";
import { Badge, Change } from "@/components/ui";

/** The contract address as a small button: press it and the full address is on the clipboard. */
function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    navigator.clipboard?.writeText(address).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <span className="inline-flex shrink-0">
      <button
        type="button"
        onClick={copy}
        title={address}
        // the ::after stretches the tap target to 44px on phones
        className="relative inline-flex h-8 items-center gap-2 rounded-full bg-white/8 px-3 text-xs text-ink-2 transition-colors after:absolute after:-inset-x-1 after:-inset-y-1.5 hover:bg-white/12 hover:text-ink"
      >
        <span className="sr-only">Copy contract address</span>
        <span className="font-mono">{copied ? "Copied" : short(address, 4)}</span>
        {copied ? <Check size={13} className="text-gain" aria-hidden /> : <Copy size={13} aria-hidden />}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Contract address copied" : ""}
      </span>
    </span>
  );
}

/** One of the three facts under the name: "Market cap $236K", or "60 holders" with the figure first. */
function Fact({ label, value, valueFirst }: { label: string; value: string; valueFirst?: boolean }) {
  const figure = <span className="num text-ink">{value}</span>;
  return (
    <span className="whitespace-nowrap">
      {valueFirst ? (
        <>
          {figure} {label}
        </>
      ) : (
        <>
          {label} {figure}
        </>
      )}
    </span>
  );
}

/**
 * The top of a coin page, as one compact block: who the coin is, what it costs and how it moved today, three facts,
 * then how far it is from graduating (or that it already trades on Raydium) and its contract address.
 */
export function CoinHeader({ coin }: { coin: Coin }) {
  const q = coin.quote;
  const inUsd = q.usdPerUnit > 0;
  const progress = Math.max(0, Math.min(1, coin.graduationProgress || 0));
  // a copy says so beside its ticker, with the way to the coin it copied
  const original = coin.fleet && coin.fleet.og.address !== coin.address ? coin.fleet.og : null;

  return (
    <header>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-y-1">
        <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={52} className="col-start-1 row-start-1 sm:row-span-2" />

        <h1 className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 sm:self-end">
          <span className="min-w-0 text-[22px] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] text-ink sm:text-[26px]">{coin.name}</span>
          <span className="text-base font-medium whitespace-nowrap text-ink-2">${coin.symbol}</span>
          {original && (
            <Link href={`/token/${original.address}`} className="inline-flex">
              <Badge tone="fleet">Copy of ${original.symbol}</Badge>
            </Link>
          )}
        </h1>

        <div className="col-span-2 row-start-2 flex items-baseline gap-3 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-col sm:items-end sm:gap-1">
          <span className="num text-[28px] leading-none font-semibold tracking-tight text-ink sm:text-[32px]">
            {inUsd ? (
              `$${price(coin.priceUsd)}`
            ) : (
              <>
                {price(coin.price)} <span className="text-base font-medium text-ink-2">{q.symbol}</span>
              </>
            )}
          </span>
          <span className="text-sm text-ink-3">
            <Change value={coin.change24h} className="font-medium" /> in 24h
          </span>
        </div>

        <p className="col-span-2 row-start-3 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-ink-2 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:self-start">
          <Fact label="Market cap" value={usd(coin.marketCapUsd)} />
          <span aria-hidden className="text-ink-3">
            ·
          </span>
          <Fact label="24h volume" value={usd(coin.volume24hUsd)} />
          <span aria-hidden className="text-ink-3">
            ·
          </span>
          <Fact label={coin.holders === 1 ? "holder" : "holders"} value={num(coin.holders, 0)} valueFirst />
        </p>
      </div>

      <div className="mt-5">
        {!coin.graduated && <GraduationBar progress={progress} graduated={false} showLabel={false} />}
        <div className={coin.graduated ? "flex items-center justify-between gap-3" : "mt-2.5 flex items-center justify-between gap-3"}>
          {coin.graduated ? (
            <Badge tone="gain">Trading on Raydium</Badge>
          ) : (
            <p className="min-w-0 text-sm text-ink-2">
              <span className="num font-medium text-ink">{Math.floor(progress * 100)}%</span> to graduation at {usd(GRADUATION_MCAP_USD)}
            </p>
          )}
          <CopyAddress address={coin.address} />
        </div>
      </div>
    </header>
  );
}
