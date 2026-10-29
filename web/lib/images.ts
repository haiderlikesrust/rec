/** Resolve coin image references (relative, http(s), ipfs://, ar://) to something an <img> can load. */
export function imageUrl(src?: string | null): string | null {
  if (!src) return null;
  const s = src.trim();
  if (!s) return null;
  if (s.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${s.slice(7).replace(/^ipfs\//, "")}`;
  if (s.startsWith("ar://")) return `https://arweave.net/${s.slice(5)}`;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/") || s.startsWith("data:image/")) return s;
  return null;
}
