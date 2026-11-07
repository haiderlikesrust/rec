"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type DocsSection = { id: string; label: string; group?: string };

/** Which section is in view, and how far through the article the reader is (0..1). */
function useReading(sections: DocsSection[], articleId: string) {
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

      const article = document.getElementById(articleId);
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
  }, [sections, articleId]);

  return { active, progress };
}

function SectionList({ sections, active, onPick, rail }: { sections: DocsSection[]; active?: string; onPick?: () => void; rail?: boolean }) {
  const groups = sections.reduce<Record<string, DocsSection[]>>((acc, s) => {
    const g = s.group ?? "";
    (acc[g] ??= []).push(s);
    return acc;
  }, {});
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([g, items]) => (
        <div key={g}>
          {g && <div className="eyebrow mb-2 px-3">{g}</div>}
          <ul className="space-y-0.5">
            {items.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={onPick}
                  aria-current={active === s.id ? "location" : undefined}
                  className={clsx(
                    "relative flex min-h-9 items-center rounded-full px-3 py-1.5 text-[13.5px] transition-all duration-200",
                    active === s.id
                      ? "bg-elev-2 font-semibold text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]"
                      : "text-muted hover:translate-x-0.5 hover:text-fg",
                  )}
                >
                  {active === s.id && rail && (
                    <span className="spectrum absolute top-1/2 -left-[17px] h-4 w-[3px] -translate-y-1/2 rounded-full" aria-hidden />
                  )}
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The docs layout: a sticky section nav beside the article on desktop, and a sticky "On this page" bar above it on
 * phones (it lives inside the article's column so it stays pinned under the header the whole way down).
 */
export function DocsLayout({ sections, articleId = "docs-article", children }: { sections: DocsSection[]; articleId?: string; children: ReactNode }) {
  const { active, progress } = useReading(sections, articleId);
  const [open, setOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const activeLabel = sections.find((s) => s.id === active)?.label;

  // close the phone menu on a tap outside it or on Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="thin-scrollbar sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pl-4">
          <div className="absolute top-1 bottom-1 left-0 w-px bg-line" aria-hidden />
          <div
            className="spectrum absolute top-1 left-0 w-px rounded-full transition-[height] duration-150"
            style={{ height: `calc(${progress * 100}% - 0.5rem)` }}
            aria-hidden
          />
          <SectionList sections={sections} active={active} rail />
        </nav>
      </aside>

      <div className="min-w-0">
        <div ref={bar} className="glass sticky top-[72px] z-30 -mx-4 px-4 pt-2 pb-2.5 sm:-mx-6 sm:px-6 lg:hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="docs-mobile-nav"
            className="surface flex min-h-11 w-full items-center justify-between gap-3 rounded-full px-4 py-2.5 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="eyebrow shrink-0">On this page</span>
              <span className="font-display truncate font-semibold text-fg">{activeLabel}</span>
            </span>
            <ChevronDown size={16} className={clsx("shrink-0 text-muted transition-transform", open && "rotate-180")} />
          </button>
          <div className="mx-4 mt-2 h-0.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
            <div className="spectrum h-full rounded-full transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
          {open && (
            <nav
              id="docs-mobile-nav"
              aria-label="On this page"
              className="surface shadow-pop absolute inset-x-4 top-full mt-1 max-h-[65vh] overflow-y-auto rounded-[24px] p-3 sm:inset-x-6"
            >
              <SectionList sections={sections} active={active} onPick={() => setOpen(false)} />
            </nav>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
