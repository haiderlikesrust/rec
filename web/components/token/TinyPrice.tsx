import { price } from "@/lib/format";

/** Tiny prices in DEX-screener style: 0.0₇5708 instead of 0.00000005708. */
export function TinyPrice({ value, className }: { value: number; className?: string }) {
  if (!Number.isFinite(value) || value <= 0 || value >= 0.0001) return <span className={className}>{price(value)}</span>;
  const zeros = Math.ceil(-Math.log10(value)) - 1; // zeros right after the decimal point
  const digits = Math.floor(value * 10 ** (zeros + 4))
    .toString()
    .slice(0, 4)
    .replace(/0+$/, "");
  return (
    <span className={className} title={value.toString()}>
      0.0<sub className="text-[0.65em]">{zeros}</sub>
      {digits || "0"}
    </span>
  );
}
