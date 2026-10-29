import type { Metadata } from "next";
import { ProtectionView } from "@/components/protection/ProtectionView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Protection fund" };

export default function ProtectionPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Protection fund"
        title={
          <>
            Sold at a loss?
            <br className="hidden sm:block" /> <span className="text-spectrum">Part of it comes back.</span>
          </>
        }
        sub="40% of every fee on every coin, converted to SOL. Sell below your entry and part of the loss is sent to your wallet about a minute later, by how long you held and what that coin paid in. Nothing to claim."
      />
      <ProtectionView />
    </div>
  );
}
