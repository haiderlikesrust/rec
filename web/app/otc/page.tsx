import type { Metadata } from "next";
import { Suspense } from "react";
import { otcPolicy } from "@cook/shared";
import { OtcDesk } from "@/components/otc/OtcDesk";
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
            <br className="hidden sm:block" /> <span className="text-spectrum">moving the chart</span>
          </>
        }
        sub={`Sell a coin straight into a shared SOL reserve at the lower of spot and the ${otcPolicy.twapSeconds / 60}-minute TWAP, minus the ${otcPolicy.spreadBps / 100}% spread. The reserve burns what it buys in the same transaction, so the chart doesn't move. Each coin's limit is earned by its own fees.`}
      />
      {/* OtcDesk reads ?coin= from the URL */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Skeleton className="h-[360px] rounded-[32px]" />
            <Skeleton className="h-[480px] rounded-[24px]" />
          </div>
        }
      >
        <OtcDesk />
      </Suspense>
    </div>
  );
}
