import clsx from "clsx";

const tint: Record<string, string> = {
  ETH: "var(--b-protection)",
  USDG: "var(--b-otc)",
};

/** Pair label with a tinted dot: ETH violet, USDG teal, tokenized stocks amber. */
export function QuoteChip({ symbol, className, pair }: { symbol: string; className?: string; pair?: string }) {
  const color = tint[symbol] ?? "var(--b-main)";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk/70 px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {pair ? `${pair}/${symbol}` : symbol}
    </span>
  );
}
