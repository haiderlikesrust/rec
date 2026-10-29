"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import clsx from "clsx";
import { Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { brand } from "@cook/shared";
import { LogoMark } from "./LogoMark";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { href: "/", label: "Coins" },
  { href: "/otc", label: "OTC" },
  { href: "/protection", label: "Protection" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/docs", label: "Docs" },
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
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/token") : pathname.startsWith(href);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 transition-[background-color,border-color] duration-300",
        scrolled || open ? "glass border-b border-line" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-6 hidden items-center rounded-full border border-line bg-elev/60 p-1 lg:flex">
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
          <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false} label="Connect" />
          <button
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:text-fg lg:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 pt-3 pb-4 lg:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            {[{ href: "/launch", label: "Launch a coin" }, ...nav].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "rounded-xl px-3.5 py-2.5 text-sm",
                  active(n.href) ? "bg-elev-2 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted",
                )}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
