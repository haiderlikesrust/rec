import { cache } from "react";
import type { Payout } from "@gantry/shared";

/*
 * The payout record, read on the server for the page's metadata and its link preview image.
 * The browser goes through the same-origin /api proxy (lib/data.ts); the server talks to the backend directly:
 * BACKEND_URL (what next.config.ts proxies to), else an absolute NEXT_PUBLIC_API_URL, else the local default.
 */
const API = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:42069";

/** The longest id worth asking the backend about: a transaction signature, a colon and a small index. */
const MAX_ID = 120;

/** The id as the backend knows it. A route segment can arrive still percent-encoded (`%3A` for the colon). */
export function payoutId(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * One paid loss cover. `null`: the backend has no such payout. `undefined`: the backend did not answer in time,
 * so nothing is known. Callers fall back to generic words and a generic image in both cases.
 */
export const loadPayout = cache(async (id: string): Promise<Payout | null | undefined> => {
  if (!id || id.length > MAX_ID) return null;
  try {
    const res = await fetch(`${API}/api/payouts/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return (await res.json()) as Payout;
  } catch {
    return undefined;
  }
});
