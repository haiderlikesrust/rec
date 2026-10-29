"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Coin } from "@cook/shared";
import { CoinAvatar } from "@/components/CoinAvatar";
import { Change } from "@/components/ui";
import { TinyPrice } from "./TinyPrice";
import { TradePanel } from "./TradePanel";

/**
 * Phones and tablets: the trade panel would sit far below the chart, so a bar pinned to the bottom of the screen
 * opens it as a sheet instead. Desktop keeps the sticky side panel.
 */
export function MobileTradeBar({ coin }: { coin: Coin }) {
  const [side, setSide] = useState<"buy" | "sell" | null>(null);

  // keep the page's last lines (and the footer) clear of the bar
  useEffect(() => {
    document.documentElement.classList.add("has-trade-bar");
    return () => document.documentElement.classList.remove("has-trade-bar");
  }, []);

  useEffect(() => {
    if (!side) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSide(null);
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [side]);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <CoinAvatar src={coin.image} symbol={coin.symbol} seed={coin.address} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">${coin.symbol}</div>
            <div className="num flex items-center gap-1.5 text-xs text-muted">
              <span>
                $<TinyPrice value={coin.priceUsd} />
              </span>
              <Change value={coin.change24h} />
            </div>
          </div>
          <button
            onClick={() => setSide("sell")}
            className="h-11 rounded-xl border border-line-strong bg-elev px-5 text-sm font-semibold text-down transition-transform active:scale-[0.97]"
          >
            Sell
          </button>
          <button
            onClick={() => setSide("buy")}
            className="h-11 rounded-xl bg-up px-6 text-sm font-semibold text-[#04130d] shadow-[0_8px_24px_-10px_var(--up)] transition-transform active:scale-[0.97]"
          >
            Buy
          </button>
        </div>
      </div>

      {side && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal aria-label={`${side === "buy" ? "Buy" : "Sell"} ${coin.symbol}`}>
          <button aria-label="Close" onClick={() => setSide(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[26px] bg-bg px-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-up">
            <div className="relative mb-1 flex h-8 items-center justify-center">
              <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
              <button
                onClick={() => setSide(null)}
                aria-label="Close"
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:bg-sunk hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <TradePanel key={side} coin={coin} initialSide={side} />
          </div>
        </div>
      )}
    </>
  );
}
