import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { brand } from "@cook/shared";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { themeBootScript } from "@/components/ThemeToggle";
import { Providers } from "./providers";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: `${brand.name} · every fee comes back`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  openGraph: { siteName: brand.name, url: brand.url, description: brand.tagline },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#07070C" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen overflow-x-hidden">
        <div className="ambient" aria-hidden />
        <Providers>
          <Header />
          <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
