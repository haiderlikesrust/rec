import clsx from "clsx";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A wallet's face: a soft round avatar derived from the address. Two muted pastel shapes whose hue and placement
 * come from the address, so the same wallet always looks the same and neighbours in a list look different.
 */
export function AddressGlyph({ seed, size = 20, className }: { seed: string; size?: number; className?: string }) {
  const h = hash(seed);
  const hue = h % 360;
  const cx = 6 + ((h >> 9) % 9);
  const cy = 9 + ((h >> 13) % 8);
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={clsx("shrink-0 rounded-full", className)} aria-hidden>
      <rect width="20" height="20" fill={`hsl(${hue} 42% 72%)`} />
      <circle cx={cx} cy={cy} r="8" fill={`hsl(${(hue + 48) % 360} 46% 60%)`} />
    </svg>
  );
}
