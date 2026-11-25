import type { Metadata } from "next";
import { brand } from "@gantry/shared";
import { PAYOUT_CAVEAT, payoutLines, payoutPath, payoutSummary } from "@/components/shield/payout";
import { PayoutView } from "@/components/shield/PayoutView";
import { loadPayout, payoutId } from "./record";

type Props = { params: Promise<{ id: string }> };

/** The title and description of the link preview. Its picture is `opengraph-image.tsx` beside this file. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = payoutId((await params).id);
  const payout = await loadPayout(id);
  const preview = { siteName: brand.name, type: "website" as const, url: payoutPath(id) };
  const card = { card: "summary_large_image" as const, ...(brand.xHandle ? { site: brand.xHandle, creator: brand.xHandle } : {}) };

  if (!payout) {
    const title = `A payout from ${brand.shield}`;
    const description = `${brand.shield} is the protection fund on ${brand.name}: it sends back part of a loss. ${PAYOUT_CAVEAT}`;
    return {
      title,
      description,
      // nothing to index at a link that matches no payout
      robots: payout === null ? { index: false } : undefined,
      openGraph: { ...preview, title, description },
      twitter: { ...card, title, description },
    };
  }

  const title = payoutLines(payout).join(" ");
  const description = `${payoutSummary(payout)} ${PAYOUT_CAVEAT}`;
  return {
    title: title.replace(/\.$/, ""),
    description,
    alternates: { canonical: payoutPath(id) },
    openGraph: { ...preview, title, description },
    twitter: { ...card, title, description },
  };
}

export default async function PayoutPage({ params }: Props) {
  return <PayoutView id={payoutId((await params).id)} />;
}
