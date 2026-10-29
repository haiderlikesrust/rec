"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

export type DocsSection = { id: string; label: string; group?: string };

/** Sticky section nav with the active section highlighted and a spectrum line showing reading progress. */
export function DocsNav({ sections }: { sections: DocsSection[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.id);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    let raf = 0;
    const update = () => {
      raf = 0;
      // active = the last section whose heading has scrolled past the top third of the viewport
      const line = window.innerHeight * 0.33;
      let current = els[0]?.id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = els[els.length - 1]?.id;
      setActive(current);

      const article = document.getElementById("docs-article");
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      setProgress(Math.min(1, Math.max(0, (-rect.top + 120) / Math.max(total, 1))));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    const late = setTimeout(update, 400); // after the browser jumps to a #hash
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(late);
      window.removeEventListener("hashchange", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  const groups = sections.reduce<Record<string, DocsSection[]>>((acc, s) => {
    const g = s.group ?? "";
    (acc[g] ??= []).push(s);
    return acc;
  }, {});
  const activeLabel = sections.find((s) => s.id === active)?.label;

  const list = (
    <div className="space-y-6">
      {Object.entries(groups).map(([g, items]) => (
        <div key={g}>
          {g && <div className="eyebrow mb-2 px-3">{g}</div>}
          <ul className="space-y-0.5">
            {items.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    "relative block rounded-xl px-3 py-1.5 text-[13.5px] transition-all duration-200",
                    active === s.id
                      ? "bg-elev-2 font-medium text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]"
                      : "text-muted hover:translate-x-0.5 hover:text-fg",
                  )}
                >
                  {active === s.id && <span className="spectrum absolute top-1/2 -left-[17px] h-4 w-[3px] -translate-y-1/2 rounded-full" />}
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="surface flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="eyebrow shrink-0">On this page</span>
            <span className="truncate text-muted">{activeLabel}</span>
          </span>
          <ChevronDown size={16} className={clsx("shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-sunk">
          <div className="spectrum h-full rounded-full transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
        </div>
        {open && <div className="surface mt-2 rounded-2xl p-3">{list}</div>}
      </div>

      <nav className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pl-4 lg:block">
        <div className="absolute top-1 bottom-1 left-0 w-px bg-line" aria-hidden />
        <div
          className="spectrum absolute top-1 left-0 w-px rounded-full transition-[height] duration-150"
          style={{ height: `calc(${progress * 100}% - 0.5rem)` }}
          aria-hidden
        />
        {list}
      </nav>
    </>
  );
}
