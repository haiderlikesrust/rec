import Link from "next/link";
import { brand } from "@cook/shared";
import { LogoMark } from "./LogoMark";

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
      { href: "/docs#compare", label: "Compare" },
      { href: "/docs#risks", label: "Risks" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-32">
      <div className="spectrum h-px w-full opacity-60" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div className="max-w-md">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} live className="text-fg" />
            <span className="font-display text-xl font-semibold">{brand.name}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">{brand.tagline}</p>
          <p className="mt-6 text-xs leading-relaxed text-faint">
            {brand.chainLabel}. Not affiliated with Robinhood Markets, Inc. Coins are issued by their creators and are
            highly volatile. Protection coverage is discretionary and capped, not insurance. Contracts are unaudited.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="eyebrow mb-4">{c.title}</p>
              <ul className="space-y-2.5 text-sm">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-muted transition-colors hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
