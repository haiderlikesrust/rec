import type { Metadata } from "next";
import { GRADUATION_MCAP_USD, START_MCAP_USD } from "@cook/shared";
import { LaunchForm } from "@/components/launch/LaunchForm";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Launch a coin" };

export default function LaunchPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Launch"
        title="Launch a coin"
        sub={`0.01 SOL and one transaction: a fixed 1B supply on its own Meteora pool, paired with SOL, a stablecoin, any of 120+ tokenized stocks or any token you paste in. Starts at a $${START_MCAP_USD / 1000}k market cap, graduates at $${GRADUATION_MCAP_USD / 1000}k. No creator tax.`}
      />
      <LaunchForm />
    </div>
  );
}
