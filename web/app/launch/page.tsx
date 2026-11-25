import type { Metadata } from "next";
import { GRADUATION_MCAP_USD, LAUNCH_RENT_SOL, START_MCAP_USD } from "@gantry/shared";
import { LaunchForm } from "@/components/launch/LaunchForm";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Launch" };

const dollars = (usd: number) => `$${usd.toLocaleString("en-US")}`;

export default function LaunchPage() {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <PageHeader
        title="Launch a coin"
        sub={`Your coin starts at a ${dollars(START_MCAP_USD)} market cap and graduates to a Raydium pool at ${dollars(GRADUATION_MCAP_USD)}. Launching costs about ${LAUNCH_RENT_SOL} SOL.`}
      />
      <LaunchForm />
    </div>
  );
}
