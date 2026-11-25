"use client";

import clsx from "clsx";
import { useEffect, useId, useState } from "react";

export type DocEntry = { id: string; label: string };

/**
 * The section the reader is in: the last one whose title has crossed a line a little below the navbar. At the very
 * end of the page the last section wins, since a short final section never reaches that line.
 */
function useCurrentSection(ids: string[]) {
  const key = ids.join(" ");
  const [current, setCurrent] = useState(ids[0] ?? "");

  useEffect(() => {
    const nodes = key
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null);
    if (!nodes.length) return;

    let frame = 0;
    const read = () => {
      frame = 0;
      const line = Math.min(window.innerHeight * 0.35, 260);
      let hit = nodes[0]!.id;
      for (const n of nodes) if (n.getBoundingClientRect().top <= line) hit = n.id;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setCurrent(atEnd ? nodes[nodes.length - 1]!.id : hit);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };

    read();
    // the browser jumps to a #hash after the first paint
    const settle = window.setTimeout(read, 300);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [key]);

  return current;
}

/**
 * The guide's list of sections. From 1024px it is a plain column of links that stays in view beside the text, the
 * current section a shade brighter. Below that it is a single native select at the top of the page.
 */
export function DocsIndex({ sections }: { sections: DocEntry[] }) {
  const current = useCurrentSection(sections.map((s) => s.id));
  const selectId = useId();

  const jump = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView();
    target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <div className="lg:hidden">
        <label htmlFor={selectId} className="sr-only">
          Jump to a section
        </label>
        <select
          id={selectId}
          value=""
          onChange={(e) => {
            if (e.target.value) jump(e.target.value);
          }}
          className="input cursor-pointer"
        >
          <option value="">Jump to a section</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <nav aria-label="Sections" className="hidden lg:sticky lg:top-[calc(var(--chrome-top)+2rem)] lg:block lg:self-start">
        <ul className="-ml-3 space-y-1">
          {sections.map((s) => {
            const on = s.id === current;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "location" : undefined}
                  className={clsx(
                    "block rounded-full px-3 py-1.5 text-[14px] leading-snug transition-colors",
                    on ? "bg-raise text-ink" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
