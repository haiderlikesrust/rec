"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, CircleAlert } from "lucide-react";
import Link from "next/link";
import { brand } from "@gantry/shared";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/*
 * The primitives of the system. DESIGN.md documents each one with an example.
 * Everything is soft and round: cards are quiet fills separated by space, titles and labels are sentence case in
 * the one typeface, numbers use figures of equal width, and the main action is a near-white rounded button.
 */

// ---------------------------------------------------------------- tones

/** The colour meanings. `neutral` is ink; the rest are the tokens of the same name. */
export type Tone = "neutral" | "signal" | "gain" | "loss" | "shield" | "desk" | "fleet";

/** The CSS colour of a tone, for inline styles, SVG and charts. */
export const toneVar: Record<Tone, string> = {
  neutral: "var(--ink-2)",
  signal: "var(--signal)",
  gain: "var(--gain)",
  loss: "var(--loss)",
  shield: "var(--shield)",
  desk: "var(--desk)",
  fleet: "var(--fleet)",
};

const toneText: Record<Tone, string> = {
  neutral: "text-ink-2",
  signal: "text-signal",
  gain: "text-gain",
  loss: "text-loss",
  shield: "text-shield",
  desk: "text-desk",
  fleet: "text-fleet",
};
const toneBg: Record<Tone, string> = {
  neutral: "bg-ink",
  signal: "bg-signal",
  gain: "bg-gain",
  loss: "bg-loss",
  shield: "bg-shield",
  desk: "bg-desk",
  fleet: "bg-fleet",
};
const toneTint: Record<Tone, string> = {
  neutral: "bg-white/8",
  signal: "bg-signal-tint",
  gain: "bg-gain-tint",
  loss: "bg-loss-tint",
  shield: "bg-shield-tint",
  desk: "bg-desk-tint",
  fleet: "bg-fleet-tint",
};

// ---------------------------------------------------------------- panels

type PanelTag = "div" | "section" | "article" | "aside" | "li" | "form";

/**
 * A card: the unit every view is built from. A soft fill with a barely visible edge and round corners; cards are
 * separated by space. A `Panel` inside a `Panel` becomes a smaller inner block one step lighter.
 *
 * `accent` tints the edge with a tone: use it to tie a card to a concept (shield, desk, fleet) or, with `signal`,
 * to mark the one card a view is about. `interactive` adds the hover state of a clickable card.
 */
export function Panel({
  as: Tag = "div",
  className,
  children,
  accent,
  interactive,
  style,
  ...rest
}: {
  as?: PanelTag;
  className?: string;
  children: ReactNode;
  accent?: Tone;
  interactive?: boolean;
} & Omit<ComponentProps<"div">, "className" | "children">) {
  const Comp = Tag as "div";
  return (
    <Comp
      {...rest}
      className={clsx("panel", interactive && "panel-interactive", className)}
      style={accent ? { borderColor: `color-mix(in srgb, ${toneVar[accent]} 26%, transparent)`, ...style } : style}
    >
      {children}
    </Comp>
  );
}

/**
 * Lays cards out in a grid with a gap. Give the columns in `className`
 * (`grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`). Every child becomes a card. Inside a `Panel` the
 * grid only lays its children out, so there are never boxes inside boxes.
 */
export function PanelGrid({ className, children, as: Tag = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "ul" | "dl" }) {
  return <Tag className={clsx("panel-grid", className)}>{children}</Tag>;
}

/**
 * The heading row of a card: its title on the left, a control or a figure on the right. `index` is accepted and
 * not shown.
 */
export function PanelHeader({
  label,
  aside,
  className,
  as: Tag = "h3",
}: {
  index?: string | number;
  label: ReactNode;
  aside?: ReactNode;
  className?: string;
  as?: "h2" | "h3" | "h4" | "p";
}) {
  return (
    <div className={clsx("panel-header", className)}>
      <Tag className="display-3 min-w-0 text-ink">{label}</Tag>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}

/** A card's padded interior. */
export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("panel-body", className)}>{children}</div>;
}

// ---------------------------------------------------------------- buttons

export type ButtonVariant = "primary" | "secondary" | "ghost" | "solid" | "gain" | "loss";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * The classes of a button, for elements that are not a `Button` or `ButtonLink` (a `<label>` over a file input,
 * a `<summary>`). Heights: sm 32px, md 40px, lg 48px. Use `lg` for the main action on a phone.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  block,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}) {
  return clsx("btn", `btn-${variant}`, `btn-${size}`, block && "w-full");
}

