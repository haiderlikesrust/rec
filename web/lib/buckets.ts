import { buckets as sharedBuckets, type BucketKey } from "@cook/shared";

/** The one place bucket colors are defined. Every split visual reads from here. */
export const bucketColor: Record<BucketKey, string> = {
  protection: "var(--b-protection)",
  otcReserve: "var(--b-otc)",
  mainBuyback: "var(--b-main)",
  coinBuyback: "var(--b-coin)",
  airdrop: "var(--b-airdrop)",
};

/** Static hex values for contexts that can't resolve CSS variables (canvas charts, SVG exports). */
export const bucketHex: Record<BucketKey, string> = {
  protection: "#6D5BFF",
  otcReserve: "#14B8A6",
  mainBuyback: "#F59E0B",
  coinBuyback: "#F2545B",
  airdrop: "#3B82F6",
};

export const buckets = sharedBuckets.map((b) => ({ ...b, color: bucketColor[b.key], hex: bucketHex[b.key] }));
export type { BucketKey };
