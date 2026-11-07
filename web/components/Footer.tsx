import Link from "next/link";
import { brand } from "@cook/shared";
import { LogoMark } from "./LogoMark";
import { XLogo } from "./XLogo";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Coins" },
      { href: "/launch", label: "Launch a coin" },
      { href: "/otc", label: "OTC reserve" },
      { href: "/protection", label: "Protection fund" },
      { href: "/portfolio", label: "Portfolio" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "How it works" },
      { href: "/docs#example", label: "Worked example" },
      { href: "/docs#nest", label: `The ${brand.nest}` },
      { href: "/docs#wallets", label: "Treasury wallets" },
      { href: "/docs#risks", label: "Risks" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mx-auto mt-28 max-w-7xl px-4 pb-10 sm:px-6">
      <div className="surface relative overflow-hidden rounded-[32px] p-8 sm:p-10">
        <div className="spectrum pointer-events-none absolute -top-32 -right-24 h-64 w-64 rounded-full opacity-[0.12] blur-3xl" aria-hidden />
        <div className="relative grid gap-10 md:grid-cols-[1.3fr_1fr]">
          <div className="max-w-md">
            <div className="flex items-center gap-3">
              <LogoMark size={44} />
              <span className="font-display text-3xl font-bold tracking-tight">{brand.name.toLowerCase()}</span>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">{brand.tagline}</p>
            <a
              href={brand.x}
              target="_blank"
              rel="noreferrer"
              className="font-display mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-sm font-semibold text-bg transition-transform hover:-translate-y-0.5"
            >
              <XLogo size={13} /> Follow {brand.xHandle}
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8">
            {cols.map((c) => (
              <div key={c.title}>
                <p className="eyebrow mb-4">{c.title}</p>
                <ul className="space-y-2.5 text-sm">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="font-semibold text-muted transition-colors hover:text-fg">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <p className="relative mt-10 border-t border-line pt-6 text-xs leading-relaxed text-faint">
          {brand.chainLabel} · {brand.poolsLabel}. Coins are issued by their creators and are highly volatile. The OTC
          reserve and protection fund are backend-controlled Solana wallets you can audit on-chain. Protection coverage
          is discretionary and capped, not insurance.
        </p>
      </div>
    </footer>
  );
}
