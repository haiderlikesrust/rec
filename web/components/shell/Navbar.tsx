"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/LogoMark";
import { ConnectWallet } from "@/components/wallet/ConnectWallet";
import { useStats } from "@/lib/data";
import { nav } from "./nav";

/** In demo mode only: one small quiet badge beside the logo. */
function DemoBadge() {
  const { data } = useStats();
  if (!data?.demo) return null;
  return (
    <span
      title="Demo mode: trades are simulated and nothing touches the chain"
      className="inline-flex h-[22px] items-center rounded-full bg-white/8 px-2 text-xs leading-none font-medium text-ink-2"
    >
      Demo
    </span>
  );
}

/** True once the page has moved under the navbar. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return scrolled;
}

/**
 * The navbar: it stays at the top, clear while the page is at rest and a translucent blurred bar once content
 * scrolls under it. Logo on the left, the primary links in sentence case (the current one in ink on a soft fill),
 * the wallet on the right. Under 1024px the links drop out (the tab bar carries them) and the bar is just the logo
 * and the wallet. Its contents line up with the content column below.
 */
export function Navbar() {
  const pathname = usePathname();
  const scrolled = useScrolled();
  return (
    <header className={clsx("navbar sticky top-0 z-40 h-[var(--bar-h)]", scrolled && "glass")}>
      <div className="mx-auto flex h-full max-w-[var(--content-max)] items-center gap-3 px-[var(--gutter)] max-[359px]:gap-2">
        <Logo />
        <DemoBadge />

        <nav aria-label="Primary" className="ml-5 hidden min-w-0 lg:block xl:ml-8">
          <ul className="flex items-center gap-1">
            {nav.map((item) => {
              const on = item.match(pathname);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={clsx(
                      "inline-flex h-9 items-center rounded-full px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors",
                      on ? "bg-raise text-ink" : "text-ink-2 hover:bg-white/5 hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto shrink-0">
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
