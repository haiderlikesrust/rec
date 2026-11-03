"use client";

import clsx from "clsx";
import { Crown, Droplet, Flame, Gift, Users } from "lucide-react";
import Link from "next/link";
import { BLOODLINE, type BloodlineInfo, type BloodlineMember, type CoinDetail } from "@cook/shared";
import { useBloodline } from "@/lib/data";
import { num, tokens, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Badge, IconTile, Skeleton } from "@/components/ui";

const ruleText: Record<BloodlineInfo["rule"], string> = {
  og: "The OG leads while it's alive",
  alive: "The OG went quiet: the best alive member leads",
  best: "Nobody is alive: the best member overall leads",
};

/** One coin in the family tree: the leader wears the crown, quiet members fade. */
function MemberRow({ m, here, top }: { m: BloodlineMember; here: boolean; top: number }) {
  return (
    <li className="relative flex gap-3 py-2.5 pl-1">
      {/* the node on the family line */}
      <span className="relative z-10 mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {m.leads ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blood text-white shadow-[0_0_14px_-2px_var(--blood)]">
            <Crown size={11} />
          </span>
        ) : (
          <span className={clsx("h-2.5 w-2.5 rounded-full ring-4 ring-[var(--bg-elev)]", m.alive ? "bg-blood" : "bg-line-strong")} />
        )}
      </span>
      <div className={clsx("min-w-0 flex-1", !m.alive && !m.leads && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <Link href={`/token/${m.address}`} className="flex min-w-0 items-center gap-2.5">
            <CoinAvatar src={m.image} symbol={m.symbol} seed={m.address} size={30} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold hover:underline">${m.symbol}</span>
                {m.og && <Badge tone="blood">OG</Badge>}
                {m.leads && <Badge tone="blood">Leads</Badge>}
                {here && <Badge tone="outline">This coin</Badge>}
                {m.unpaid && <Badge tone="down">Skipped the entry · unlisted</Badge>}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {m.name} · {m.quoteSymbol} pair · {m.alive ? <span className="text-blood">alive</span> : "quiet"}
              </span>
            </span>
          </Link>
          <div className="shrink-0 text-right">
            <div className="num text-[13px]">{usd(m.marketCapUsd)}</div>
            <div className="num text-[11px] text-faint">
              {usd(m.volume12hUsd)} · {num(m.traders12h, 0)} {m.traders12h === 1 ? "trader" : "traders"} /12h
            </div>
          </div>
        </div>
        {top > 0 && m.score > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunk" title="Ranking: its share of the family's volume, traders and market cap">
            <div className="h-full rounded-full bg-blood transition-[width] duration-700" style={{ width: `${Math.max(2, (m.score / top) * 100)}%` }} />
          </div>
        )}
        {(m.sentUsd > 0 || m.receivedUsd > 0 || m.entry) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {m.receivedUsd > 0 && (
              <span>
                received <span className="num text-fg">{usd(m.receivedUsd)}</span> from copies
              </span>
            )}
            {m.sentUsd > 0 && (
              <span>
                sent <span className="num text-fg">{usd(m.sentUsd)}</span> to leaders
              </span>
            )}
            {m.entry && (
              <span>
                entry <span className="num text-fg">{usd(m.entry.usd)}</span>: {tokens(m.entry.tokens, 6)} ${m.symbol}{" "}
                {m.entry.status === "done" ? `airdropped to ${m.entry.recipients}` : "going to"} ${m.entry.toSymbol} holders
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** What any copy of this coin would owe it, for a coin nobody has copied yet. */
function Unbroken({ coin }: { coin: CoinDetail }) {
  const steps = [
    { icon: Droplet, text: `A copy of $${coin.symbol} launches on Recur` },
    { icon: Gift, text: `It pays a ${usd(BLOODLINE.entryUsd)} entry, airdropped to $${coin.symbol} holders` },
    { icon: Flame, text: `Its buyback and airdrop come here while $${coin.symbol} leads` },
  ];
  return (
    <div className="mt-4">
      <p className="text-xs leading-relaxed text-muted">
        No copies yet. Coins whose ticker or name reads as <span className="num font-medium text-fg">{coin.bloodline?.og.symbol ?? coin.symbol}</span>
        , with look-alikes like 4 for A or 0 for O, join its family, and they pay for it.
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.text} className="flex gap-2.5 rounded-2xl bg-sunk px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-blood-soft text-[10px] font-semibold text-blood">{i + 1}</span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BloodlinePanel({ coin }: { coin: CoinDetail }) {
  const { data, isLoading } = useBloodline(coin.address);
  if (isLoading) return <Skeleton className="h-48 w-full rounded-[22px]" />;
  if (!data) return null;
  const solo = data.members.length < 2;
  const leader = data.members.find((m) => m.leads);
  const top = Math.max(0, ...data.members.map((m) => m.score));

  return (
    <section className="surface relative overflow-hidden rounded-[22px] p-5">
      <div className="pointer-events-none absolute -top-24 -left-20 h-48 w-48 rounded-full bg-blood opacity-[0.07] blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile color="var(--blood)" size={36}>
            <Droplet size={17} />
          </IconTile>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">Bloodline</h3>
            <p className="text-xs text-muted">
              {solo ? "Copies feed the original" : `The ${data.key} family · ${data.members.length} coins`}
            </p>
          </div>
        </div>
        {!solo && leader && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blood/25 bg-blood-soft px-2.5 py-1 text-[11px] text-blood">
            <Crown size={12} /> ${leader.symbol} leads
          </span>
        )}
      </div>

      {solo ? (
        <Unbroken coin={coin} />
      ) : (
        <>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: Flame, label: "Sent to leaders", value: usd(data.routedUsd), sub: "buyback + airdrop shares" },
              { icon: Gift, label: "Entries paid", value: usd(data.entriesUsd), sub: "by copies, at launch" },
              { icon: Users, label: "Holders airdropped", value: num(data.entryRecipients, 0), sub: "from entries" },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-sunk px-3 py-2.5">
                <div className="flex items-center gap-1.5 truncate text-[10px] tracking-wider text-faint uppercase">
                  <s.icon size={11} className="shrink-0 text-blood" /> {s.label}
                </div>
                <div className="num mt-1 truncate text-[15px] font-medium">{s.value}</div>
                <div className="truncate text-[10px] text-faint">{s.sub}</div>
              </div>
            ))}
          </div>

          <ol className="relative mt-3">
            {/* the family line the members hang off */}
            <span className="absolute top-5 bottom-5 left-[14px] w-px bg-gradient-to-b from-blood/60 via-blood/25 to-transparent" aria-hidden />
            {data.members.map((m) => (
              <MemberRow key={m.address} m={m} here={m.address === coin.address} top={top} />
            ))}
          </ol>

          <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
            {ruleText[data.rule]}. Alive means {BLOODLINE.aliveTraders}+ traders and {usd(BLOODLINE.aliveVolumeUsd)}+ volume in the last{" "}
            {BLOODLINE.aliveHours} hours; the rest are ranked by their share of the family&apos;s volume, traders and market cap. Every
            member that doesn&apos;t lead sends its buyback and airdrop shares to the leader.
          </p>
        </>
      )}
    </section>
  );
}
