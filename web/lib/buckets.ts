import { buckets as sharedBuckets, type BucketKey } from "@cook/shared";

/** The one place bucket colors are defined. Every split visual reads from here. */
export const bucketColor: Record<BucketKey, string> = {
  protection: "var(--b-protection)",
  otcReserve: "var(--b-otc)",
};

/** Static hex values for contexts that can't resolve CSS variables (canvas charts, SVG exports). */
export const bucketHex: Record<BucketKey, string> = {
  protection: "#2BD99A",
  otcReserve: "#5B95FF",
};

export const buckets = sharedBuckets.map((b) => ({ ...b, color: bucketColor[b.key], hex: bucketHex[b.key] }));
export type { BucketKey };
