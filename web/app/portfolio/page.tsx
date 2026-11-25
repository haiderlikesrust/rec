import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Your portfolio" sub="The coins you hold, how they are doing, and what you have been paid back." />
      <PortfolioView />
    </div>
  );
}
