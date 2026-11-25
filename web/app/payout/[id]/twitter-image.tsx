import { alt as cardAlt, payoutImage } from "./card";

/** The picture of a payout's link on X: the same card as `opengraph-image.tsx`. */
export const alt = cardAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return payoutImage((await params).id);
}
