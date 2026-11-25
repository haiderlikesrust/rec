import { alt as cardAlt, payoutImage } from "./card";

/** The Open Graph picture of a payout's link. Drawn in `card.tsx`; `twitter-image.tsx` is the same picture for X. */
export const alt = cardAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return payoutImage((await params).id);
}
