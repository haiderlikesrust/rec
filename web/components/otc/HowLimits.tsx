import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { brand, otcPolicy } from "@gantry/shared";
import { explorerAddress } from "@/lib/explorer";
import { bps, short } from "@/lib/format";
import { Disclosure } from "@/components/shield/Disclosure";

const creditX = otcPolicy.creditMultiplierBps / 10_000;
const quietDays = otcPolicy.activeSeconds / 86_400;
const twapMinutes = otcPolicy.twapSeconds / 60;

/** The reserve's rules in four sentences, closed by default. Every number reads `otcPolicy`. */
export function HowLimits({ reserveWallet }: { reserveWallet?: string }) {
  return (
    <Disclosure title={otcPolicy.limited ? "How limits work" : "How the price works"}>
      <div className="max-w-2xl space-y-3 text-[15px] leading-relaxed text-ink-2">
        {otcPolicy.limited ? (
          <>
            <p>
              Each coin earns its own limit: every SOL its trading fees send to the reserve lets holders sell {creditX} SOL worth of that
              coin.
            </p>
            <p>
              The limit is full while the coin keeps trading, and drops to {bps(otcPolicy.floorBps)} of itself after {quietDays} days
              without a trade.
            </p>
            <p>
              One coin can use up to {bps(otcPolicy.maxShareOfReserveBps)} of the reserve at once, and one wallet can sell up to{" "}
              {bps(otcPolicy.walletDailyBps)} of the reserve per coin each day (the day restarts at 00:00 UTC).
            </p>
          </>
        ) : (
          <p>There are no sell limits. The reserve buys until its SOL runs out, and refills as coins trade.</p>
        )}
        <p>
          The price is the lower of the current price and the {twapMinutes}-minute average, plus {bps(otcPolicy.premiumBps)}, so a new coin
          can be sold after {twapMinutes} minutes.
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
          <Link href={`${brand.docsPath}#otc`} className="link">
            Read more in the docs
          </Link>
          {reserveWallet && (
            <a href={explorerAddress(reserveWallet)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
              Reserve wallet <span className="font-mono text-[13px]">{short(reserveWallet)}</span> <ArrowUpRight size={14} aria-hidden />
            </a>
          )}
        </p>
      </div>
    </Disclosure>
  );
}
