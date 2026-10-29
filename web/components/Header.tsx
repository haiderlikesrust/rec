"use client";

import clsx from "clsx";
import { ChevronRight, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { brand } from "@cook/shared";
import { useStats } from "@/lib/data";
import { LogoMark } from "./LogoMark";
import { ThemeToggle } from "./ThemeToggle";
import { ConnectWallet } from "./wallet/ConnectWallet";

const nav = [
  { href: "/", label: "Coins", blurb: "Every coin, every pair" },
  { href: "/otc", label: "OTC", blurb: "Sell into the SOL reserve, no slippage" },
  { href: "/protection", label: "Protection", blurb: "Claim back part of a loss" },
  { href: "/portfolio", label: "Portfolio", blurb: "Your coins, airdrops and payouts" },
  { href: "/docs", label: "Docs", blurb: "How the 3% comes back" },
];

export function Logo() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5">
      <LogoMark size={30} live className="text-fg transition-transform duration-500 group-hover:rotate-90" />
      <span className="font-display text-[19px] font-semibold">{brand.name}</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const demo = useStats().data?.demo;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // the menu is phones and tablets only; growing past lg leaves nothing to close it with
    const wide = window.matchMedia("(min-width: 1024px)");
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = overflow;
    };
  }, [open]);
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/token") : pathname.startsWith(href);

  return (
    <>
      <header
        className={clsx(
          "sticky top-0 z-40 transition-[background-color,border-color] duration-300",
          scrolled || open ? "glass border-b border-line" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          {demo && (
            <span
              title="Demo mode: trades are simulated by the backend, nothing touches the chain"
              className="hidden rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[10px] font-semibold tracking-wider text-muted uppercase sm:inline"
            >
              Demo
            </span>
          )}
          <nav className="ml-4 hidden items-center rounded-full border border-line bg-elev/60 p-1 lg:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "rounded-full px-4 py-1.5 text-sm transition-all duration-200",
                  active(n.href)
                    ? "bg-elev-2 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]"
                    : "text-muted hover:text-fg",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Link
              href="/launch"
              className="btn-primary hidden h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-all sm:inline-flex"
            >
              <Plus size={15} strokeWidth={2.5} /> Launch
            </Link>
            <ThemeToggle />
            <ConnectWallet />
            <button
              aria-label={open ? "Close menu" : "Menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((o) => !o)}
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors lg:hidden",
                open ? "border-line-strong bg-elev-2 text-fg" : "border-line text-muted hover:text-fg",
              )}
            >
              {open ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>
      </header>

      {/* outside the header: its backdrop blur would otherwise pin this fixed layer to the header's box */}
      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <nav
            id="mobile-menu"
            aria-label="Main"
            className="relative mx-3 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[22px] border border-line-strong bg-elev shadow-card animate-fade-up [animation-duration:280ms] sm:mx-auto sm:max-w-md"
          >
            <ul className="p-2">
              {nav.map((n, i) => {
                const on = active(n.href);
                return (
                  <li key={n.href} className="animate-fade-up [animation-duration:320ms]" style={{ animationDelay: `${40 + i * 30}ms` }}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      aria-current={on ? "page" : undefined}
                      className={clsx(
                        "group flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors",
                        on ? "bg-elev-2 shadow-[inset_0_0_0_1px_var(--line-strong)]" : "active:bg-elev-2",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block text-[15px] font-medium", on ? "text-fg" : "text-fg/90")}>{n.label}</span>
                        <span className="block truncate text-xs text-faint">{n.blurb}</span>
                      </span>
                      {on ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
                      ) : (
                        <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-active:translate-x-0.5" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-3 border-t border-line p-3">
              <Link
                href="/launch"
                onClick={() => setOpen(false)}
                className="btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold"
              >
                <Plus size={17} strokeWidth={2.5} /> Launch a coin
              </Link>
              <p className="text-center text-[11px] text-faint">
                {brand.chainLabel} · {brand.poolsLabel}
                {demo && " · Demo mode"}
              </p>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
