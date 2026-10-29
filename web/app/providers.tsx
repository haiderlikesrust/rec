"use client";

import type { Adapter } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeToggle";
import { WalletModalProvider } from "@/components/wallet/WalletModal";
import { API_URL } from "@/lib/data";
import { runtime, setRuntime, type RuntimeConfig } from "@/lib/explorer";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  const [cfg, setCfg] = useState<RuntimeConfig>({ ...runtime });
  // the backend decides cluster, demo mode and the browser's RPC at runtime
  useEffect(() => {
    fetch(`${API_URL}/api/config`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: RuntimeConfig | null) => {
        if (!c) return;
        setRuntime(c);
        setCfg({ ...runtime });
      })
      .catch(() => {});
  }, []);
  // Phantom, Solflare, Backpack and other Wallet Standard wallets register themselves; the burner is for demo mode.
  const wallets = useMemo<Adapter[]>(() => (cfg.demo ? [new UnsafeBurnerWalletAdapter()] : []), [cfg.demo]);
  return (
    <ThemeProvider>
      <ConnectionProvider endpoint={cfg.rpc} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <QueryClientProvider client={queryClient}>
            <WalletModalProvider>{children}</WalletModalProvider>
          </QueryClientProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  );
}
