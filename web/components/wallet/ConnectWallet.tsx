"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import clsx from "clsx";
import { Check, ChevronDown, Copy, ExternalLink, LogOut, WalletMinimal } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { explorerAddress } from "@/lib/explorer";
import { short } from "@/lib/format";
import { AddressGlyph } from "./AddressGlyph";
import { useWalletModal } from "./WalletModal";

const menuItem =
  "focus-inset flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-ink-2 transition-colors hover:bg-white/6 hover:text-ink focus-visible:bg-white/6 focus-visible:text-ink";

/**
 * "Connect" when no wallet is attached; the address with a small account menu (dropping from its right edge) when
 * one is. `block` makes it full width.
 */
export function ConnectWallet({ className, block }: { className?: string; block?: boolean }) {
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { open } = useWalletModal();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      trigger.current?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!publicKey) {
    return (
      <button onClick={open} disabled={connecting} className={clsx("btn btn-primary btn-md", block && "w-full", className)}>
        {connecting ? "Connecting…" : "Connect"}
      </button>
    );
  }

  const address = publicKey.toBase58();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div ref={ref} className={clsx("relative", block && "w-full", className)}>
      <button
        ref={trigger}
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-controls={menu ? menuId : undefined}
        aria-label={`Wallet ${short(address)}: account menu`}
        className={clsx(
          "flex h-10 items-center gap-2 rounded-full bg-raise pr-3 pl-2 text-sm text-ink transition-colors hover:bg-[color-mix(in_srgb,#fff_8%,var(--raise))]",
          block && "w-full",
        )}
      >
        <AddressGlyph seed={address} size={24} />
        <span className="font-mono text-[13px] tracking-[-0.02em]">{short(address)}</span>
        {/* the smallest phones have no room for the arrow beside the logo and the address */}
        <ChevronDown size={15} className={clsx("ml-auto text-ink-3 transition-transform max-[359px]:hidden", menu && "rotate-180")} aria-hidden />
      </button>
      {menu && (
        <div
          id={menuId}
          role="menu"
          aria-label="Wallet"
          className="absolute top-full right-0 z-50 mt-2 w-64 animate-enter rounded-xl border border-rule bg-panel p-1.5 shadow-float"
        >
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
            <AddressGlyph seed={address} size={32} />
            <div className="min-w-0">
              <p className="truncate font-mono text-[13px] tracking-[-0.02em] text-ink">{short(address, 5)}</p>
              <p className="text-[13px] leading-snug text-ink-3">{wallet?.adapter.name}</p>
            </div>
          </div>
          <button role="menuitem" onClick={copy} className={menuItem}>
            {copied ? <Check size={16} className="text-gain" aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? "Copied" : "Copy address"}
          </button>
          <a role="menuitem" href={explorerAddress(address)} target="_blank" rel="noreferrer" className={menuItem}>
            <ExternalLink size={16} aria-hidden /> View on Solscan
          </a>
          <Link role="menuitem" href="/portfolio" onClick={() => setMenu(false)} className={menuItem}>
            <WalletMinimal size={16} aria-hidden /> Portfolio
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              disconnect().catch(() => undefined);
            }}
            className={clsx(menuItem, "text-loss hover:bg-loss-tint hover:text-loss focus-visible:bg-loss-tint focus-visible:text-loss")}
          >
            <LogOut size={16} aria-hidden /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
