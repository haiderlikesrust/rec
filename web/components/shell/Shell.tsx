import type { ReactNode } from "react";
import { FootLine } from "./FootLine";
import { Navbar } from "./Navbar";
import { TabBar } from "./TabBar";

/**
 * The app frame, top to bottom: the navbar (stays at the top), the page, the foot line. Under 1024px the navbar is
 * only the logo and the wallet, and the tab bar fixed to the bottom carries the nav.
 *
 * Pages render inside <main id="content">, a centred column of --content-max with --gutter padding and --page-pt
 * above. The navbar uses the same column, so everything shares one left edge. Nothing here clips or covers the
 * page: a block that wants the full width of the window uses `bleed-screen`. Offsets come from the shell metrics
 * in globals.css (--bar-h, --chrome-top, --chrome-bottom…).
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="shell flex min-h-dvh min-w-0 flex-col pb-[calc(var(--chrome-bottom)+var(--dock-h))]">
        <Navbar />
        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-[var(--gutter)] pt-[var(--page-pt)] outline-none">
          {children}
        </main>
        <FootLine />
      </div>
      <TabBar />
    </>
  );
}
