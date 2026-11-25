import type { Metadata } from "next";
import { Suspense } from "react";
import { OtcDesk } from "@/components/otc/OtcDesk";
import { PageHeader, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "OTC reserve" };

export default function OtcPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Sell to the reserve"
        sub="Sell a coin you hold for SOL at a posted price, with no slippage. The reserve is a SOL wallet filled by trading fees."
      />
      {/* OtcDesk reads ?coin= from the URL */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OtcDesk />
      </Suspense>
    </div>
  );
}
