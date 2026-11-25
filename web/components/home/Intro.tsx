import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LAUNCH_RENT_SOL, brand } from "@gantry/shared";
import { ButtonLink } from "@/components/ui";
import { HeroVisual } from "./HeroVisual";
import { TokenAddress } from "./TokenAddress";

/**
 * The top of the home page: what this is in one headline and one sentence, the way to launch, the way to the docs,
 * and the coin picture beside them (above them on a phone). The platform token's address sits under the buttons
 * once its mint is set; the line is kept free for it so nothing moves when it arrives.
 */
export function Intro() {
  return (
    <section className="grid grid-cols-1 items-center gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <HeroVisual className="h-[200px] sm:h-[280px] lg:order-last lg:h-[400px]" />
      <div className="min-w-0">
        <h1 className="display-1 lg:text-[44px]">Launch a coin. The fees go back to the holders.</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2 sm:text-[17px]">
          Create a Solana coin with a name, a picture and about {LAUNCH_RENT_SOL} SOL, and it trades on Raydium right away.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <ButtonLink href="/launch" size="lg">
            Launch a coin
          </ButtonLink>
          <Link
            href={brand.docsPath}
            className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            How it works <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="mt-2 min-h-9">
          <TokenAddress />
        </div>
      </div>
    </section>
  );
}
