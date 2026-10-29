"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { primaryChain, wagmiConfig } from "@/lib/wagmi";
import { ThemeProvider, useTheme } from "@/components/ThemeToggle";

function Rainbow({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  const theme =
    resolved === "dark"
      ? darkTheme({ accentColor: "#8B7CFF", accentColorForeground: "#0B0B0F", borderRadius: "medium", overlayBlur: "small" })
      : lightTheme({ accentColor: "#6D5BFF", borderRadius: "medium", overlayBlur: "small" });
  return (
    <RainbowKitProvider theme={theme} initialChain={primaryChain} modalSize="compact">
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <Rainbow>{children}</Rainbow>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
