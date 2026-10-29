"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

// ---------------------------------------------------------------- surfaces

export function Card({
  className,
  children,
  hover,
  featured,
}: {
  className?: string;
  children: ReactNode;
  hover?: boolean;
  featured?: boolean;
}) {
  return (
    <div className={clsx("rounded-[22px]", featured ? "ring-spectrum shadow-card" : "surface", hover && "surface-hover", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, aside, sub, icon }: { title: ReactNode; aside?: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {sub && <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

// ---------------------------------------------------------------- buttons

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "up" | "down";
  size?: "sm" | "md" | "lg";
};

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const buttonVariant = {
  primary: "btn-primary",
  secondary: "border border-line-strong bg-elev text-fg hover:bg-elev-2 hover:border-line-strong shadow-card",
  ghost: "text-muted hover:bg-sunk hover:text-fg",
  up: "bg-up text-[#04130d] hover:brightness-110 shadow-[0_8px_24px_-10px_var(--up)]",
  down: "bg-down text-white hover:brightness-110 shadow-[0_8px_24px_-10px_var(--down)]",
} as const;

const buttonSize = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[15px]" } as const;

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button {...props} className={clsx(buttonBase, buttonVariant[variant], buttonSize[size], className)} />;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <Link href={href} className={clsx(buttonBase, buttonVariant[variant], buttonSize[size], className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- labels

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "up" | "down" | "outline";
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-sunk text-muted",
        tone === "outline" && "border border-line text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "up" && "bg-up-soft text-up",
        tone === "down" && "bg-down-soft text-down",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, className, dot }: { children: ReactNode; className?: string; dot?: string }) {
  return (
    <p className={clsx("eyebrow flex items-center gap-2", className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  aside,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2.5">{eyebrow}</Eyebrow>}
        <h2 className="font-display text-2xl font-semibold sm:text-[32px] sm:leading-[1.1]">{title}</h2>
        {sub && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{sub}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, aside, eyebrow }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pt-4">
      <div className="min-w-0 animate-fade-up">
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h1 className="font-display text-[34px] leading-[1.05] font-semibold sm:text-5xl">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

/** Rounded square with a soft tinted background, for section and feature icons. */
export function IconTile({ children, color = "var(--accent)", size = 40, className }: { children: ReactNode; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-xl", className)}
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- states

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer rounded-lg", className)} />;
}

export function ErrorState({ title = "Couldn't load this", detail, className }: { title?: string; detail?: string; className?: string }) {
  return (
    <div className={clsx("rounded-[22px] border border-dashed border-line-strong px-5 py-10 text-center", className)}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
        {detail ?? "The Recur API isn't reachable right now. This view refreshes automatically."}
      </p>
    </div>
  );
}

export function EmptyState({ title, detail, action, className }: { title: string; detail?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-[22px] border border-dashed border-line-strong px-5 py-12 text-center", className)}>
      <div className="spectrum mx-auto mb-4 h-1 w-10 rounded-full opacity-80" />
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{detail}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- inputs

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={clsx("inline-flex rounded-full border border-line bg-sunk/80 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-full font-medium whitespace-nowrap transition-all duration-200",
            size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
            value === o.value
              ? "bg-elev-2 text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--line-strong)]"
              : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-2 flex items-baseline justify-between gap-3 text-[13px] font-medium">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-12 w-full rounded-2xl border border-line bg-sunk px-4 text-sm outline-none transition-all placeholder:text-faint hover:border-line-strong focus:border-accent focus:bg-elev focus:shadow-[0_0_0_4px_var(--accent-soft)]",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------- numbers

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1.5 truncate text-xl font-medium">{value}</div>
      {sub && <div className="num mt-0.5 truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}

export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-between gap-4 py-2 text-sm", className)}>
      <span className="text-muted">{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}

export function Change({ value, className, pill }: { value: number | null | undefined; className?: string; pill?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className={clsx("num text-faint", className)}>—</span>;
  const up = value >= 0;
  return (
    <span
      className={clsx(
        "num",
        up ? "text-up" : "text-down",
        pill && "inline-flex rounded-full px-2 py-0.5",
        pill && (up ? "bg-up-soft" : "bg-down-soft"),
        className,
      )}
    >
      {up ? "+" : ""}
      {value.toFixed(Math.abs(value) >= 100 ? 0 : 1)}%
    </span>
  );
}

/** Counts up to `value` when it first appears (and eases between later updates). */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
}
