"use client";

import clsx from "clsx";
import { ArrowLeftRight, Crown, Egg, Gift, Users } from "lucide-react";
import Link from "next/link";
import { BLOODLINE, brand, type BloodlineInfo, type BloodlineMember, type CoinDetail } from "@cook/shared";
import { useBloodline } from "@/lib/data";
import { num, tokens, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Badge, IconTile, Skeleton } from "@/components/ui";

const ruleText: Record<BloodlineInfo["rule"], string> = {
  og: "The original leads while it's alive",
  alive: "The original went quiet: the best alive member leads",
  best: "Nobody is alive: the best member overall leads",
};

/** One coin in the Nest: the leader wears the crown, quiet members fade. */
function MemberRow({ m, here, top }: { m: BloodlineMember; here: boolean; top: number }) {
  return (
    <li className="relative flex gap-3 py-3 pl-1">
      {/* the node on the Nest's line */}
      <span className="relative z-10 mt-2 flex h-6 w-6 shrink-0 items-center justify-center">
        {m.leads ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nest text-[#2a1d00] shadow-[0_0_16px_-2px_var(--nest)]">
            <Crown size={12} strokeWidth={2.5} />
          </span>
        ) : (
          <span className={clsx("h-2.5 w-2.5 rounded-full ring-4 ring-[var(--bg-elev)]", m.alive ? "bg-nest" : "bg-line-strong")} />
        )}
      </span>
      <div className={clsx("min-w-0 flex-1", !m.alive && !m.leads && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <Link href={`/token/${m.address}`} className="flex min-w-0 items-center gap-2.5">
            <CoinAvatar src={m.image} symbol={m.symbol} seed={m.address} size={34} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-display text-[15px] font-semibold hover:underline">${m.symbol}</span>
                {m.og && <Badge tone="nest">Original</Badge>}
                {m.leads && <Badge tone="nest">Leads</Badge>}
                {here && <Badge tone="outline">This coin</Badge>}
                {m.unpaid && <Badge tone="down">Skipped the entry · unlisted</Badge>}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {m.name} · {m.quoteSymbol} pair · {m.alive ? <span className="font-bold text-nest">alive</span> : "quiet"}
              </span>
            </span>
          </Link>
          <div className="shrink-0 text-right">
            <div className="num text-sm font-bold">{usd(m.marketCapUsd)}</div>
            <div className="num text-[11px] text-faint">
              {usd(m.volume12hUsd)} · {num(m.traders12h, 0)} {m.traders12h === 1 ? "trader" : "traders"} /12h
            </div>
          </div>
        </div>
        {top > 0 && m.score > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk" title="Ranking: its share of the Nest's volume, traders and market cap">
            <div className="h-full rounded-full bg-nest transition-[width] duration-700" style={{ width: `${Math.max(2, (m.score / top) * 100)}%` }} />
          </div>
        )}
        {(m.sentUsd > 0 || m.receivedUsd > 0 || m.entry) && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {m.receivedUsd > 0 && (
              <span>
                received <span className="num font-bold text-fg">{usd(m.receivedUsd)}</span> from copies
              </span>
            )}
            {m.sentUsd > 0 && (
              <span>
                sent <span className="num font-bold text-fg">{usd(m.sentUsd)}</span> to its leaders
              </span>
            )}
            {m.entry && (
              <span>
                entry <span className="num font-bold text-fg">{usd(m.entry.usd)}</span>: {tokens(m.entry.tokens, 6)} ${m.symbol}{" "}
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
function Empty({ coin }: { coin: CoinDetail }) {
  const steps = [
    `A look-alike of $${coin.symbol} launches and joins its ${brand.nest}`,
    `While $${coin.symbol} is alive, the copy pays a ${usd(BLOODLINE.entryUsd)} entry, airdropped to $${coin.symbol} holders`,
    `Every fee the copy makes grows $${coin.symbol}'s OTC limit and ${brand.landing} pot`,
  ];
  return (
    <div className="mt-5">
      <p className="text-sm leading-relaxed text-muted">
        No copies yet. Coins whose ticker or name reads as{" "}
        <span className="font-display font-bold text-fg">{coin.bloodline?.og.symbol ?? coin.symbol}</span>, with look-alikes like 4 for A or 0
        for O, join its {brand.nest}, and they pay for it.
      </p>
      <ol className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="rounded-2xl bg-sunk px-4 py-3.5 text-xs leading-relaxed text-muted shadow-[inset_0_0_0_1px_var(--line)]">
            <span className="font-display mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-nest-soft text-xs font-bold text-nest">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function NestPanel({ coin }: { coin: CoinDetail }) {
  const { data, isLoading } = useBloodline(coin.address);
  if (isLoading) return <Skeleton className="h-48 w-full rounded-[24px]" />;
  if (!data) return null;
  const solo = data.members.length < 2;
  const leader = data.members.find((m) => m.leads);
  const top = Math.max(0, ...data.members.map((m) => m.score));

  return (
    <section className="surface relative overflow-hidden rounded-[24px] p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-24 -left-20 h-52 w-52 rounded-full bg-nest opacity-[0.08] blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconTile color="var(--nest)" size={40}>
            <Egg size={18} />
          </IconTile>
          <div>
            <h3 className="font-display text-[17px] font-semibold">The {brand.nest}</h3>
            <p className="text-xs text-muted">{solo ? "Copies feed the original" : `$${data.key}'s ${brand.nest} · ${data.members.length} coins`}</p>
          </div>
        </div>
        {!solo && leader && (
          <span className="font-display inline-flex items-center gap-1.5 rounded-full bg-nest-soft px-3 py-1 text-xs font-semibold text-nest">
            <Crown size={13} /> ${leader.symbol} leads
          </span>
        )}
      </div>

      {solo ? (
        <Empty coin={coin} />
      ) : (
        <>
          <div className="relative mt-5 grid grid-cols-3 gap-2.5">
            {[
              { icon: ArrowLeftRight, label: "Sent to leaders", value: usd(data.routedUsd), sub: `OTC + ${brand.landing}` },
              { icon: Gift, label: "Entries paid", value: usd(data.entriesUsd), sub: "by copies, at launch" },
              { icon: Users, label: "Holders airdropped", value: num(data.entryRecipients, 0), sub: "from entries" },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-sunk px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="font-display flex items-center gap-1.5 truncate text-[10px] font-semibold tracking-[0.08em] text-faint uppercase">
                  <s.icon size={11} className="shrink-0 text-nest" /> {s.label}
                </div>
                <div className="num font-display mt-1 truncate text-lg font-bold">{s.value}</div>
                <div className="truncate text-[10px] text-faint">{s.sub}</div>
              </div>
            ))}
          </div>

          <ol className="relative mt-3">
            {/* the line the members hang off */}
            <span className="absolute top-6 bottom-6 left-[16px] w-px bg-gradient-to-b from-nest/60 via-nest/25 to-transparent" aria-hidden />
            {data.members.map((m) => (
              <MemberRow key={m.address} m={m} here={m.address === coin.address} top={top} />
            ))}
          </ol>

          <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
            {ruleText[data.rule]}. Alive means {BLOODLINE.aliveTraders}+ traders and {usd(BLOODLINE.aliveVolumeUsd)}+ volume in the last{" "}
            {BLOODLINE.aliveHours} hours; the rest are ranked by their share of the {brand.nest}&apos;s volume, traders and market cap. Every
            member that doesn&apos;t lead sends its whole fee split to the leader.
          </p>
        </>
      )}
    </section>
  );
}
