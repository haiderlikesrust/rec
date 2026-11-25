import type { Metadata, Viewport } from "next";
import { DM_Mono, Figtree } from "next/font/google";
import { brand } from "@gantry/shared";
import { Shell } from "@/components/shell/Shell";
import { Providers } from "./providers";
import "./globals.css";

// Figtree sets everything: titles, text and numbers. DM Mono is only for wallet and contract addresses (`font-mono`).
const sans = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: `${brand.name} · ${brand.slogan}`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  openGraph: { siteName: brand.name, url: brand.url, description: brand.tagline },
  twitter: { card: "summary_large_image", ...(brand.xHandle ? { site: brand.xHandle, creator: brand.xHandle } : {}) },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // the tab bar pads itself with env(safe-area-inset-bottom)
  viewportFit: "cover",
  themeColor: "#0E0F12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh overflow-x-hidden">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
