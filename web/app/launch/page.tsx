import type { Metadata } from "next";
import { LaunchForm } from "@/components/launch/LaunchForm";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Launch a coin" };

export default function LaunchPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Launch"
        title="Launch a coin"
        sub="0.0005 ETH and one transaction: a fixed 1B supply, its own pool, and every token locked as liquidity forever. No migration, no creator tax."
      />
      <LaunchForm />
    </div>
  );
}
