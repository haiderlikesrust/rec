import clsx from "clsx";
import { Check } from "lucide-react";

/** Progress to graduation as a smooth rounded bar: light while it fills, gain once the coin has graduated. */
export function GraduationBar({
  progress,
  graduated,
  className,
  showLabel = true,
}: {
  progress: number;
  graduated: boolean;
  className?: string;
  showLabel?: boolean;
}) {
  const p = graduated ? 1 : Math.max(0, Math.min(1, progress || 0));
  const pct = Math.floor(p * 100);
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <div
        role="progressbar"
        aria-label="Graduation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={graduated ? "Graduated" : `${pct}%`}
        className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={clsx("h-full rounded-full transition-[width] duration-300", graduated ? "bg-gain" : "bg-ink")}
          style={{ width: `${Math.max(p * 100, p > 0 ? 4 : 0)}%` }}
        />
      </div>
      {showLabel && (
        <span className={clsx("num flex w-9 shrink-0 justify-end text-[13px]", graduated ? "text-gain" : "text-ink-2")}>
          {graduated ? <Check size={15} strokeWidth={2.25} aria-hidden /> : `${pct}%`}
        </span>
      )}
    </div>
  );
}
