"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import clsx from "clsx";
import { ArrowUpRight, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { brand } from "@gantry/shared";

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

const focusable = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select, wallet, connect, connected, connecting } = useWallet();
  const [error, setError] = useState<string>();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (connected) onClose();
  }, [connected, onClose]);

  // a modal: focus moves in and stays in, Escape closes, the page behind does not scroll, focus returns on close
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(focusable) ?? []);
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  const usable = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  const choose = (name: WalletName) => {
    setError(undefined);
    // The provider connects a newly selected wallet by itself. Calling connect() here as well would fire before the
    // provider is listening to the new adapter, and an adapter that connects synchronously would never be noticed.
    if (wallet?.adapter.name === name)
      connect().catch((e: Error) => setError(/reject|cancel/i.test(e.message) ? "The request was declined in the wallet." : e.message));
    else select(name);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden onClick={onClose} className="absolute inset-0 animate-fade bg-black/60" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full animate-sheet rounded-t-2xl border border-rule bg-panel p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float sm:max-w-[25rem] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="display-2">
              Connect a wallet
            </h2>
            <p className="mt-1 text-sm text-ink-2">Any Solana wallet works with {brand.name}.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-white/6 hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {usable.length === 0 ? (
          <div className="mt-5 rounded-lg bg-raise px-4 py-5">
            <p className="text-sm font-medium text-ink">No Solana wallet found</p>
            <p className="mt-1 text-sm text-ink-2">Install one, then refresh this page.</p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {usable.map((w, i) => {
              const busy = connecting && wallet?.adapter.name === w.adapter.name;
              return (
                <li key={w.adapter.name}>
                  <button
                    onClick={() => choose(w.adapter.name)}
                    disabled={connecting}
                    data-autofocus={i === 0 ? "" : undefined}
                    className={clsx(
                      "flex h-14 w-full items-center gap-3 rounded-lg bg-raise px-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,#fff_7%,var(--raise))] disabled:cursor-not-allowed disabled:text-ink-3",
                      busy && "bg-[color-mix(in_srgb,#fff_7%,var(--raise))]",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.adapter.icon} alt="" width={28} height={28} className="h-7 w-7 rounded-sm" />
                    <span className="flex-1 text-[15px] font-medium">{w.adapter.name}</span>
                    <span className={clsx("text-[13px]", busy ? "text-signal" : "text-ink-2")}>
                      {busy ? "Connecting…" : w.adapter.name.includes("Burner") ? "Demo" : "Detected"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-loss-tint px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px]">
          <p className="text-ink-3">{usable.length ? "Need another?" : "Get a wallet"}</p>
          {installLinks.map((l) => (
            <a
              key={l.name}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-sm text-ink-2 transition-colors hover:text-ink"
            >
              {l.name} <ArrowUpRight size={13} aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
