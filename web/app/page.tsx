import { CoinExplorer } from "@/components/home/CoinExplorer";
import { Hero } from "@/components/home/Hero";
import { LaunchCta } from "@/components/home/LaunchCta";
import { LiveTicker } from "@/components/home/LiveTicker";
import { StatsBento } from "@/components/home/StatsBento";
import { Trending } from "@/components/home/Trending";
import { WhyCook } from "@/components/home/WhyCook";

export default function Home() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <div className="space-y-10">
        <Hero />
        <LiveTicker />
      </div>
      <Trending />
      <CoinExplorer />
      <StatsBento />
      <WhyCook />
      <LaunchCta />
    </div>
  );
}
