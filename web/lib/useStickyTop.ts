"use client";

import { useEffect, useState } from "react";

/**
 * The `top` for a sticky side column that may be taller than the screen. A column that fits sticks `offset` px from
 * the top; a taller one scrolls with the page until its bottom is in view and sticks there, so every panel in it can
 * be reached without an inner scrollbar.
 */
export function useStickyTop(el: HTMLElement | null, offset = 80, gap = 16) {
  const [top, setTop] = useState(offset);
  useEffect(() => {
    if (!el) return;
    const update = () => setTop(Math.min(offset, window.innerHeight - el.offsetHeight - gap));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [el, offset, gap]);
  return top;
}
