const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compact2 = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** $4.9M, $812K, $12.40, $0.0031 */
export function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 10_000) return `$${compact.format(value)}`;
  if (abs >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: abs < 100 ? 2 : 0 })}`;
  if (abs === 0) return "$0";
  return `$${sig(value, 3)}`;
}

/** Plain number with sensible precision: 1.2M, 4,210, 0.0042 */
export function num(value: number | null | undefined, maxFrac = 4): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return compact2.format(value);
  if (abs >= 1_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: Math.min(maxFrac, 3) });
  if (abs === 0) return "0";
  return sig(value, 3);
}

/** Significant-digit formatting for tiny values without scientific notation. */
export function sig(value: number, digits = 3): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const decimals = Math.min(18, Math.max(0, digits - Math.floor(Math.log10(abs)) - 1));
  return value.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** SOL amount from a number of whole SOL (for inputs and secondary labels; the UI leads with USD). */
export function sol(value: number | null | undefined, suffix = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const s = Math.abs(value) >= 1000 ? compact2.format(value) : num(value);
  return suffix ? `${s} SOL` : s;
}

/** Exact decimal string of a raw integer amount (bigint-safe, no float rounding). */
export function formatRaw(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = decimals > 0 ? (v % base).toString().padStart(decimals, "0").replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Raw base-unit decimal string or bigint → number of whole units. */
export function units(raw: string | bigint | null | undefined, decimals = 9): number {
  if (raw == null || raw === "") return 0;
  try {
    return Number(formatRaw(typeof raw === "bigint" ? raw : BigInt(raw), decimals));
  } catch {
    return 0;
  }
}

/** Raw token amount → display string. */
export function tokens(raw: string | bigint | null | undefined, decimals = 6, symbol?: string): string {
  const v = units(raw, decimals);
  const s = Math.abs(v) >= 1000 ? compact2.format(v) : num(v);
  return symbol ? `${s} ${symbol}` : s;
}

export function pct(value: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const d = opts.digits ?? (Math.abs(value) >= 100 ? 0 : 1);
  const s = `${value.toFixed(d)}%`;
  return opts.sign && value > 0 ? `+${s}` : s;
}

export function bps(value: number | bigint): string {
  const n = Number(value) / 100;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** 2mo, 3d, 5h, 12m, 40s */
export function age(unixSeconds: number, now = Date.now() / 1000): string {
  const d = Math.max(0, now - unixSeconds);
  if (d < 60) return `${Math.floor(d)}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86_400) return `${Math.floor(d / 3600)}h`;
  if (d < 86_400 * 30) return `${Math.floor(d / 86_400)}d`;
  if (d < 86_400 * 365) return `${Math.floor(d / (86_400 * 30))}mo`;
  return `${Math.floor(d / (86_400 * 365))}y`;
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Base58 address → Ab12…xY9z */
export function short(address?: string | null, chars = 4): string {
  if (!address) return "—";
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Price of one coin in its quote; tiny prices get significant digits. */
export function price(value: number | null | undefined, symbol?: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const s = value >= 1 ? num(value) : sig(value, 4);
  return symbol ? `${s} ${symbol}` : s;
}

/** Parse a user-entered decimal string safely into raw units. */
export function toRaw(input: string, decimals: number): bigint {
  const clean = input.trim().replace(/,/g, "");
  if (!clean || !/^\d*\.?\d*$/.test(clean)) return 0n;
  const [whole = "0", frac = ""] = clean.split(".");
  const f = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(f || "0");
  } catch {
    return 0n;
  }
}
