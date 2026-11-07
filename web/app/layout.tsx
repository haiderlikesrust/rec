import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { brand } from "@cook/shared";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "./providers";
import "./globals.css";

const display = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", display: "swap" });
const body = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: `${brand.name} · ${brand.slogan}`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  openGraph: { siteName: brand.name, url: brand.url, description: brand.tagline },
  twitter: { card: "summary_large_image", site: brand.xHandle, creator: brand.xHandle },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1124",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${body.variable} ${display.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen overflow-x-hidden">
        <div className="aurora" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <Providers>
          <Header />
          <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
