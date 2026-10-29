import clsx from "clsx";

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
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <div className="relative h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-sunk shadow-[inset_0_0_0_1px_var(--line)]">
        <div
          className={clsx("h-full rounded-full", graduated ? "bg-up" : "spectrum")}
          style={{
            width: `${Math.max(p * 100, p > 0 ? 4 : 0)}%`,
            boxShadow: graduated ? "0 0 12px -2px var(--up)" : "0 0 12px -3px var(--accent)",
          }}
        />
      </div>
      {showLabel && (
        <span className={clsx("num w-11 shrink-0 text-right text-xs", graduated ? "text-up" : "text-muted")}>
          {graduated ? "Grad" : `${Math.floor(p * 100)}%`}
        </span>
      )}
    </div>
  );
}
