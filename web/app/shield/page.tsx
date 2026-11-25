import type { Metadata } from "next";
import { brand } from "@gantry/shared";
import { ShieldView } from "@/components/shield/ShieldView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: brand.shield };

export default function ShieldPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Part of a loss comes back"
        sub={`Sell a coin for less than you paid and ${brand.shield} sends part of the loss back to your wallet about a minute later, with nothing to claim. The fund fills from trading fees.`}
      />
      <ShieldView />
    </div>
  );
}
