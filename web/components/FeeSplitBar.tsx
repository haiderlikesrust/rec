import clsx from "clsx";
import { buckets } from "@/lib/buckets";

/** Five-segment bar of the fixed fee split, optionally with a legend. */
export function FeeSplitBar({ legend = true, className }: { legend?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-3 w-full gap-1">
        {buckets.map((b) => (
          <div
            key={b.key}
            className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${b.bps / 100}%`,
              background: b.color,
              boxShadow: `0 0 16px -2px color-mix(in srgb, ${b.color} 55%, transparent)`,
            }}
            title={`${b.label} ${b.bps / 100}%`}
          />
        ))}
      </div>
      {legend && (
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {buckets.map((b) => (
            <li key={b.key} className="flex items-center gap-2.5 text-[13px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: b.color }} />
              <span className="text-muted">{b.label}</span>
              <span className="num ml-auto font-medium">{b.bps / 100}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BucketDot({ color, className }: { color: string; className?: string }) {
  return <span className={clsx("inline-block h-2.5 w-2.5 shrink-0 rounded-[4px]", className)} style={{ background: color }} />;
}
