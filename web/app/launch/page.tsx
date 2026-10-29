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
        sub="0.01 SOL and one transaction: a fixed 1B supply on its own Meteora pool, paired with SOL, a stablecoin or any of 120+ tokenized stocks. Starts at a $2.5k market cap, graduates at $30k. No creator tax."
      />
      <LaunchForm />
    </div>
  );
}
