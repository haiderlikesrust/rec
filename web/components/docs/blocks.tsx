import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable, Panel, SectionHeading, Td, Th } from "@/components/ui";

/*
 * The building blocks of the guide: a titled section, running text, a small two- or three-column table in a card,
 * and a disclosure for the detail most readers can skip.
 */

/**
 * One section of the guide. The id is the anchor the list of sections and other pages link to; the offset keeps the
 * title clear of the navbar.
 */
export function DocSection({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-[calc(var(--chrome-top)+1.5rem)] space-y-5 outline-none">
      <SectionHeading title={<span id={`${id}-title`}>{title}</span>} />
      {children}
    </section>
  );
}

/** Running text. The article sets the reading measure, so the text fills it. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("longform max-w-none [&>:first-child]:mt-0", className)}>{children}</div>;
}

/**
 * A small table in a card: a name on the left, one or two readings on the right. Each row is
 * `[label, value, value?]`. `head` names the columns; leave it out when each row explains itself. `caption` is read
 * by screen readers.
 */
export function FigureTable({ caption, head, rows }: { caption: string; head?: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <Panel>
      <DataTable caption={caption}>
        {head && (
          <thead>
            <tr>
              {head.map((h, i) => (
                <Th key={i} num={i > 0} className={i > 0 ? "whitespace-normal" : undefined}>
                  {h}
                </Th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, i) =>
                i === 0 ? (
                  <Td key={i} className="py-2.5 whitespace-normal text-ink">
                    {cell}
                  </Td>
                ) : (
                  <Td key={i} num className="py-2.5 whitespace-normal">
                    {cell}
                  </Td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Panel>
  );
}

/** Detail most readers can skip, closed until asked for: a line to click, the content under it. */
export function Details({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex max-w-full list-none items-center gap-2 py-1 text-[15px] font-medium text-ink-2 transition-colors group-open:text-ink hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-3 transition-transform group-open:rotate-90" />
        <span>{summary}</span>
      </summary>
      <div className="mt-3 space-y-4 pb-2 sm:pl-6">{children}</div>
    </details>
  );
}

/** A literal inside a sentence, such as an API path. Breaks anywhere so it cannot overflow a phone. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="break-all">{children}</code>;
}
