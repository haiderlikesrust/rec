"use client";

import clsx from "clsx";
import { ArrowUpRight, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { brand } from "@cook/shared";
import { useStats } from "@/lib/data";
import { LogoMark } from "./LogoMark";
import { XLogo } from "./XLogo";
import { ConnectWallet } from "./wallet/ConnectWallet";

const nav = [
  { href: "/", label: "Coins", blurb: "Every coin, every pair" },
  { href: "/otc", label: "OTC", blurb: "Sell into the SOL reserve, no slippage" },
  { href: "/protection", label: "Protection", blurb: "Part of a loss, paid back automatically" },
  { href: "/portfolio", label: "Portfolio", blurb: "Your coins and payouts" },
  { href: "/docs", label: "Docs", blurb: "How the 3% comes back" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx("group flex shrink-0 items-center gap-2.5", className)} aria-label={`${brand.name} home`}>
      <LogoMark size={34} className="squish transition-transform duration-300 group-hover:scale-110" />
      <span className="font-display text-[22px] font-bold tracking-tight">{brand.name.toLowerCase()}</span>
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
          "sticky top-0 z-40 transition-[background-color,box-shadow] duration-300",
          scrolled ? "glass shadow-[0_1px_0_var(--line),0_12px_30px_-20px_rgba(0,0,0,0.8)]" : "",
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          {demo && (
            <span
              title="Demo mode: trades are simulated by the backend, nothing touches the chain"
              className="font-display hidden rounded-full bg-violet-soft px-2.5 py-1 text-[11px] font-semibold text-violet sm:inline"
            >
              Demo
            </span>
          )}
          <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
            {nav.map((n) => {
              const on = active(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={clsx(
                    "group font-display relative px-3.5 py-2 text-[15px] font-semibold transition-colors",
                    on ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {n.label}
                  <span
                    className={clsx(
                      "spectrum absolute inset-x-3.5 -bottom-0.5 h-[3px] origin-left rounded-full transition-transform duration-300",
                      on ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50",
                    )}
                  />
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2 lg:ml-0">
            <a
              href={brand.x}
              target="_blank"
              rel="noreferrer"
              aria-label={`${brand.name} on X`}
              title={`${brand.xHandle} on X`}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-elev hover:text-fg sm:flex"
            >
              <XLogo size={15} />
            </a>
            <Link
              href="/launch"
              className="btn-primary font-display hidden h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              <Plus size={16} strokeWidth={2.75} /> Launch
            </Link>
            <ConnectWallet />
            <button
              aria-label={open ? "Close menu" : "Menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((o) => !o)}
              className="surface flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg lg:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* phones and tablets: a full-screen sheet of big links (outside the header, whose blur would trap it) */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="glass fixed inset-0 z-50 flex flex-col overflow-y-auto px-5 pt-[18px] pb-8 lg:hidden"
        >
          <div className="flex items-center justify-between">
            <Logo />
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="surface flex h-10 w-10 items-center justify-center rounded-full">
              <X size={18} />
            </button>
          </div>
          <nav aria-label="Main" className="mt-10 grid gap-1.5">
            {nav.map((n, i) => {
              const on = active(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={clsx("rounded-3xl px-4 py-3 transition-colors", on ? "surface" : "active:bg-elev")}
                >
                  <span className="block animate-fade-up [animation-duration:380ms]" style={{ animationDelay: `${i * 45}ms` }}>
                    <span className={clsx("font-display block text-[30px] leading-tight font-bold", on ? "text-fg" : "text-muted")}>{n.label}</span>
                    <span className="block text-sm text-faint">{n.blurb}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto grid gap-3 pt-8">
            <Link href="/launch" onClick={() => setOpen(false)} className="btn-primary font-display flex h-13 items-center justify-center gap-2 rounded-full py-3.5 text-base font-semibold">
              <Plus size={18} strokeWidth={2.75} /> Launch a coin
            </Link>
            <a
              href={brand.x}
              target="_blank"
              rel="noreferrer"
              className="font-display flex items-center justify-center gap-2 py-2 text-sm font-semibold text-muted"
            >
              <XLogo size={14} /> Follow {brand.xHandle} <ArrowUpRight size={14} />
            </a>
            <p className="text-center text-[11px] text-faint">
              {brand.chainLabel} · {brand.poolsLabel}
              {demo && " · Demo mode"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
