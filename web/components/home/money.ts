import { usd } from "@/lib/format";

/**
 * Dollars for a list. From $100 to $10K the shared format keeps cents, which makes a column of market caps ragged;
 * here those are whole dollars. Everything else is the shared format.
 */
export function shortUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  return abs >= 100 && abs < 10_000 ? `$${Math.round(value).toLocaleString("en-US")}` : usd(value);
}
