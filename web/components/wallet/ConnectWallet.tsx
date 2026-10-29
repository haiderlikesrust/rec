"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import clsx from "clsx";
import { Check, Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { explorerAddress } from "@/lib/explorer";
import { short } from "@/lib/format";
import { useWalletModal } from "./WalletModal";

const palette = ["#7C6CFF", "#12B5A0", "#F29D0C", "#E8455F", "#3A86FF"];

function Avatar({ seed, size = 22 }: { seed: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = palette[Math.abs(h) % palette.length];
  const b = palette[Math.abs(h >> 3) % palette.length];
  return <span className="shrink-0 rounded-full" style={{ width: size, height: size, background: `conic-gradient(from ${Math.abs(h) % 360}deg, ${a}, ${b}, ${a})` }} />;
}

/** "Connect" when no wallet is attached; the address with a small account menu when one is. */
export function ConnectWallet({ className, block }: { className?: string; block?: boolean }) {
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { open } = useWalletModal();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menu]);

  if (!publicKey) {
    return (
      <button
        onClick={open}
        disabled={connecting}
        className={clsx(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-elev px-3.5 text-sm font-medium shadow-card transition-all hover:bg-elev-2 active:scale-[0.98] disabled:opacity-60",
          block && "h-12 w-full rounded-2xl text-[15px]",
          className,
        )}
      >
        <Wallet size={15} /> {connecting ? "Connecting…" : "Connect"}
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
        onClick={() => setMenu((m) => !m)}
        className={clsx(
          "inline-flex h-9 items-center gap-2 rounded-xl border border-line-strong bg-elev pr-3 pl-2 text-sm font-medium shadow-card transition-all hover:bg-elev-2",
          block && "h-12 w-full justify-center rounded-2xl",
        )}
      >
        <Avatar seed={address} />
        <span className="num">{short(address)}</span>
      </button>
      {menu && (
        <div className="surface absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl p-1.5 shadow-card animate-fade-up">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar seed={address} size={28} />
            <div className="min-w-0">
              <p className="num truncate text-sm font-medium">{short(address, 5)}</p>
              <p className="text-[11px] text-faint">{wallet?.adapter.name}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button onClick={copy} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-sunk hover:text-fg">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy address"}
          </button>
          <a
            href={explorerAddress(address)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-sunk hover:text-fg"
          >
            <ExternalLink size={14} /> View on Solscan
          </a>
          <Link
            href="/portfolio"
            onClick={() => setMenu(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-sunk hover:text-fg"
          >
            <Wallet size={14} /> Portfolio
          </Link>
          <button
            onClick={() => {
              setMenu(false);
              disconnect().catch(() => undefined);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-down hover:bg-down-soft"
          >
            <LogOut size={14} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
