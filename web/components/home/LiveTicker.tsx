"use client";

import clsx from "clsx";
import Link from "next/link";
import type { ActivityItem } from "@cook/shared";
import { useActivity } from "@/lib/data";
import { age, short, usd } from "@/lib/format";
import { CoinAvatar } from "@/components/CoinAvatar";

function Item({ a }: { a: ActivityItem }) {
  return (
    <Link
      href={`/token/${a.coin}`}
      className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-elev/80 py-1.5 pr-3.5 pl-1.5 text-[13px] whitespace-nowrap transition-colors hover:border-line-strong"
    >
      <CoinAvatar src={a.image} symbol={a.symbol} seed={a.coin} size={24} />
      {a.kind === "launch" ? (
        <span>
          <span className="font-semibold">${a.symbol}</span> <span className="text-muted">launched by</span>{" "}
          <span className="num text-muted">{short(a.wallet, 3)}</span>
        </span>
      ) : (
        <span>
          <span className="num text-muted">{short(a.wallet, 3)}</span>{" "}
          <span className={clsx("font-medium", a.kind === "buy" ? "text-up" : "text-down")}>
            {a.kind === "buy" ? "bought" : "sold"}
          </span>{" "}
          <span className="num">{usd(a.usdValue)}</span> <span className="text-muted">of</span>{" "}
          <span className="font-semibold">${a.symbol}</span>
        </span>
      )}
      <span className="num text-xs text-faint">{age(a.t)}</span>
    </Link>
  );
}

/** Scrolling strip of the latest trades and launches. Pauses on hover. */
export function LiveTicker() {
  const { data } = useActivity();
  if (!data || data.length === 0) return null;
  const items = data.slice(0, 24);
  return (
    <div className="group relative -mx-4 overflow-hidden py-1 sm:-mx-6">
      <div className="mask-fade-x">
        <div className="flex w-max animate-marquee gap-2.5 group-hover:[animation-play-state:paused]">
          {[...items, ...items].map((a, i) => (
            <Item key={`${a.id}-${i}`} a={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
