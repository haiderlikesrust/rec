"use client";

import { useEffect, useRef, useState } from "react";
import type { Coin, SwapSide } from "@gantry/shared";
import { Button } from "@/components/ui";
import { useWalletModal } from "@/components/wallet/WalletModal";
import { TradePanel } from "./TradePanel";

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Under 1024px the buy/sell box leaves the page: this bar docks above the shell's tab bar with a Buy and a Sell
 * button, and either one raises the box as a sheet. From 1024px the box lives in the right column.
 */
export function MobileTradeBar({ coin }: { coin: Coin }) {
  const [side, setSide] = useState<SwapSide | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const { visible: walletOpen } = useWalletModal();
  const walletOnTop = useRef(walletOpen);
  useEffect(() => {
    walletOnTop.current = walletOpen;
  }, [walletOpen]);

  // the shell pads the page by the dock's height while this class is on <html>
  useEffect(() => {
    document.documentElement.classList.add("has-dock");
    return () => document.documentElement.classList.remove("has-dock");
  }, []);

  // the sheet is a modal: focus goes in and stays in, Escape closes it, the page behind holds still, focus returns
  const open = side !== null;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const stops = () => Array.from(sheet.current?.querySelectorAll<HTMLElement>(focusable) ?? []).filter((el) => el.tabIndex >= 0);
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (walletOnTop.current) return; // the wallet dialog is above the sheet and handles its own keys
      if (e.key === "Escape") return setSide(null);
      if (e.key !== "Tab") return;
      const list = stops();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === sheet.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // the sheet only exists under 1024px: let go of the page if the window grows past it
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setSide(null);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  return (
    <>
      <section aria-label={`Buy or sell ${coin.symbol}`} className="dock lg:hidden">
        <div className="mx-auto flex h-[67px] max-w-[var(--content-max)] items-center gap-3 px-[var(--gutter)]">
          <Button variant="secondary" size="lg" className="min-w-0 flex-1" aria-haspopup="dialog" onClick={() => setSide("sell")}>
            Sell
          </Button>
          <Button variant="primary" size="lg" className="min-w-0 flex-1" aria-haspopup="dialog" onClick={() => setSide("buy")}>
            Buy
          </Button>
        </div>
      </section>

      {side && (
        <div className="fixed inset-0 z-[60] flex items-end lg:hidden">
          <div aria-hidden onClick={() => setSide(null)} className="animate-fade absolute inset-0 bg-black/60" />
          <div
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-label={`Buy or sell ${coin.symbol}`}
            tabIndex={-1}
            className="animate-sheet relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-panel pb-[env(safe-area-inset-bottom)] shadow-float outline-none"
          >
            <TradePanel key={side} coin={coin} initialSide={side} onClose={() => setSide(null)} />
          </div>
        </div>
      )}
    </>
  );
}
