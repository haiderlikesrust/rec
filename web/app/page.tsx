import { CoinExplorer } from "@/components/home/CoinExplorer";
import { FeeBuckets } from "@/components/home/FeeBuckets";
import { Hero } from "@/components/home/Hero";
import { LaunchCta } from "@/components/home/LaunchCta";
import { LiveTicker } from "@/components/home/LiveTicker";
import { Trending } from "@/components/home/Trending";

export default function Home() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <div className="space-y-10">
        <Hero />
        <LiveTicker />
      </div>
      <Trending />
      <CoinExplorer />
      <FeeBuckets />
      <LaunchCta />
    </div>
  );
}
