"use client";

import clsx from "clsx";
import { ArrowLeftRight, ArrowRight, LineChart, Receipt, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { brand, TAX_BPS, type BucketKey, type Position, type WalletSummary } from "@cook/shared";
import { bucketColor, buckets } from "@/lib/buckets";
import { useSolUsd, useWalletSummary } from "@/lib/data";
import { age, bps, price, sol, tokens, units, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { FeeSplitBar } from "@/components/FeeSplitBar";
import { LogoMark } from "@/components/LogoMark";
import { PayoutList } from "@/components/protection/Payouts";
import { QuoteChip } from "@/components/QuoteChip";
import {
  AnimatedNumber,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Change,
  EmptyState,
  ErrorState,
  Eyebrow,
  IconTile,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";

const MINT = bucketColor.protection;
const SKY = bucketColor.otcReserve;
const two = "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]";

const holds = (p: Position) => units(p.balance, p.coin.decimals) > 0;
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + (Number.isFinite(f(x)) ? f(x) : 0), 0);
/** lifetime 3% fees on a position, in USD */
const taxUsd = (p: Position) => units(p.taxPaid, p.coin.quote.decimals) * p.coin.quote.usdPerUnit;
const signedUsd = (v: number) => (v === 0 ? usd(0) : `${v > 0 ? "+" : "−"}${usd(Math.abs(v))}`);
const toneClass = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted");

const bucketMeta: Record<BucketKey, { icon: typeof ShieldCheck; href: string; body: string }> = {
  protection: { icon: ShieldCheck, href: "/soft-landing", body: "Pays part of realized losses back to the wallets that took them." },
  otcReserve: { icon: ArrowLeftRight, href: "/otc", body: "Buys coins from sellers without moving the chart, and burns them." },
};

export function PortfolioView() {
  const address = useAddress();
  const { data, isLoading, isError } = useWalletSummary(address);
  const solUsd = useSolUsd();

  if (!address) return <ConnectPrompt />;
  if (isError) return <ErrorState />;
  if (isLoading || !data) return <PortfolioSkeleton />;
  return <Portfolio data={data} solUsd={solUsd} />;
}

function Portfolio({ data, solUsd }: { data: WalletSummary; solUsd: number }) {
  const [tab, setTab] = useState<"open" | "closed">("open");
  const positions = useMemo(() => data.positions.filter((p) => holds(p) || p.realizedPnl !== 0), [data]);
  const open = positions.filter(holds);
  const closed = positions.filter((p) => !holds(p));
  const images = useMemo(() => new Map(data.positions.map((p) => [p.coin.address, p.coin.image])), [data]);

  const valueUsd = sum(open, (p) => p.valueUsd);
  const unrealUsd = sum(open, (p) => p.unrealizedUsd);
  const realizedUsd = sum(positions, (p) => p.realizedPnlUsd);
  const costUsd = valueUsd - unrealUsd;
  const feesUsd = sum(data.positions, taxUsd);

  // show closed positions when asked, or when there's nothing open
  const view = tab === "closed" || open.length === 0 ? "closed" : "open";
  const list = view === "open" ? open : closed;
  const tabs =
    open.length > 0 && closed.length > 0
      ? (className: string) => (
          <Segmented
            className={clsx("[&>button]:h-10", className)}
            value={view}
            onChange={setTab}
            options={[
              { value: "open", label: `Open ${open.length}` },
              { value: "closed", label: `Closed ${closed.length}` },
            ]}
          />
        )
      : null;

  return (
    <div className="space-y-5">
      {/* value, P&L and protection, at a glance */}
      <section className={two}>
        <div className="ring-spectrum shadow-card relative min-w-0 overflow-hidden rounded-[32px] p-6 sm:p-8">
          <div className="spectrum absolute -top-32 -right-28 h-72 w-72 rounded-full opacity-[0.16] blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-3">
              <IconTile color="var(--accent)" size={40}>
                <Wallet size={18} />
              </IconTile>
              <Eyebrow>Holdings value</Eyebrow>
            </div>
            <div className="num font-display mt-6 text-5xl leading-none font-semibold sm:text-6xl">
              <AnimatedNumber value={valueUsd} format={usd} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              {open.length > 0 ? (
                <>
                  <span className={clsx("num font-semibold", toneClass(unrealUsd))}>{signedUsd(unrealUsd)} unrealized</span>
                  {costUsd > 0 && <Change value={(unrealUsd / costUsd) * 100} pill className="text-xs font-semibold" />}
                </>
              ) : (
                <span className="text-muted">Nothing open right now</span>
              )}
            </div>

            <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              <Tile label="Unrealized P&L" value={signedUsd(unrealUsd)} tone={unrealUsd} sub={costUsd > 0 ? `on ${usd(costUsd)} cost` : "nothing open"} />
              <Tile label="Realized P&L" value={signedUsd(realizedUsd)} tone={realizedUsd} sub="from your sells" />
              <Tile label="Cost basis" value={usd(costUsd)} sub="still at risk" />
              <Tile label="Positions" value={String(open.length)} sub={`${closed.length} closed`} />
            </div>
          </div>
        </div>

        <ProtectionCard data={data} solUsd={solUsd} />
      </section>

      {/* positions */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          icon={
            <IconTile color="var(--accent)" size={40}>
              <LineChart size={18} />
            </IconTile>
          }
          title="Positions"
          sub="Values in USD. Average entry includes the 3% fee; coins received by transfer count at zero cost."
          aside={tabs && <div className="hidden shrink-0 sm:block">{tabs("")}</div>}
        />
        {tabs && <div className="px-5 pt-4 sm:hidden">{tabs("w-full [&>button]:flex-1")}</div>}
        <div className="mt-5">
          {positions.length === 0 ? (
            <div className="px-5 pb-6 sm:px-6">
              <EmptyState title="No positions yet" detail="Buy a coin and it shows up here." action={<ButtonLink href="/">Browse coins</ButtonLink>} />
            </div>
          ) : (
            <PositionsTable list={list} />
          )}
        </div>
      </Card>

      {/* payouts, and where the fees went */}
      <section className={two}>
        <Card className="min-w-0 self-start overflow-hidden">
          <div id="payouts" className="scroll-mt-24" />
          <CardHeader
            icon={
              <IconTile color={MINT} size={40}>
                <ShieldCheck size={18} />
              </IconTile>
            }
            title={`${brand.landing} payouts`}
            sub="Losing sales, covered by hold time and the coin's pot, and sent to your wallet automatically."
          />
          <div className="mt-3">
            {data.protection.losses.length === 0 ? (
              <div className="px-5 pt-2 pb-6 sm:px-6">
                <EmptyState title="Nothing to cover" detail="Sell a coin below your average entry and the payout arrives about a minute later." />
              </div>
            ) : (
              <div className="border-t border-line px-5 sm:px-6">
                <PayoutList items={data.protection.losses.slice(0, 50)} solUsd={solUsd} images={images} initial={8} />
              </div>
            )}
          </div>
        </Card>

        <FeesCard feesUsd={feesUsd} />
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="min-w-0 bg-sunk p-4">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={clsx(
          "num font-display mt-1.5 truncate text-xl font-semibold sm:text-2xl",
          tone === undefined || tone === 0 ? "text-fg" : tone > 0 ? "text-up" : "text-down",
        )}
      >
        {value}
      </div>
      {sub && <div className="num mt-0.5 truncate text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function ProtectionCard({ data, solUsd }: { data: WalletSummary; solUsd: number }) {
  const p = data.protection;
  const covered = p.losses.filter((l) => l.amountSol > 0);
  const last = covered[0];
  return (
    <div className="surface relative flex min-w-0 flex-col overflow-hidden rounded-[32px] p-6 sm:p-8">
      <div className="absolute -right-24 -bottom-28 h-64 w-64 rounded-full opacity-[0.14] blur-3xl" style={{ background: MINT }} aria-hidden />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center gap-3">
          <IconTile color={MINT} size={40}>
            <ShieldCheck size={18} />
          </IconTile>
          <Eyebrow>Paid back by {brand.landing}</Eyebrow>
        </div>
        <div className="num font-display mt-6 text-4xl leading-none font-semibold sm:text-5xl">
          <AnimatedNumber value={p.receivedSol * solUsd} format={usd} />
        </div>
        <p className="num mt-3 text-sm text-muted">
          {sol(p.receivedSol)} sent to your wallet
          {p.owedSol > 0 && <span className="text-up"> · {usd(p.owedSol * solUsd)} on its way</span>}
        </p>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
          <div className="min-w-0 bg-sunk p-4">
            <div className="text-xs text-muted">Covered sales</div>
            <div className="num font-display mt-1.5 text-2xl font-semibold">{covered.length}</div>
            <div className="num mt-0.5 truncate text-[11px] text-faint">of {p.losses.length} losing sales</div>
          </div>
          <div className="min-w-0 bg-sunk p-4">
            <div className="text-xs text-muted">Last payout</div>
            <div className="num font-display mt-1.5 truncate text-2xl font-semibold">{last ? usd(last.amountSol * solUsd) : "—"}</div>
            <div className="num mt-0.5 truncate text-[11px] text-faint">{last ? `$${last.symbol} · ${age(last.t)} ago` : "none yet"}</div>
          </div>
        </div>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          Nothing to claim. Sell below your entry after holding 5 minutes or more and part of the loss is sent here automatically.
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {p.losses.length > 0 && (
            <ButtonLink href="#payouts" variant="secondary">
              Your payouts
            </ButtonLink>
          )}
          <ButtonLink href="/soft-landing" variant="ghost">
            How coverage works <ArrowRight size={15} />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function FeesCard({ feesUsd }: { feesUsd: number }) {
  return (
    <Card className="min-w-0 self-start p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <IconTile color="var(--accent)" size={40}>
          <Receipt size={18} />
        </IconTile>
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-semibold">Where your fees went</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Every trade pays {bps(TAX_BPS)}. Nothing goes to creators or the {brand.name} team.
          </p>
        </div>
      </div>
      <div className="mt-5">
        <div className="text-xs text-muted">Fees you&apos;ve paid</div>
        <div className="num font-display mt-1 text-3xl font-semibold">{usd(feesUsd)}</div>
      </div>
      <FeeSplitBar className="mt-5" legend={false} />
      <p className="mt-2 text-[11px] text-faint">After Meteora&apos;s share, converted to SOL and split in half:</p>
      {/* same order as the bar */}
      <ul className="mt-4 space-y-1">
        {buckets.map((b) => {
          const m = bucketMeta[b.key];
          return (
            <li key={b.key}>
              <Link href={m.href} className="-mx-2 flex items-start gap-3 rounded-2xl p-2 transition-colors hover:bg-elev-2">
                <IconTile color={b.color} size={36}>
                  <m.icon size={16} />
                </IconTile>
                <span className="min-w-0 text-[13px] leading-relaxed">
                  <span className="font-display flex items-center gap-1.5 font-semibold">
                    {b.label} · <span className="num">{bps(b.bps)}</span>
                  </span>
                  <span className="block text-muted">{m.body}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// one column template for the header and every row; wide enough that small prices never truncate
const cols =
  "grid grid-cols-[minmax(170px,1.3fr)_minmax(100px,1fr)_minmax(220px,1.5fr)_minmax(100px,1fr)_minmax(90px,0.9fr)_minmax(104px,0.8fr)] items-center gap-x-4 pr-5 sm:pr-6";

function PositionsTable({ list }: { list: Position[] }) {
  return (
    <div className="thin-scrollbar overflow-x-auto border-t border-line">
      <div className="min-w-[900px]">
        <div className={clsx(cols, "border-b border-line py-3")} aria-hidden>
          <span className="eyebrow sticky left-0 z-10 bg-elev py-0.5 pl-5 sm:pl-6">Coin</span>
          <span className="eyebrow">Balance</span>
          <span className="eyebrow">Entry vs now</span>
          <span className="eyebrow text-right">Unrealized</span>
          <span className="eyebrow text-right">Realized</span>
          <span className="eyebrow text-right">Status</span>
        </div>
        <ul aria-label="Positions">
          {list.map((p) => (
            <PositionRow key={p.coin.address} p={p} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function PositionRow({ p }: { p: Position }) {
  const holding = holds(p);
  const q = p.coin.quote;
  const inUsd = (v: number) => (q.usdPerUnit > 0 ? usd(v * q.usdPerUnit) : `${price(v)} ${q.symbol}`);
  const underwater = holding && p.avgEntry > p.coin.price;
  const cost = p.value - p.unrealized;
  const pct = cost > 0 ? (p.unrealized / cost) * 100 : null;
  // where the price sits relative to your entry, for the mini gauge (entry = 50%)
  const ratio = p.avgEntry > 0 ? p.coin.price / p.avgEntry : 1;
  const marker = Math.max(4, Math.min(96, 50 * ratio));
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/token/${p.coin.address}`} className={clsx(cols, "group transition-colors hover:bg-elev-2")}>
        <div className="sticky left-0 z-10 flex min-w-0 items-center gap-3 bg-elev py-3.5 pl-5 transition-colors group-hover:bg-elev-2 sm:pl-6">
          <CoinAvatar src={p.coin.image} symbol={p.coin.symbol} seed={p.coin.address} size={38} />
          <div className="min-w-0">
            <div className="font-display truncate text-[15px] font-semibold">${p.coin.symbol}</div>
            <QuoteChip symbol={q.symbol} logo={q.logo} className="mt-1" />
          </div>
        </div>

        <div className="min-w-0 py-3.5">
          <div className="num truncate text-sm font-semibold">{holding ? usd(p.valueUsd) : "—"}</div>
          <div className="num truncate text-xs text-muted">{holding ? tokens(p.balance, p.coin.decimals) : "sold"}</div>
        </div>

        <div className="min-w-0 py-3.5">
          {holding && p.avgEntry > 0 ? (
            <>
              <div className="num flex justify-between gap-3 text-[11px] whitespace-nowrap text-faint">
                <span>entry {inUsd(p.avgEntry)}</span>
                <span>now {inUsd(p.coin.price)}</span>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="absolute top-1/2 left-1/2 h-3.5 w-px -translate-y-1/2 bg-line-strong" />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--bg-elev)]"
                  style={{ left: `${marker}%`, background: underwater ? "var(--down)" : "var(--up)" }}
                />
              </div>
            </>
          ) : (
            <span className="num text-xs text-faint">{holding ? "received by transfer" : p.avgEntry > 0 ? `entry ${inUsd(p.avgEntry)}` : "—"}</span>
          )}
        </div>

        <div className="min-w-0 py-3.5 text-right">
          {holding ? (
            <>
              <div className={clsx("num text-sm font-semibold", toneClass(p.unrealizedUsd))}>{signedUsd(p.unrealizedUsd)}</div>
              {pct !== null && <Change value={pct} className="text-xs" />}
            </>
          ) : (
            <span className="num text-sm text-faint">—</span>
          )}
        </div>

        <div className="min-w-0 py-3.5 text-right">
          {p.realizedPnl !== 0 ? (
            <span className={clsx("num text-sm", toneClass(p.realizedPnlUsd))}>{signedUsd(p.realizedPnlUsd)}</span>
          ) : (
            <span className="num text-sm text-faint">—</span>
          )}
        </div>

        <div className="min-w-0 py-3.5 text-right">
          {!holding ? <Badge tone="outline">Closed</Badge> : underwater ? <Badge tone="down">Underwater</Badge> : <Badge tone="up">In profit</Badge>}
          <div className="num mt-1 text-[11px] text-faint">{holding && p.firstBuyAt > 0 ? `held ${age(p.firstBuyAt)}` : " "}</div>
        </div>
      </Link>
    </li>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-5">
      <div className={two}>
        <Skeleton className="h-[340px] rounded-[32px]" />
        <Skeleton className="h-[340px] rounded-[32px]" />
      </div>
      <Skeleton className="h-96 rounded-[24px]" />
    </div>
  );
}

function ConnectPrompt() {
  const { open } = useWalletModal();
  const benefits = [
    { icon: LineChart, color: "var(--accent)", title: "Entries and P&L", body: "Your average entry on every coin, fee included, against the live price." },
    { icon: ShieldCheck, color: MINT, title: `${brand.landing} payouts`, body: "Losses you realized and what the fund sent you for them, automatically." },
    { icon: ArrowLeftRight, color: SKY, title: "Your fees at work", body: `What your 3% put into the OTC reserve and the ${brand.landing} fund.` },
  ];
  return (
    <div className="ring-spectrum shadow-card relative overflow-hidden rounded-[32px]">
      <div className="spectrum absolute -bottom-40 left-1/3 h-72 w-[36rem] max-w-full rounded-full opacity-15 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-1 gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <LogoMark size={56} className="squish" />
          <h2 className="font-display mt-6 text-3xl leading-tight font-semibold sm:text-4xl">Your coins, all in one place</h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            Connect a wallet to see your positions, your profit and loss, and the {brand.landing} payouts you&apos;ve received.
          </p>
          <Button size="lg" className="mt-7" onClick={open}>
            Connect wallet <ArrowRight size={16} />
          </Button>
        </div>
        <ul className="grid gap-3">
          {benefits.map((b) => (
            <li key={b.title} className="flex items-start gap-4 rounded-2xl border border-line bg-sunk/70 p-4">
              <IconTile color={b.color} size={40}>
                <b.icon size={18} />
              </IconTile>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold">{b.title}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{b.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
