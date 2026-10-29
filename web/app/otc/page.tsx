import type { Metadata } from "next";
import { Suspense } from "react";
import { OtcDesk } from "@/components/otc/OtcDesk";
import { ReserveMetric } from "@/components/otc/ReserveMetric";
import { PageHeader, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "OTC reserve" };

export default function OtcPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="OTC reserve"
        title={
          <>
            Exit size without
            <br className="hidden sm:block" /> moving the chart
          </>
        }
        sub="Sell a coin straight into a shared ETH pool, priced at the lower of spot and the 30-minute TWAP. No pool slippage, and the price doesn't move. Each coin's limit is earned by its own fees."
        aside={<ReserveMetric />}
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-[22px]" />}>
        <OtcDesk />
      </Suspense>
    </div>
  );
}
