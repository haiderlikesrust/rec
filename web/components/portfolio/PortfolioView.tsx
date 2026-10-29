"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { ArrowRight, Gift, LineChart, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import type { Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import type { Position } from "@cook/shared";
import { CHAIN_ID, abis, addresses } from "@/lib/contracts";
import { bucketColor } from "@/lib/buckets";
import { useQuotes, useStats, useWallet } from "@/lib/data";
import { age, num, price, tokens, units, usd, wei } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { CoinAvatar } from "@/components/CoinAvatar";
import { LogoMark } from "@/components/LogoMark";
import { QuoteChip } from "@/components/QuoteChip";
import { TxStatus } from "@/components/TxStatus";
import { AnimatedNumber, Badge, Button, ButtonLink, Card, CardHeader, Change, EmptyState, ErrorState, IconTile, Skeleton } from "@/components/ui";

export function PortfolioView() {
  const { address } = useAccount();
  const { data, isLoading, isError } = useWallet(address);
  const { data: stats } = useStats();
  const ethUsd = stats?.ethUsd ?? 0;

  if (!address) return <ConnectPrompt />;
  if (isError) return <ErrorState />;
  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-56 rounded-[22px]" />
        <Skeleton className="h-80 rounded-[22px]" />
      </div>
    );

  const positions = data.positions.filter((p) => units(p.balance) > 0 || p.realizedPnl !== 0);
  const valueEth = positions.reduce((s, p) => s + p.value * p.coin.quote.ethPerUnit, 0);
  const unrealEth = positions.reduce((s, p) => s + p.unrealized * p.coin.quote.ethPerUnit, 0);
  const costEth = valueEth - unrealEth;
  const claimable = data.claims.filter((c) => !c.claimed).reduce((s, c) => s + units(c.amount), 0);
  const receiving = positions.filter((p) => p.airdropEligible).length;
  const images = new Map(data.positions.map((p) => [p.coin.address.toLowerCase(), p.coin.image]));

  return (
    <div className="space-y-6">
      <Card featured className="relative overflow-hidden p-6 sm:p-8">
        <div className="spectrum absolute -top-28 -right-28 h-64 w-64 rounded-full opacity-20 blur-3xl" aria-hidden />
        <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <span className="eyebrow">Holdings value</span>
            <div className="font-display mt-3 text-5xl leading-none font-semibold sm:text-6xl">
              <AnimatedNumber value={valueEth * ethUsd} format={usd} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="num text-muted">{num(valueEth)} ETH</span>
              <span className={clsx("num", unrealEth >= 0 ? "text-up" : "text-down")}>
                {unrealEth >= 0 ? "+" : "−"}
                {usd(Math.abs(unrealEth * ethUsd))} unrealized
              </span>
              {costEth > 0 && <Change value={(unrealEth / costEth) * 100} pill className="text-xs" />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={Wallet} color="var(--accent)" label="Positions" value={String(positions.filter((p) => units(p.balance) > 0).length)} />
            <Tile
              icon={Gift}
              color={bucketColor.airdrop}
              label="Airdrops"
              value={String(data.airdrops.length)}
              sub={receiving > 0 ? `${receiving} coin${receiving > 1 ? "s" : ""} paying you` : "received"}
            />
            <Tile
              icon={ShieldCheck}
              color={bucketColor.protection}
              label="Claimable"
              value={`${num(claimable)}`}
              sub="ETH protection"
              href={claimable > 0 ? "/protection" : undefined}
            />
          </div>
        </div>
      </Card>

      <UnclaimedAirdrops account={address} />

      <Card className="overflow-hidden">
        <CardHeader title="Positions" sub="Average entry includes the 3% tax. Coins received by transfer count at zero cost." />
        <div className="mt-4">
          {positions.length === 0 ? (
            <div className="px-5 pb-6 sm:px-6">
              <EmptyState title="No positions yet" detail="Buy a coin and it shows up here." action={<ButtonLink href="/">Browse coins</ButtonLink>} />
            </div>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {positions.map((p) => (
                <PositionRow key={p.coin.address} p={p} ethUsd={ethUsd} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            icon={
              <IconTile color={bucketColor.airdrop} size={36}>
                <Gift size={16} />
              </IconTile>
            }
            title="Airdrops received"
            sub="Paid hourly while your average entry is above the price."
          />
          <div className="mt-4">
            {data.airdrops.length === 0 ? (
              <div className="px-5 pb-6 sm:px-6">
                <EmptyState title="None yet" detail="Airdrops go to holders whose average entry is above the current price, recomputed every hour." />
              </div>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto border-t border-line">
                {data.airdrops.slice(0, 50).map((a, i) => (
                  <li key={`${a.coin}-${a.t}-${i}`} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <CoinAvatar src={images.get(a.coin.toLowerCase())} symbol={a.symbol} seed={a.coin} size={30} />
                    <Link href={`/token/${a.coin}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">
                      ${a.symbol}
                    </Link>
                    <span className="num text-sm text-up">+{tokens(a.amount, a.quoteDecimals, a.quoteSymbol)}</span>
                    <span className="num w-12 text-right text-xs text-faint">{age(a.t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            icon={
              <IconTile color={bucketColor.protection} size={36}>
                <ShieldCheck size={16} />
              </IconTile>
            }
            title="Protection claims"
            sub="Losses you realized, covered by hold time and the coin's funding."
          />
          <div className="mt-4">
            {data.claims.length === 0 ? (
              <div className="px-5 pb-6 sm:px-6">
                <EmptyState title="No claims" detail="If you sell a coin below your entry, the next epoch includes your loss." />
              </div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {data.claims.map((c) => (
                  <li key={c.epoch} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <span className="num flex-1 text-sm text-muted">Epoch #{c.epoch}</span>
                    <span className="num text-sm font-medium">{wei(c.amount)}</span>
                    {c.claimed ? (
                      <Badge tone="up">Claimed</Badge>
                    ) : (
                      <ButtonLink href="/protection" size="sm">
                        Claim
                      </ButtonLink>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  color,
  label,
  value,
  sub,
  href,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <>
      <IconTile color={color} size={30}>
        <Icon size={14} />
      </IconTile>
      <div className="mt-3 text-xs text-muted">{label}</div>
      <div className="num mt-0.5 text-xl font-medium">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-faint">{sub}</div>}
    </>
  );
  const cls = "min-w-0 rounded-2xl border border-line bg-sunk/70 p-3.5";
  return href ? (
    <Link href={href} className={clsx(cls, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function PositionRow({ p, ethUsd }: { p: Position; ethUsd: number }) {
  const holding = units(p.balance) > 0;
  const underwater = holding && p.avgEntry > p.coin.price;
  const cost = p.value - p.unrealized;
  const pct = cost > 0 ? (p.unrealized / cost) * 100 : null;
  // where the price sits relative to your entry, for the mini gauge (entry = 50%)
  const ratio = p.avgEntry > 0 ? p.coin.price / p.avgEntry : 1;
  const marker = Math.max(4, Math.min(96, 50 * ratio));
  return (
    <li>
      <Link
        href={`/token/${p.coin.address}`}
        className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-elev-2 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_160px]"
      >
        <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
          <CoinAvatar src={p.coin.image} symbol={p.coin.symbol} seed={p.coin.address} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold">${p.coin.symbol}</span>
              <QuoteChip symbol={p.coin.quote.symbol} />
            </div>
            <div className="mt-0.5 text-xs text-muted">{holding && p.firstBuyAt > 0 ? `held ${age(p.firstBuyAt)}` : "closed"}</div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] text-faint md:hidden">Balance</div>
          <div className="num text-sm">{tokens(p.balance, 18)}</div>
          <div className="num text-xs text-muted">{usd(p.value * p.coin.quote.ethPerUnit * ethUsd)}</div>
        </div>

        <div className="min-w-0">
          <div className="num flex justify-between gap-2 text-[10px] text-faint">
            <span className="truncate">entry {price(p.avgEntry)}</span>
            <span className="truncate">now {price(p.coin.price)}</span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-sunk">
            <div className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-line-strong" />
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${marker}%`, background: underwater ? "var(--down)" : "var(--up)" }}
            />
          </div>
          <div className="mt-1 text-[10px] text-faint">{p.coin.quote.symbol} per coin</div>
        </div>

        <div className="min-w-0 md:text-right">
          <div className="text-[11px] text-faint md:hidden">P/L</div>
          <div className={clsx("num text-sm", p.unrealized >= 0 ? "text-up" : "text-down")}>
            {p.unrealized >= 0 ? "+" : ""}
            {num(p.unrealized)} {p.coin.quote.symbol}
          </div>
          {pct !== null && holding && <Change value={pct} className="text-xs" />}
        </div>

        <div className="md:text-right">
          {!holding ? (
            <Badge tone="outline">Closed</Badge>
          ) : p.airdropEligible ? (
            <Badge tone="accent">
              <Gift size={11} /> Receiving airdrops
            </Badge>
          ) : underwater ? (
            <Badge tone="down">Underwater</Badge>
          ) : (
            <Badge tone="up">In profit</Badge>
          )}
        </div>
      </Link>
    </li>
  );
}

function ConnectPrompt() {
  const benefits = [
    { icon: LineChart, color: "var(--accent)", title: "Entries and P/L", body: "Your average entry on every coin, tax included, against the live price." },
    { icon: Gift, color: bucketColor.airdrop, title: "Airdrops you're earning", body: "See which coins are paying you because you bought high." },
    { icon: ShieldCheck, color: bucketColor.protection, title: "Protection claims", body: "Losses you realized, what they're covered for, and a claim button." },
  ];
  return (
    <Card featured className="relative overflow-hidden">
      <div className="spectrum absolute -bottom-40 left-1/3 h-72 w-[36rem] rounded-full opacity-15 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-1 gap-10 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <LogoMark size={52} live className="text-fg" />
          <h2 className="font-display mt-6 text-3xl leading-tight font-semibold sm:text-4xl">Your coins, all in one place</h2>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            Connect a wallet to see your positions, the airdrops you&apos;re earning and any protection you can claim.
          </p>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button size="lg" className="mt-7" onClick={openConnectModal}>
                Connect wallet <ArrowRight size={16} />
              </Button>
            )}
          </ConnectButton.Custom>
        </div>
        <ul className="grid gap-3">
          {benefits.map((b) => (
            <li key={b.title} className="surface flex items-start gap-4 rounded-2xl p-4">
              <IconTile color={b.color} size={40}>
                <b.icon size={18} />
              </IconTile>
              <div>
                <div className="text-[15px] font-semibold">{b.title}</div>
                <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{b.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** Airdrops that couldn't be pushed (e.g. a contract wallet rejected ETH) wait here to be pulled. */
function UnclaimedAirdrops({ account }: { account: Address }) {
  const { data: quotes } = useQuotes();
  const tx = useTx();
  const list = quotes ?? [];
  const reads = useReadContracts({
    contracts: list.map((q) => ({
      address: addresses.holderAirdrop!,
      abi: abis.airdrop,
      functionName: "unclaimed" as const,
      args: [account, q.address] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: list.length > 0 && !!addresses.holderAirdrop },
  });
  const owed = list
    .map((q, i) => ({ q, amount: (reads.data?.[i]?.result as bigint | undefined) ?? 0n }))
    .filter((x) => x.amount > 0n);
  if (owed.length === 0) return null;
  return (
    <Card className="p-5 sm:p-6" featured>
      <div className="flex items-start gap-3">
        <IconTile color={bucketColor.airdrop} size={40}>
          <Gift size={18} />
        </IconTile>
        <div>
          <h2 className="text-[15px] font-semibold">Airdrops waiting for you</h2>
          <p className="mt-1 text-xs text-muted">These couldn&apos;t be pushed to your wallet automatically. Pull them here.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {owed.map(({ q, amount }) => (
          <li key={q.address} className="flex items-center justify-between rounded-2xl bg-sunk/70 px-4 py-3">
            <span className="num text-sm">{tokens(amount, q.decimals, q.symbol)}</span>
            <Button
              size="sm"
              disabled={tx.busy}
              onClick={() =>
                tx.send(`Claim ${q.symbol} airdrop`, {
                  address: addresses.holderAirdrop!,
                  abi: abis.airdrop,
                  functionName: "claimUnclaimed",
                  args: [q.address],
                })
              }
            >
              Claim
            </Button>
          </li>
        ))}
      </ul>
      <TxStatus state={tx.state} className="mt-3" />
    </Card>
  );
}
