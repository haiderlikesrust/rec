"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabs } from "./nav";

/**
 * Phones and tablets (under 1024px): the primary nav as a translucent bar fixed to the bottom edge, in place of
 * the navbar's row of links. Five tabs, each an icon on a soft rounded fill when current, with a short label
 * under it. The bar is 64px tall (--tabbar-h) and every tab a fifth of the screen wide, so the targets stay above
 * 44px down to a 320px phone.
 */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-rule pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map((item) => {
          const on = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={clsx("focus-inset group flex h-[63px] flex-col items-center justify-center gap-1 rounded-lg transition-colors", on ? "text-ink" : "text-ink-3")}
              >
                <span
                  className={clsx(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    on ? "bg-white/10" : "group-active:bg-white/5",
                  )}
                >
                  <Icon size={19} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="max-w-full truncate px-0.5 text-[11px] leading-none font-medium">{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
