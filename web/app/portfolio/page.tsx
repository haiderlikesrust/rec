import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Portfolio"
        title="Your coins"
        sub="Positions, average entries, the airdrops you're earning and protection you can claim, in one place."
      />
      <PortfolioView />
    </div>
  );
}
