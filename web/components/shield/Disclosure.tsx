import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "@/components/ui";

/** A card that starts closed: its title is the button, the detail opens under it. For what most visitors can skip. */
export function Disclosure({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Panel className={className}>
      <details className="group rounded-[inherit]">
        <summary className="focus-inset display-3 flex min-h-16 list-none items-center justify-between gap-4 rounded-[inherit] px-[var(--card-pad)] text-ink [&::-webkit-details-marker]:hidden">
          {title}
          <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-[var(--card-pad)] pb-[var(--card-pad)]">{children}</div>
      </details>
    </Panel>
  );
}