type ButtonProps = ComponentProps<"button"> & {
  /**
   * `primary` is the near-white button: one per view. `secondary` is a quiet filled button. `ghost` is text only.
   * `solid` looks like `primary`. `gain` and `loss` are buy and sell.
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** full width */
  block?: boolean;
};

export function Button({ variant = "primary", size = "md", block, className, ...props }: ButtonProps) {
  return <button {...props} className={clsx(buttonClass({ variant, size, block }), className)} />;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  block,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: Exclude<ButtonVariant, "gain" | "loss">;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} & Omit<ComponentProps<"a">, "href" | "className" | "children">) {
  return (
    <Link {...rest} href={href} className={clsx(buttonClass({ variant, size, block }), className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- labels

/**
 * A status: a small pill tinted in its tone. `solid` fills it (dark text) for the one or two states that must be
 * seen first ("Graduated", "Official").
 */
export function Badge({
  children,
  tone = "neutral",
  solid,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap",
        solid ? [toneBg[tone], "text-ink-inverse"] : [toneTint[tone], toneText[tone]],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A small pill for a literal value: a ticker, a shortened address, a pair. Not a status (that is `Badge`).
 * Keeps the case it is given.
 */
export function Tag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx("num inline-flex h-[22px] items-center gap-1 rounded-full bg-white/8 px-2 text-xs leading-none whitespace-nowrap text-ink-2", className)}
    >
      {children}
    </span>
  );
}

/** A 6px status dot. `blink` makes it breathe slowly for something live. */
export function Marker({ tone = "neutral", blink, className }: { tone?: Tone; blink?: boolean; className?: string }) {
  return <span aria-hidden className={clsx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", toneBg[tone], blink && "animate-pulse", className)} />;
}

/**
 * A small quiet line above a title. `dot` (a CSS colour) puts a dot in front. `index` is accepted and not shown.
 * Use it rarely: most blocks need no line above their title.
 */
export function Eyebrow({
  children,
  className,
  dot,
}: {
  children?: ReactNode;
  className?: string;
  index?: string | number;
  dot?: string;
}) {
  if (children == null) return null;
  return (
    <p className={clsx("eyebrow flex items-center gap-2", className)}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

/**
 * Opens a section inside a page: an `h2`, an optional line under it, an optional control on the right.
 * `index` and `eyebrow` are accepted and not shown.
 */
export function SectionHeading({
  title,
  sub,
  aside,
  className,
}: {
  index?: string | number;
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0">
        <h2 className="display-2">{title}</h2>
        {sub && <p className="mt-1.5 max-w-2xl text-ink-2">{sub}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/**
 * Opens every page: the `h1`, one plain sentence under it, and optionally the page's main action or figure on the
 * right. `crumb` is a small line above the title for a way back ("← Coins"). `index` and `eyebrow` are accepted
 * and not shown.
 */
export function PageHeader({
  title,
  sub,
  aside,
  crumb,
  className,
}: {
  index?: string | number;
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  crumb?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx("flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10", className)}>
      <div className="min-w-0">
        {crumb && <div className="eyebrow mb-3">{crumb}</div>}
        <h1 className="display-1">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-2 sm:text-[17px]">{sub}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/**
 * A soft rounded tile for an icon, tinted with a colour. Use it sparingly. `color` takes any CSS colour
 * (`var(--shield)`, `toneVar.fleet`).
 */
export function IconTile({ children, color = "var(--ink-2)", size = 40, className }: { children: ReactNode; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        color,
        borderRadius: Math.round(size * 0.32),
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- states

/** A placeholder while data loads: a soft block that breathes, sized by `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-lg bg-raise", className)} />;
}

/** A view that failed to load. */
export function ErrorState({ title = "Couldn't load this", detail, className }: { title?: string; detail?: string; className?: string }) {
  return (
    <div role="alert" className={clsx("flex flex-col items-center px-6 py-10 text-center", className)}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-loss-tint text-loss">
        <CircleAlert size={18} aria-hidden />
      </span>
      <p className="display-3 mt-4">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">
        {detail ?? `${brand.name} isn't reachable right now. This view refreshes automatically.`}
      </p>
    </div>
  );
}

/** A view with nothing in it yet: say what would appear here and offer the action that fills it. */
export function EmptyState({ title, detail, action, className }: { title: string; detail?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center px-6 py-10 text-center", className)}>
      <p className="display-3">{title}</p>
      {detail && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">{detail}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** An inline note: a soft tinted block, an optional title in its tone, body text. */
export function Notice({ tone = "neutral", title, children, className }: { tone?: Tone; title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "loss" ? "alert" : "note"}
      className={clsx("rounded-lg px-4 py-3.5 text-sm leading-relaxed text-ink-2", tone === "neutral" ? "bg-white/5" : toneTint[tone], className)}
    >
      {title && <p className={clsx("mb-1 font-semibold", tone === "neutral" ? "text-ink" : toneText[tone])}>{title}</p>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- choosing

type Option<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

/** Arrow keys move the choice along a row of options; only the chosen one is in the tab order. */
function useRoving<T extends string>(options: Option<T>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let next = i;
    if (step) {
      for (let n = 0; n < options.length; n++) {
        next = (next + step + options.length) % options.length;
        if (!options[next]!.disabled) break;
      }
    } else if (e.key === "Home") next = options.findIndex((o) => !o.disabled);
    else if (e.key === "End") next = options.length - 1 - [...options].reverse().findIndex((o) => !o.disabled);
    else return;
    e.preventDefault();
    if (next < 0 || next === i) return;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  const tabIndex = (o: Option<T>) => (o.value === value || !options.some((x) => x.value === value) ? 0 : -1);
  return { refs, onKeyDown, tabIndex };
}

/**
 * A segmented control: a soft rounded track, the chosen option on a lighter pill. For picking one value of a
 * setting (side, interval, sort). For switching between views of a card use `Tabs`.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  block,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  className?: string;
  /** sm 32px, md 40px */
  size?: "sm" | "md";
  /** full width, equal segments */
  block?: boolean;
  "aria-label"?: string;
}) {
  const { refs, onKeyDown, tabIndex } = useRoving(options, value, onChange);
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx("gap-0.5 rounded-md bg-white/6 p-[3px]", block ? "flex w-full" : "inline-flex", className)}>
      {options.map((o, i) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            tabIndex={tabIndex(o)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-ink-3",
              block && "min-w-0 flex-1",
              size === "sm" ? "h-[26px] px-2.5 text-[13px]" : "h-[34px] px-3.5 text-sm",
              on ? "bg-white/12 text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tabs: a row of rounded labels, the current one on a soft fill. For switching between views of the same card
 * (trades / holders). Put it at the top of a `Panel`, under or instead of a `PanelHeader`. Render the chosen view
 * yourself; pass `count` to show a number beside a label.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  className,
  aside,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: (Option<T> & { count?: ReactNode })[];
  className?: string;
  /** controls on the right end of the row */
  aside?: ReactNode;
  "aria-label"?: string;
}) {
  const { refs, onKeyDown, tabIndex } = useRoving(options, value, onChange);
  return (
    <div className={clsx("tabs-row flex items-center justify-between gap-4", className)}>
      <div role="tablist" aria-label={ariaLabel} className="no-scrollbar -m-1 flex min-w-0 gap-1 overflow-x-auto p-1">
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={o.disabled}
              tabIndex={tabIndex(o)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onChange(o.value)}
              className={clsx(
                "group inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-ink-3",
                on ? "bg-white/10 text-ink" : "text-ink-2 hover:bg-white/5 hover:text-ink",
              )}
            >
              {o.label}
              {o.count != null && <span className={clsx("num text-[13px] font-normal", on ? "text-ink-2" : "text-ink-3 group-hover:text-ink-2")}>{o.count}</span>}
            </button>
          );
        })}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- inputs

/**
 * A labelled control: the label on the left, an optional hint on the right, the control, then an error line.
 * It renders a `<label>`, so wrap exactly one control; for a group of controls pass `as="div"`.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  as: Tag = "label",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "label" | "div";
}) {
  return (
    <Tag className={clsx("block", className)}>
      <span className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        {hint && <span className="num text-[13px] text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && (
        <span role="alert" className="mt-2 block text-[13px] text-loss">
          {error}
        </span>
      )}
    </Tag>
  );
}

/** A 44px text input: a soft filled field. `mono` sets amounts in figures of equal width. */
export function Input({ className, invalid, mono, ...props }: ComponentProps<"input"> & { invalid?: boolean; mono?: boolean }) {
  return <input {...props} aria-invalid={invalid || props["aria-invalid"] || undefined} className={clsx("input", mono && "num", className)} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea {...props} aria-invalid={invalid || props["aria-invalid"] || undefined} className={clsx("input", className)} />;
}

// ---------------------------------------------------------------- numbers

const statSize = {
  sm: "text-base leading-snug",
  md: "text-[22px] leading-tight tracking-[-0.015em]",
  lg: "text-[28px] leading-[1.1] tracking-[-0.025em] sm:text-[36px]",
} as const;

/**
 * A figure: a quiet label above a clear number, an optional line under it. It draws no box of its own: put it in
 * a card, or put several in a `PanelGrid` (give each `className="p-5"`). `tone` colours the value.
 */
export function Stat({
  label,
  value,
  sub,
  className,
  tone,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  tone?: Tone;
  /** sm 16px, md 22px, lg 28–36px (one per view) */
  size?: keyof typeof statSize;
}) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="label">{label}</div>
      <div className={clsx("num mt-1.5 truncate font-semibold", statSize[size], tone ? toneText[tone] : "text-ink")}>{value}</div>
      {sub && <div className="num mt-1 truncate text-[13px] text-ink-3">{sub}</div>}
    </div>
  );
}

/** One line of a summary: the label on the left, the value on the right. */
export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-2 text-sm", className)}>
      <span className="text-ink-2">{label}</span>
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}

/**
 * A percentage change: signed, in gain or loss. `block` sets it on a soft tinted pill.
 */
export function Change({
  value,
  className,
  block,
}: {
  value: number | null | undefined;
  className?: string;
  block?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <span className={clsx("num text-ink-3", className)}>—</span>;
  const up = value >= 0;
  return (
    <span
      className={clsx(
        "num",
        up ? "text-gain" : "text-loss",
        block && "inline-flex h-[22px] items-center rounded-full px-2 text-xs font-medium",
        block && (up ? "bg-gain-tint" : "bg-loss-tint"),
        className,
      )}
    >
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1)}%
    </span>
  );
}

/**
 * A live figure. It shows its value at once; when the value changes it glides to the new one (about 300ms, easing
 * out), and snaps when motion is reduced.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    from.current = value;
    if (!Number.isFinite(value) || !Number.isFinite(a) || a === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const duration = 300;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(t >= 1 ? value : a + (value - a) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
}

// ---------------------------------------------------------------- tables

/**
 * The table shell: a horizontally scrolling wrapper around a `<table class="data-table">`. Write plain
 * `<thead>/<tbody>/<tr>` inside and use `Th` / `Td` for the cells. Rows are 56px, or 44px with `dense`. Put it
 * straight inside a `Panel` (no padding) so its first and last columns line up with the card's header.
 */
export function DataTable({
  children,
  className,
  dense,
  caption,
  minWidth,
}: {
  children: ReactNode;
  className?: string;
  dense?: boolean;
  /** read by screen readers only */
  caption?: string;
  /** below this width the table scrolls sideways instead of squeezing (e.g. 640) */
  minWidth?: number | string;
}) {
  return (
    <div className={clsx("relative overflow-x-auto", className)}>
      <table className={clsx("data-table", dense && "is-dense")} style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

type Align = "left" | "right" | "center";
const alignClass = (align?: Align, num?: boolean) => (align === "right" || (num && !align) ? "is-num" : align === "center" ? "is-center" : undefined);

/**
 * A column head. `num` right-aligns it over a numeric column. With `onSort` it becomes a button and `sorted`
 * shows the direction (and sets `aria-sort`).
 */
export function Th({
  children,
  className,
  align,
  num,
  sorted,
  onSort,
  style,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  align?: Align;
  num?: boolean;
  sorted?: "asc" | "desc" | false;
  onSort?: () => void;
  style?: CSSProperties;
} & Omit<ComponentProps<"th">, "className" | "children" | "align" | "style">) {
  const Arrow = sorted === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      {...rest}
      style={style}
      aria-sort={onSort ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
      className={clsx(alignClass(align, num), className)}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={clsx("group -mx-1.5 inline-flex h-8 items-center gap-1 rounded-sm px-1.5 font-medium transition-colors hover:text-ink", sorted && "text-ink")}
        >
          {children}
          <Arrow size={13} aria-hidden className={clsx("transition-opacity", sorted ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60")} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/** A cell. `num` right-aligns it and sets its figures at equal width. */
export function Td({
  children,
  className,
  align,
  num,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  align?: Align;
  num?: boolean;
} & Omit<ComponentProps<"td">, "className" | "children" | "align">) {
  return (
    <td {...rest} className={clsx(alignClass(align, num), num && align && align !== "right" && "num", className)}>
      {children}
    </td>
  );
}
