import { ArrowLeftRight, ArrowUpRight, Flame, Gift, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { brand } from "@cook/shared";
import { bucketColor } from "@/lib/buckets";
import { Card, IconTile, SectionHeading } from "@/components/ui";

const features = [
  {
    icon: ShieldCheck,
    color: bucketColor.protection,
    pct: "40%",
    title: "Protection fund",
    body: "Sold at a loss? Claim back up to 70%. The rate rises with how long you held (minutes and hours, not weeks) and scales with how much that coin paid into the fund.",
    href: "/protection",
  },
  {
    icon: ArrowLeftRight,
    color: bucketColor.otcReserve,
    pct: "30%",
    title: "OTC exit reserve",
    body: "An ETH pool you can sell into with zero slippage. Coins that pay more fees earn bigger limits; dead coins fade to almost nothing.",
    href: "/otc",
  },
  {
    icon: Flame,
    color: bucketColor.mainBuyback,
    pct: "10% + 10%",
    title: "Double buyback & burn",
    body: `Half buys the coin itself back and burns it. Half buys $${brand.mainTicker} and burns it. Supply only goes one way.`,
    href: "/docs#split",
  },
  {
    icon: Gift,
    color: bucketColor.airdrop,
    pct: "10%",
    title: "Airdrops to high entries",
    body: "Every hour, holders whose entry is above the current price get paid, weighted by how far underwater they are. As price moves, recipients rotate.",
    href: "/docs#airdrops",
  },
];

const compare = [
  { name: brand.name, pct: 100, note: "burns, exit reserve, loss cover, airdrops", highlight: true },
  { name: "pump.fun · Holder Rewards", pct: 62, note: "buybacks + creator share streamed to holders by balance" },
  { name: "Pons", pct: 24, note: "PONS buybacks; 70% goes to the creator" },
];

export function WhyCook() {
  return (
    <section>
      <SectionHeading
        eyebrow="Where your 3% goes"
        title={
          <>
            One tax, five ways <span className="text-spectrum">back to you</span>
          </>
        }
        sub="No creator fees and no team cut. The hook splits every unit of tax on-chain the moment it's paid, then a keeper turns it into ETH, burns and airdrops."
      />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <Link key={f.title} href={f.href} className="surface surface-hover group relative flex flex-col overflow-hidden rounded-[22px] p-6">
            <div
              className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
              style={{ background: f.color }}
              aria-hidden
            />
            <div className="flex items-center justify-between">
              <IconTile color={f.color} size={44}>
                <f.icon size={20} />
              </IconTile>
              <span className="num text-lg font-medium" style={{ color: f.color }}>
                {f.pct}
              </span>
            </div>
            <h3 className="font-display mt-6 text-xl font-semibold">{f.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.body}</p>
            <span className="mt-auto inline-flex items-center gap-1 pt-6 text-xs font-medium text-muted transition-colors group-hover:text-fg">
              Learn more <ArrowUpRight size={13} />
            </span>
          </Link>
        ))}
      </div>

      <Card className="mt-4 p-6 sm:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <span className="eyebrow">Compared</span>
            <h3 className="font-display mt-3 text-2xl font-semibold sm:text-3xl">Share of fees that comes back to traders and holders</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Same trading volume, different destinations. Elsewhere most fees go to creators and the platform, and dividends
              go to the biggest wallets. Here, all of it comes back, aimed at the people who need it.
            </p>
            <Link href="/docs#compare" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent">
              Full comparison with sources <ArrowUpRight size={14} />
            </Link>
          </div>
          <ul className="space-y-5">
            {compare.map((c) => (
              <li key={c.name}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={c.highlight ? "font-semibold" : "text-muted"}>{c.name}</span>
                  <span className={`num ${c.highlight ? "text-fg" : "text-muted"}`}>{c.pct}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-sunk">
                  <div
                    className={c.highlight ? "spectrum h-full rounded-full" : "h-full rounded-full bg-line-strong"}
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-faint">{c.note}</p>
              </li>
            ))}
            <li className="text-[11px] text-faint">From public fee docs as of Oct 2026. Sources in the docs.</li>
          </ul>
        </div>
      </Card>
    </section>
  );
}
