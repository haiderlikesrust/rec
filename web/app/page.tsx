import { CoinList } from "@/components/home/CoinList";
import { Explainers } from "@/components/home/Explainers";
import { Intro } from "@/components/home/Intro";

/** The front door: what this is and the way to launch, the idea in three cards, then the coins. */
export default function Home() {
  return (
    <div className="space-y-10 sm:space-y-12 lg:space-y-16">
      <Intro />
      <Explainers />
      <CoinList />
    </div>
  );
}
