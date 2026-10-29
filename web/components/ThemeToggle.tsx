"use client";

import { Moon, Sun } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Choice = "light" | "dark" | "system";
type Ctx = { choice: Choice; resolved: "light" | "dark"; setChoice: (c: Choice) => void };

const ThemeCtx = createContext<Ctx>({ choice: "system", resolved: "light", setChoice: () => {} });
export const useTheme = () => useContext(ThemeCtx);

const KEY = "cook-theme";

/** Runs before paint (inlined in <head>) so a saved theme never flashes. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<Choice>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setChoiceState(t);
    } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setChoice = useCallback((c: Choice) => {
    setChoiceState(c);
    try {
      if (c === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, c);
    } catch {}
    if (c === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", c);
  }, []);

  const resolved = choice === "system" ? (systemDark ? "dark" : "light") : choice;
  return <ThemeCtx.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setChoice(resolved === "dark" ? "light" : "dark")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition-colors hover:text-fg"
    >
      {resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
