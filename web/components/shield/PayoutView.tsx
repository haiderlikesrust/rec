"use client";

import { ArrowUpRight, Check, Link2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PROTECTION_CAP_X_TAX, brand, type Payout } from "@gantry/shared";
import { usePayout } from "@/lib/data";
import { explorerTx } from "@/lib/explorer";
import { short, sol, usd } from "@/lib/format";
import { useAddress } from "@/lib/wallet";
import { CoinAvatar } from "@/components/CoinAvatar";
import { XLogo } from "@/components/XLogo";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Panel, Row, Skeleton, buttonClass } from "@/components/ui";
import { PAYOUT_CAVEAT, payoutCoverage, payoutHold, payoutPath, payoutPost, payoutSent } from "./payout";

/** The page is one card, centred in a narrow measure. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-lg">{children}</div>;
}

const howItWorks = (
  <ButtonLink href="/shield" variant="secondary" size="sm">
    How {brand.shield} works
  </ButtonLink>
);

/**
 * One paid loss cover as a page anyone can open: the coin, what was lost and what came back, the few facts of the
 * record, the way into the site, and two ways to pass the link on. It shows only what the public record holds, and
 * the wallet is always shortened.
 */
export function PayoutView({ id }: { id: string }) {
  const { data: payout, isLoading, isError, error, refetch, isFetching } = usePayout(id);

  // a payout on its way is sent about a minute after the sale: keep looking until it has arrived
  const waiting = !!payout && !payoutSent(payout);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void refetch(), 10_000);
    return () => clearInterval(t);
  }, [waiting, refetch]);

  if (payout)
    return (
      <Frame>
        <PayoutCard payout={payout} />
      </Frame>
    );

  if (isLoading)
    return (
      <Frame>
        <Panel className="space-y-6 p-6 sm:p-8" aria-busy="true" aria-label="Loading the payout">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-36" />
          <Skeleton className="h-12" />
        </Panel>
      </Frame>
    );

  // the backend answers an unknown id, and a cover that paid nothing, with 404 and `{ error: "not found" }`
  const missing = isError && /404|not found/i.test(String(error));
  return (
    <Frame>
      <h1 className="sr-only">{missing ? "Payout not found" : "Payout did not load"}</h1>
      <Panel>
        {missing ? (
          <EmptyState
            title="No payout at this link"
            detail={`The link may be incomplete, or that sale was not paid anything back by ${brand.shield}.`}
            action={howItWorks}
          />
        ) : (
          <>
            <ErrorState title="This payout didn't load" detail={`${brand.name} isn't answering right now.`} className="pb-4" />
            <div className="flex justify-center pb-8">
              <Button variant="secondary" size="sm" disabled={isFetching} onClick={() => void refetch()}>
                {isFetching ? "Trying…" : "Try again"}
              </Button>
            </div>
          </>
        )}
      </Panel>
    </Frame>
  );
}

/** Why the payout is smaller than the hold-time rate, in a few words. Null when the rate was paid in full. */
function capNote(p: Payout) {
  if (p.limit === "tax") return `capped at ${PROTECTION_CAP_X_TAX}× the fees paid`;
  if (p.limit === "pot") return "capped by the coin's pot";
  return null;
}

const day = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

function PayoutCard({ payout: p }: { payout: Payout }) {
  const wallet = useAddress();
  const own = !!wallet && wallet === p.wallet;
  const sent = payoutSent(p);
  const hasTx = sent && !!p.tx && p.tx !== "demo";
  const cap = capNote(p);

  return (
    <Panel as="article" className="p-6 sm:p-8">
      <Link href={`/token/${p.coin.address}`} className="group inline-flex max-w-full items-center gap-3 rounded-sm">
        <CoinAvatar src={p.coin.image} symbol={p.coin.symbol} seed={p.coin.address} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-ink group-hover:underline">{p.coin.name}</span>
          <span className="block truncate text-[13px] text-ink-3">${p.coin.symbol}</span>
        </span>
      </Link>

      {/* one line from 640px; on a phone the two halves stack, the dot goes and the second half gets its capital */}
      <h1 className="num mt-6 font-display text-[26px] leading-tight font-semibold text-ink sm:text-[24px]">
        <span className="block sm:inline">Lost {sol(p.lossSol)}</span>
        <span aria-hidden className="mx-2 text-ink-3 max-sm:hidden">
          ·
        </span>
        <span className="sr-only">, </span>
        <span className="block max-sm:first-letter:uppercase sm:inline">
          {sent ? "got" : "getting"} <span className="text-gain">{sol(p.payoutSol)}</span> back
        </span>
      </h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
        {brand.shield}, the protection fund on {brand.name}, {sent ? "sent back" : "is sending back"} <span className="num">{usd(p.payoutUsd)}</span>{" "}
        of a <span className="num">{usd(p.lossUsd)}</span> loss.
      </p>

      <div className="mt-5 rounded-lg bg-raise px-4 py-1.5">
        <Row label="Held for" value={payoutHold(p)} />
        <Row
          label="Covered"
          value={
            <>
              {payoutCoverage(p)} of the loss
              {cap && <span className="block text-[13px] text-ink-3">{cap}</span>}
            </>
          }
        />
        <Row label="Sold on" value={day.format(p.t * 1000)} />
        <Row
          label="Wallet"
          value={
            <span className="inline-flex items-center gap-2">
              {own && <Badge tone="signal">You</Badge>}
              <span className="font-mono text-[13px]">{short(p.wallet)}</span>
            </span>
          }
        />
        <Row
          label="Payout"
          value={
            hasTx ? (
              <a href={explorerTx(p.tx!)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                View transaction <ArrowUpRight size={14} aria-hidden />
              </a>
            ) : sent ? (
              "Sent"
            ) : p.status === "sending" ? (
              "Sending now"
            ) : (
              "On the way"
            )
          }
        />
      </div>

      <ButtonLink href="/" size="lg" block className="mt-6">
        Launch or trade on {brand.name}
      </ButtonLink>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <a
          href={`https://x.com/intent/post?${new URLSearchParams({ text: payoutPost(p, own), url: `${brand.url}${payoutPath(p.id)}` })}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({ variant: "secondary" })}
        >
          <XLogo size={13} /> Post on X
        </a>
        <CopyLink path={payoutPath(p.id)} />
      </div>

      <p className="mt-6 text-center text-[13px] leading-relaxed text-ink-3">
        {PAYOUT_CAVEAT}{" "}
        <Link href="/shield" className="whitespace-nowrap text-ink-2 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-ink">
          How {brand.shield} works
        </Link>
      </p>
    </Panel>
  );
}

/** Puts this page's address on the clipboard and says so for a moment. */
function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    navigator.clipboard?.writeText(`${window.location.origin}${path}`).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <>
      <Button variant="secondary" onClick={copy}>
        {copied ? <Check size={15} className="text-gain" aria-hidden /> : <Link2 size={15} aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </>
  );
}
