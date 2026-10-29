"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import clsx from "clsx";
import { ArrowUpRight, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { brand } from "@cook/shared";
import { LogoMark } from "@/components/LogoMark";

type Ctx = { open: () => void; close: () => void; visible: boolean };
const ModalCtx = createContext<Ctx>({ open: () => {}, close: () => {}, visible: false });
export const useWalletModal = () => useContext(ModalCtx);

const installLinks = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/download" },
];

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return (
    <ModalCtx.Provider value={{ open, close, visible }}>
      {children}
      {visible && <WalletModal onClose={close} />}
    </ModalCtx.Provider>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select, wallet, connect, connected, connecting } = useWallet();
  const [error, setError] = useState<string>();
  const pending = useRef<WalletName | null>(null);

  // select() swaps the adapter; connect once the provider has picked it up
  useEffect(() => {
    if (!pending.current || wallet?.adapter.name !== pending.current || connected || connecting) return;
    pending.current = null;
    connect().catch((e: Error) => setError(/reject|cancel/i.test(e.message) ? "Connection request was rejected." : e.message));
  }, [wallet, connect, connected, connecting]);

  useEffect(() => {
    if (connected) onClose();
  }, [connected, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const usable = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  const choose = (name: WalletName) => {
    setError(undefined);
    pending.current = name;
    if (wallet?.adapter.name === name) {
      pending.current = null;
      connect().catch((e: Error) => setError(e.message));
    } else select(name);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal aria-label="Connect a wallet">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="surface relative w-full max-w-sm overflow-hidden rounded-[26px] shadow-card animate-fade-up">
        <div className="spectrum h-1 w-full opacity-80" />
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <LogoMark size={34} live className="text-fg" />
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">Connect a wallet</h2>
              <p className="mt-0.5 text-xs text-muted">Any Solana wallet works with {brand.name}.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-sunk hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 px-4 pt-5 pb-4">
          {usable.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center">
              <p className="text-sm font-medium">No Solana wallet found</p>
              <p className="mt-1 text-xs text-muted">Install one, then refresh this page.</p>
            </div>
          )}
          {usable.map((w) => {
            const busy = connecting && wallet?.adapter.name === w.adapter.name;
            return (
              <button
                key={w.adapter.name}
                onClick={() => choose(w.adapter.name)}
                disabled={connecting}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-2xl border border-line bg-sunk/60 px-4 py-3 text-left transition-all hover:border-line-strong hover:bg-elev-2 disabled:opacity-60",
                  busy && "border-accent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
                <span className="flex-1 text-sm font-medium">{w.adapter.name}</span>
                <span className="text-[11px] text-faint">
                  {busy ? "Connecting…" : w.adapter.name.includes("Burner") ? "Demo" : "Detected"}
                </span>
              </button>
            );
          })}
          {error && <p className="rounded-xl bg-down-soft px-3 py-2 text-xs text-down">{error}</p>}
        </div>

        <div className="border-t border-line px-6 py-4">
          <p className="text-[11px] text-faint">{usable.length ? "Need another wallet?" : "Popular Solana wallets"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {installLinks.map((l) => (
              <a
                key={l.name}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:text-fg"
              >
                {l.name} <ArrowUpRight size={12} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
