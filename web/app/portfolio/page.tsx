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
        sub="What you hold, what it's worth, your entries and P&L, and the protection paid on your losing sales, in one place."
      />
      <PortfolioView />
    </div>
  );
}
