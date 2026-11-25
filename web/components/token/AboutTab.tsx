"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand, type CoinDetail } from "@gantry/shared";
import { useFleet } from "@/lib/data";
import { explorerAddress, explorerToken } from "@/lib/explorer";
import { age, short, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Badge, PanelBody, Row, buttonClass } from "@/components/ui";
import { raydiumUrl, venueName, venueOf } from "./venue";

const withScheme = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
/** A handle or a full link, as creators type either. */
const profile = (value: string, base: string) => (value.startsWith("http") ? value : `${base}${value.replace(/^@/, "")}`);

/** A link that leaves the site: a small quiet button marked with the outbound arrow. */
function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
        {children}
        <ArrowUpRight size={13} aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </li>
  );
}

/** A shortened address that opens the explorer. */
function Address({ value, href }: { value: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={value} className="link font-mono whitespace-nowrap">
      {short(value)}
    </a>
  );
}

/** The coin's family of same-ticker coins: who leads it, and the members when there are several. */
function FleetNote({ coin }: { coin: CoinDetail }) {
  const tag = coin.fleet!;
  const { data } = useFleet(coin.address);
  const isOriginal = tag.og.address === coin.address;
  const leads = tag.leader.address === coin.address;
  const coinLink = (c: { address: string; symbol: string }) => (
    <Link href={`/token/${c.address}`} className="link">
      ${c.symbol}
    </Link>
  );
  const members = data && data.members.length > 1 ? data.members : [];

  return (
    <section aria-label={`${brand.fleet} of ${coin.symbol}`} className="space-y-3">
      <h3 className="display-3">{brand.fleet}</h3>
      <p className="text-sm leading-relaxed text-ink-2">
        Coins that share a ticker form a {brand.fleet}: the copies pass their fees to the coin that leads it.{" "}
        {isOriginal ? <>This is the original.</> : <>This coin is a copy of {coinLink(tag.og)}.</>}{" "}
        {leads ? <>It leads the {brand.fleet} right now.</> : <>{coinLink(tag.leader)} leads right now.</>}
        {tag.unpaid && <> This copy has not paid its entry, so it is not listed.</>}
      </p>
      {members.length > 0 && (
        <ul className="space-y-1">
          {members.map((m) => (
            <li key={m.address}>
              <Link href={`/token/${m.address}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/5">
                <CoinAvatar src={m.image} symbol={m.symbol} seed={m.address} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium text-ink">${m.symbol}</span> <span className="text-ink-3">{m.name}</span>
                </span>
                {m.leads ? <Badge tone="fleet">Leads</Badge> : m.og ? <Badge>Original</Badge> : null}
                <span className="num w-16 shrink-0 text-right text-sm text-ink-2">{usd(m.marketCapUsd)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What the coin is: the creator's words and links, the pair and where it trades, and its family if it has one. */
export function AboutTab({ coin }: { coin: CoinDetail }) {
  const q = coin.quote;
  return (
    <PanelBody className="space-y-6">
      <div className="space-y-4">
        {coin.isMain && (
          <p className="text-sm leading-relaxed text-ink-2">
            <span className="font-medium text-ink">${coin.symbol}</span> is the {brand.name} platform token.
          </p>
        )}
        <p className="max-w-2xl text-[15px] leading-relaxed break-words whitespace-pre-line text-ink-2">
          {coin.description || "The creator has not written a description."}
        </p>
        {(coin.website || coin.twitter || coin.telegram) && (
          <ul className="flex flex-wrap gap-2" aria-label="Links">
            {coin.website && <Out href={withScheme(coin.website)}>Website</Out>}
            {coin.twitter && <Out href={profile(coin.twitter, "https://x.com/")}>X</Out>}
            {coin.telegram && <Out href={profile(coin.telegram, "https://t.me/")}>Telegram</Out>}
          </ul>
        )}
      </div>

      <div className="max-w-xl">
        <Row label="Pair" value={`${coin.symbol} / ${q.symbol}`} />
        <Row label="Created" value={<span title={new Date(coin.createdAt * 1000).toUTCString()}>{age(coin.createdAt)} ago</span>} />
        <Row label="Creator" value={<Address value={coin.creator} href={explorerAddress(coin.creator)} />} />
      </div>

      <div className="space-y-3">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          {coin.graduated
            ? `Trades in its ${venueName.cpmm}. The pool's liquidity is locked for good.`
            : `Trades on a ${venueName[venueOf(coin)]} and moves to a Raydium pool when it graduates.`}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="See it elsewhere">
          <Out href={raydiumUrl(coin)}>Raydium</Out>
          <Out href={explorerToken(coin.address)}>Solscan</Out>
        </ul>
      </div>

      {coin.fleet && <FleetNote coin={coin} />}
    </PanelBody>
  );
}
