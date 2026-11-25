import Link from "next/link";
import { brand } from "@gantry/shared";
import { XLogo } from "@/components/XLogo";
import { FootToken } from "./FootToken";

const link = "inline-flex h-8 items-center gap-1.5 rounded-sm text-ink-2 transition-colors hover:text-ink";

/** The end of the content column: one quiet line with the name, its links and the fine print. Not a sitemap. */
export function FootLine() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-[var(--content-max)] px-[var(--gutter)] pb-8 sm:mt-28">
      <div className="flex flex-col gap-x-6 gap-y-2 text-[13px] leading-relaxed text-ink-3 md:flex-row md:items-center">
        <nav aria-label="Footer" className="flex shrink-0 items-center gap-5">
          <span className="font-medium text-ink-2">{brand.name}</span>
          <Link href={brand.docsPath} className={link}>
            Docs
          </Link>
          <FootToken className={link} />
          {brand.x && (
            <a href={brand.x} target="_blank" rel="noreferrer" aria-label={`${brand.name} on X (opens in a new tab)`} className={link}>
              <XLogo size={12} /> {brand.xHandle}
            </a>
          )}
        </nav>
        <p className="min-w-0 md:ml-auto md:text-right">
          Coins are highly volatile. {brand.shield} payouts are capped and are not insurance.
        </p>
      </div>
    </footer>
  );
}
