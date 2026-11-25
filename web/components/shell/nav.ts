import { BookOpen, Coins, Rocket, Shield, Vault, WalletMinimal, type LucideIcon } from "lucide-react";
import { brand } from "@gantry/shared";

export type NavItem = {
  href: string;
  /** the navbar's label */
  label: string;
  /** the tab bar's label: one short word */
  short: string;
  /** shown in the tab bar only: the navbar is text */
  icon: LucideIcon;
  /** which paths light this item up */
  match: (pathname: string) => boolean;
  /** false keeps the item out of the phone tab bar (it has room for five) */
  tab?: boolean;
};

const under = (href: string) => (pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

/** A tab has room for one word: the last one of a longer name. */
const lastWord = (s: string) => s.trim().split(/\s+/).pop() ?? s;

/**
 * The primary navigation, in order. The navbar (from 1024px) renders the whole list; the tab bar (below 1024px)
 * renders the items that are not `tab: false`, and the foot line links to the rest.
 */
export const nav: NavItem[] = [
  { href: "/", label: "Coins", short: "Coins", icon: Coins, match: (p) => p === "/" || p.startsWith("/token/") },
  { href: "/launch", label: "Launch", short: "Launch", icon: Rocket, match: under("/launch") },
  { href: "/otc", label: "OTC reserve", short: "OTC", icon: Vault, match: under("/otc") },
  { href: "/shield", label: brand.shield, short: lastWord(brand.shield), icon: Shield, match: under("/shield") },
  { href: "/portfolio", label: "Portfolio", short: "Portfolio", icon: WalletMinimal, match: under("/portfolio") },
  { href: brand.docsPath, label: "Docs", short: "Docs", icon: BookOpen, match: under(brand.docsPath), tab: false },
];

/** The five items of the phone tab bar. */
export const tabs = nav.filter((item) => item.tab !== false);
