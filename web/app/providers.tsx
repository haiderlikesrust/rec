"use client";

import type { Adapter } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeToggle";
import { WalletModalProvider } from "@/components/wallet/WalletModal";
import { DEMO, RPC_URL } from "@/lib/explorer";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  // Phantom, Solflare, Backpack and other Wallet Standard wallets register themselves; the burner is for demo mode.
  const wallets = useMemo<Adapter[]>(() => (DEMO ? [new UnsafeBurnerWalletAdapter()] : []), []);
  return (
    <ThemeProvider>
      <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
        <WalletProvider wallets={wallets} autoConnect>
          <QueryClientProvider client={queryClient}>
            <WalletModalProvider>{children}</WalletModalProvider>
          </QueryClientProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  );
}
