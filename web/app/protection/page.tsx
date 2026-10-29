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
        sub="40% of every fee on every coin, converted to ETH. How much comes back depends on how long you held, how much that coin paid into the fund, and how big the fund is."
      />
      <ProtectionView />
    </div>
  );
}
